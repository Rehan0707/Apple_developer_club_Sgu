import fs from 'node:fs';
import express from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify } from 'jose';
import { sheetsService } from './lib/sheets.js';

const random = () => randomBytes(32).toString('base64url');
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(v => { const i = v.indexOf('='); return i < 0 ? ['', ''] : [v.slice(0, i).trim(), v.slice(i + 1)]; }));
export function createApp(config = process.env) {
  const app = express();
  const pending = new Map(), sessions = new Map();
  const origin = config.PUBLIC_ORIGIN?.replace(/\/$/, '');
  let configured = false;
  try { const url = new URL(origin); configured = url.protocol === 'https:' && url.origin === origin && !['localhost','127.0.0.1','[::1]'].includes(url.hostname) && ['APPLE_CLIENT_ID','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY_PATH'].every(key => Boolean(config[key])); } catch {}
  const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
  const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };
  const cleanup = () => { for (const map of [pending, sessions]) for (const [key,value] of map) if (value.expires < Date.now()) map.delete(key); };
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => { cleanup(); res.set('Cache-Control','no-store'); res.set('X-Content-Type-Options','nosniff'); next(); });
  app.use(express.urlencoded({ extended: false, limit: '8kb' }));
  app.get('/api/auth/status', (req, res) => {
    const session = sessions.get(cookies(req)['__Host-sgu_session']);
    res.json({ available: configured, authenticated: Boolean(session) });
  });
  app.get('/api/auth/apple', (req, res) => {
    if (!configured) return res.redirect('/join/?auth=unavailable');
    if (pending.size >= 1000) return res.status(429).send('Please try again shortly.');
    const state = random(), nonce = random(), binding = random();
    pending.set(state, { nonce, binding, expires: Date.now() + 600000 });
    // Apple's cross-site form POST requires SameSite=None for this short-lived cookie.
    res.cookie('__Host-sgu_oauth', binding, { ...cookieOptions, sameSite: 'none', maxAge: 600000 });
    const query = new URLSearchParams({ client_id: config.APPLE_CLIENT_ID, redirect_uri: `${origin}/api/auth/apple/callback`, response_type: 'code', response_mode: 'form_post', scope: 'email', state, nonce });
    res.redirect(`https://appleid.apple.com/auth/authorize?${query}`);
  });
  app.post('/api/auth/apple/callback', async (req, res) => {
    const state = typeof req.body?.state === 'string' ? req.body.state : '';
    const attempt = pending.get(state);
    pending.delete(state);
    res.clearCookie('__Host-sgu_oauth', { ...cookieOptions, sameSite: 'none' });
    if (!configured || !attempt || !safeEqual(attempt.binding, cookies(req)['__Host-sgu_oauth'])) return res.redirect('/join/?auth=error');
    if (req.body.error === 'user_cancelled_authorize') return res.redirect('/join/?auth=cancelled');
    if (typeof req.body.code !== 'string') return res.redirect('/join/?auth=error');
    try {
      const key = await importPKCS8(await readFile(config.APPLE_PRIVATE_KEY_PATH, 'utf8'), 'ES256');
      const secret = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: config.APPLE_KEY_ID }).setIssuer(config.APPLE_TEAM_ID).setSubject(config.APPLE_CLIENT_ID).setAudience('https://appleid.apple.com').setIssuedAt().setExpirationTime('5m').sign(key);
      const response = await fetch('https://appleid.apple.com/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.APPLE_CLIENT_ID, client_secret: secret, code: req.body.code, grant_type: 'authorization_code', redirect_uri: `${origin}/api/auth/apple/callback` }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Token exchange failed');
      const tokens = await response.json();
      const { payload } = await jwtVerify(tokens.id_token, appleKeys, { issuer: 'https://appleid.apple.com', audience: config.APPLE_CLIENT_ID, algorithms: ['RS256'], requiredClaims: ['sub','iat','exp','nonce'] });
      if (!safeEqual(payload.nonce, attempt.nonce)) throw new Error('Invalid nonce');
      // Ephemeral verified session only. No membership or persistent account is created.
      const previous = cookies(req)['__Host-sgu_session'];
      if (previous) sessions.delete(previous);
      const session = random();
      sessions.set(session, { subject: payload.sub, expires: Date.now() + 3600000 });
      res.cookie('__Host-sgu_session', session, { ...cookieOptions, maxAge: 3600000 });
      res.redirect('/join/');
    } catch { res.redirect('/join/?auth=error'); }
  });
  app.post('/api/auth/signout', (req, res) => {
    if (!origin || req.get('origin') !== origin) return res.status(403).json({ error: 'Invalid origin' });
    sessions.delete(cookies(req)['__Host-sgu_session']);
    res.clearCookie('__Host-sgu_session', cookieOptions);
    res.sendStatus(204);
  });

  // --- MOCK AUTH FOR DEVELOPMENT ---
  app.post('/api/auth/mock/:role', (req, res) => {
    const role = req.params.role === 'admin' ? 'admin' : 'student';
    const memberId = role === 'admin' ? 'admin_123' : 'student_123';
    const previous = cookies(req)['__Host-sgu_session'];
    if (previous) sessions.delete(previous);
    
    const session = random();
    sessions.set(session, { 
      subject: memberId,
      role: role,
      memberId: memberId,
      expires: Date.now() + 3600000 
    });
    res.cookie('__Host-sgu_session', session, { ...cookieOptions, maxAge: 3600000 });
    res.sendStatus(200);
  });

  // Auth Middleware
  const requireAuth = (req, res, next) => {
    const session = sessions.get(cookies(req)['__Host-sgu_session']);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    req.session = session;
    next();
  };

  const requireAdmin = (req, res, next) => {
    const session = sessions.get(cookies(req)['__Host-sgu_session']);
    if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    req.session = session;
    next();
  };

  // --- EVENTS API ---
  app.get('/api/events', async (req, res) => {
    const rows = await sheetsService.getRows('Events');
    res.json(rows);
  });

  app.post('/api/admin/events', requireAdmin, express.json(), async (req, res) => {
    const { title, date, location, status } = req.body;
    const eventId = `EVT-${Date.now()}`;
    const success = await sheetsService.appendRow('Events', [eventId, title, date, location, status]);
    if (success) {
      res.status(201).json({ eventId, title, date, location, status });
    } else {
      res.status(500).json({ error: 'Failed to create event' });
    }
  });

  app.put('/api/admin/events/:id', requireAdmin, express.json(), async (req, res) => {
    const { id } = req.params;
    const { title, date, location, status } = req.body;
    const rows = await sheetsService.getRows('Events');
    const index = rows.findIndex(r => r.eventId === id);
    if (index === -1) return res.status(404).json({ error: 'Event not found' });
    
    const success = await sheetsService.updateRow('Events', index, [id, title, date, location, status]);
    if (success) res.json({ success: true });
    else res.status(500).json({ error: 'Failed to update event' });
  });

  app.delete('/api/admin/events/:id', requireAdmin, async (req, res) => {
    // Note: Google Sheets API requires a different endpoint to delete rows.
    // For now, let's just mark it as 'deleted' or similar, or skip if full delete is complex via append/update.
    // To properly delete, we need a batchUpdate with DeleteDimensionRequest.
    // We will just update status to 'deleted' as a soft delete for simplicity.
    const { id } = req.params;
    const rows = await sheetsService.getRows('Events');
    const index = rows.findIndex(r => r.eventId === id);
    if (index === -1) return res.status(404).json({ error: 'Event not found' });
    
    const row = rows[index];
    const success = await sheetsService.updateRow('Events', index, [id, row.title, row.date, row.location, 'deleted']);
    if (success) res.json({ success: true });
    else res.status(500).json({ error: 'Failed to delete event' });
  });

  // --- REGISTRATIONS & BADGES API ---
  app.post('/api/events/:id/register', requireAuth, async (req, res) => {
    const eventId = req.params.id;
    const memberId = req.session.memberId;
    
    const registrations = await sheetsService.getRows('Registrations');
    const existing = registrations.find(r => r.eventId === eventId && r.memberId === memberId);
    if (existing) {
      return res.status(409).json({ error: 'Already registered' });
    }

    const regId = `REG-${Date.now()}`;
    const success = await sheetsService.appendRow('Registrations', [regId, eventId, memberId, new Date().toISOString(), 'false']);
    if (!success) {
      return res.status(500).json({ error: 'Failed to register' });
    }

    // Auto-award logic: Check if this is their first event
    const myRegs = registrations.filter(r => r.memberId === memberId);
    if (myRegs.length === 0) { // They had 0 before this one
      const awardId = `AWD-${Date.now()}`;
      await sheetsService.appendRow('BadgeAwards', [awardId, 'FIRST_EVENT', memberId, new Date().toISOString(), 'system']);
    }

    res.status(201).json({ registrationId: regId, eventId, memberId, attended: false });
  });

  app.get('/api/admin/events/:id/registrations', requireAdmin, async (req, res) => {
    const eventId = req.params.id;
    const registrations = await sheetsService.getRows('Registrations');
    const eventRegs = registrations.filter(r => r.eventId === eventId);
    res.json(eventRegs);
  });

  app.post('/api/admin/badges/award', requireAdmin, express.json(), async (req, res) => {
    const { badgeId, memberId } = req.body;
    const awardId = `AWD-${Date.now()}`;
    const success = await sheetsService.appendRow('BadgeAwards', [awardId, badgeId, memberId, new Date().toISOString(), req.session.memberId]);
    if (success) {
      res.status(201).json({ awardId, badgeId, memberId });
    } else {
      res.status(500).json({ error: 'Failed to award badge' });
    }
  });

  // --- DASHBOARD API ---
  app.get('/api/me/dashboard', requireAuth, async (req, res) => {
    const memberId = req.session.memberId;
    
    // Fetch data from Sheets
    const [events, registrations, badges, badgeAwards] = await Promise.all([
      sheetsService.getRows('Events'),
      sheetsService.getRows('Registrations'),
      sheetsService.getRows('Badges'),
      sheetsService.getRows('BadgeAwards')
    ]);

    const myRegistrations = registrations.filter(r => r.memberId === memberId);
    const myEvents = myRegistrations.map(reg => {
      const eventDetails = events.find(e => e.eventId === reg.eventId) || {};
      return {
        ...reg,
        title: eventDetails.title,
        date: eventDetails.date,
        location: eventDetails.location,
        status: eventDetails.status
      };
    });

    const myBadgeAwards = badgeAwards.filter(b => b.memberId === memberId);
    const myBadges = myBadgeAwards.map(award => {
      const badgeDetails = badges.find(b => b.badgeId === award.badgeId) || {};
      return {
        ...award,
        name: badgeDetails.name,
        icon: badgeDetails.icon
      };
    });

    res.json({
      memberId,
      registeredEvents: myEvents,
      badges: myBadges
    });
  });


  // --- LOCAL JSON DB HELPER ---
  const DB_PATH = resolve('data/db.json');
  const getDb = async () => {
    try {
      const data = await readFile(DB_PATH, 'utf8');
      return JSON.parse(data);
    } catch {
      return { events: [], resources: [], badges: [], students: [] };
    }
  };
  const saveDb = async (data) => {
    await fs.promises.writeFile(DB_PATH, JSON.stringify(data, null, 2));
  };
  
  // --- RESOURCES API ---
  app.get('/api/resources', async (req, res) => {
    const db = await getDb();
    res.json(db.resources || []);
  });

  app.post('/api/admin/resources', requireAdmin, express.json(), async (req, res) => {
    const db = await getDb();
    const newResource = { id: 'RES-' + Date.now(), ...req.body };
    db.resources = db.resources || [];
    db.resources.push(newResource);
    await saveDb(db);
    res.status(201).json(newResource);
  });

  app.put('/api/admin/resources/:id', requireAdmin, express.json(), async (req, res) => {
    const db = await getDb();
    const index = (db.resources || []).findIndex(r => r.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Not found' });
    db.resources[index] = { ...db.resources[index], ...req.body };
    await saveDb(db);
    res.json(db.resources[index]);
  });

  app.delete('/api/admin/resources/:id', requireAdmin, async (req, res) => {
    const db = await getDb();
    const index = (db.resources || []).findIndex(r => r.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Not found' });
    db.resources.splice(index, 1);
    await saveDb(db);
    res.json({ success: true });
  });

  // --- BADGES API (Extended) ---
  app.get('/api/badges', async (req, res) => {
    const db = await getDb();
    res.json(db.badges || []);
  });

  app.post('/api/admin/badges', requireAdmin, express.json(), async (req, res) => {
    const db = await getDb();
    const newBadge = { id: 'BDG-' + Date.now(), ...req.body };
    db.badges = db.badges || [];
    db.badges.push(newBadge);
    await saveDb(db);
    res.status(201).json(newBadge);
  });

  app.get('/api/admin/students', requireAdmin, async (req, res) => {
    const db = await getDb();
    res.json(db.students || []);
  });

  app.post('/api/admin/badges/assign', requireAdmin, express.json(), async (req, res) => {
    const db = await getDb();
    const { badgeId, studentId } = req.body;
    
    const student = db.students.find(s => s.id === studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    
    student.badges = student.badges || [];
    if (!student.badges.includes(badgeId)) {
      student.badges.push(badgeId);
      await saveDb(db);
    }
    res.json({ success: true, student });
  });

  app.get('/api/admin/badges/:id/students', requireAdmin, async (req, res) => {
    const db = await getDb();
    const badgeId = req.params.id;
    const studentsWithBadge = (db.students || []).filter(s => (s.badges || []).includes(badgeId));
    res.json(studentsWithBadge);
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(express.static(resolve('dist')));
  return app;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  createApp().listen(port, () => console.log(`Club server: http://127.0.0.1:${port}`));
}



