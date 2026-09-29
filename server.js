import express from 'express';
import fs from 'node:fs';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify } from 'jose';
import { sheetsService } from './lib/sheets.js';
import { createJsonStore } from './lib/store.js';
import { createDataApi } from './lib/data-api.js';
import { firestoreSync } from './lib/firestore.js';

const random = () => randomBytes(32).toString('base64url');
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const validPasswordHash = encoded => {
  if (typeof encoded !== 'string') return false;
  const [scheme, salt, expected, ...extra] = encoded.split('$');
  return scheme === 'scrypt' && !extra.length && /^[a-f0-9]{32}$/i.test(salt || '') && /^[a-f0-9]{128}$/i.test(expected || '');
};
const passwordMatches = (password, encoded) => {
  if (typeof password !== 'string' || password.length > 1024 || !validPasswordHash(encoded)) return false;
  const [, salt, expected] = encoded.split('$');
  const actual = scryptSync(password, salt, 64).toString('hex');
  return safeEqual(actual, expected.toLowerCase());
};
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(v => { const i = v.indexOf('='); return i < 0 ? ['', ''] : [v.slice(0, i).trim(), v.slice(i + 1)]; }));
export function createApp(config = process.env) {
  const app = express();
  const pending = new Map(), sessions = new Map(), adminLoginAttempts = new Map(), registrationAttempts = new Map();
  const store = createJsonStore(config.DATA_FILE_PATH || 'data/db.json');
  const sheets = config.SHEETS_SERVICE || sheetsService;
  const origin = config.PUBLIC_ORIGIN?.replace(/\/$/, '');
  const adminUsername = typeof config.ADMIN_USERNAME === 'string' ? config.ADMIN_USERNAME.trim().toLowerCase() : '';
  const adminPasswordHash = typeof config.ADMIN_PASSWORD_HASH === 'string' ? config.ADMIN_PASSWORD_HASH.trim() : '';
  let configured = false;
  try { const url = new URL(origin); configured = url.protocol === 'https:' && url.origin === origin && !['localhost','127.0.0.1','[::1]'].includes(url.hostname) && ['APPLE_CLIENT_ID','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY_PATH'].every(key => Boolean(config[key])); } catch {}
  const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
  const isSecure = Boolean(origin && origin.startsWith('https://')) || (process.env.NODE_ENV === 'production');
  const cookieOptions = { httpOnly: true, secure: isSecure, sameSite: 'lax', path: '/' };
  const getSessionToken = req => {
    const c = cookies(req);
    return c['__Host-sgu_session'] || c['sgu_session'] || '';
  };
  const setSessionCookie = (res, token) => {
    // 1. __Host-sgu_session for strict HTTPS production and automated test suites
    res.cookie('__Host-sgu_session', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600000 });
    // 2. sgu_session without forced Secure on HTTP so Safari & local development work flawlessly
    res.cookie('sgu_session', token, { httpOnly: true, secure: isSecure, sameSite: 'lax', path: '/', maxAge: 3600000 });
  };
  const clearSessionCookie = res => {
    res.clearCookie('__Host-sgu_session', { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    res.clearCookie('sgu_session', { httpOnly: true, secure: isSecure, sameSite: 'lax', path: '/' });
  };
  const cleanup = () => { for (const map of [pending, sessions, adminLoginAttempts, registrationAttempts]) for (const [key,value] of map) if (value.expires < Date.now()) map.delete(key); };
  const newId = prefix => `${prefix}-${randomBytes(9).toString('hex')}`;
  const normalizedEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
  const safeText = (value, max = 160) => typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
  const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const validLocalImage = value => !value || (typeof value === 'string' && /^\/images\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes('..'));
  const trustedOrigin = req => {
    const requestOrigin = req.get('origin');
    if (!requestOrigin) return true;
    try {
      const parsed = new URL(requestOrigin);
      if (origin) return parsed.origin === origin;
      return parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    } catch { return false; }
  };
  const saveToSheets = async (tab, idField, row) => {
    if (!sheets?.isConfigured) return 'not-configured';
    try { return await sheets.upsertObject(tab, idField, row) ? 'synced' : 'pending'; }
    catch { return 'pending'; }
  };
  const sheetsReady = sheets?.isConfigured && typeof sheets.setupSchema === 'function'
    ? Promise.resolve().then(() => sheets.setupSchema()).then(Boolean, () => false)
    : Promise.resolve(true);
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => { cleanup(); res.set('Cache-Control','no-store'); res.set('X-Content-Type-Options','nosniff'); next(); });
  app.use(express.urlencoded({ extended: false, limit: '8kb' }));
  app.post(['/api/auth/admin/login', '/api/auth/login'], express.json({ limit: '8kb' }), (req, res) => {
    const requestOrigin = req.get('origin');
    if (requestOrigin) {
      try {
        const parsedOrigin = new URL(requestOrigin);
        const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname);
        if ((origin && requestOrigin !== origin) || (!origin && (!isLoopback || parsedOrigin.protocol !== 'http:'))) return res.status(403).json({ error: 'Invalid origin' });
      } catch { return res.status(403).json({ error: 'Invalid origin' }); }
    }
    if (!adminUsername || !validPasswordHash(adminPasswordHash)) return res.status(503).json({ error: 'Admin sign-in is not configured' });

    const address = req.ip || req.socket.remoteAddress || 'unknown';
    const attempt = adminLoginAttempts.get(address);
    if (attempt?.failures >= 5 && attempt.expires > Date.now()) return res.status(429).json({ error: 'Too many attempts. Try again later.' });

    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const validUsername = safeEqual(username, adminUsername);
    const validPassword = passwordMatches(password, adminPasswordHash);
    if (!validUsername || !validPassword) {
      const current = attempt?.expires > Date.now() ? attempt : { failures: 0, expires: Date.now() + 15 * 60 * 1000 };
      current.failures += 1;
      adminLoginAttempts.set(address, current);
      return res.status(current.failures >= 5 ? 429 : 401).json({ error: current.failures >= 5 ? 'Too many attempts. Try again later.' : 'Incorrect username or password.' });
    }

    adminLoginAttempts.delete(address);
    const previous = getSessionToken(req);
    if (previous) sessions.delete(previous);
    const session = random();
    sessions.set(session, { subject: adminUsername, role: 'admin', memberId: adminUsername, expires: Date.now() + 3600000 });
    setSessionCookie(res, session);
    res.json({ authenticated: true });
  });
  app.get('/api/auth/status', (req, res) => {
    const session = sessions.get(getSessionToken(req));
    res.json({ available: configured, authenticated: Boolean(session), role: session?.role || null });
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
      const generatedMemberId = `MEM-${createHash('sha256').update(payload.sub).digest('hex').slice(0, 24)}`;
      const email = normalizedEmail(payload.email || '');
      const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
      let appleName = '';
      try {
        const appleUser = typeof req.body.user === 'string' ? JSON.parse(req.body.user) : req.body.user;
        appleName = safeText([appleUser?.name?.firstName, appleUser?.name?.lastName].filter(Boolean).join(' '), 100);
      } catch {}
      const member = await store.transact(db => {
        let member = db.members.find(item => item.appleSubjectHash === generatedMemberId || (emailVerified && email && item.email === email));
        if (!member) {
          member = { id: generatedMemberId, appleSubjectHash: generatedMemberId, name: appleName, email: emailVerified ? email : '', department: '', year: '', status: 'pending', badges: [], createdAt: new Date().toISOString() };
          db.members.push(member);
        } else {
          member.appleSubjectHash = generatedMemberId;
          if (appleName && !member.name) member.name = appleName;
          if (emailVerified && email) member.email = email;
        }
        if (emailVerified && email) db.registrations.filter(row => row.email === email && !row.memberId).forEach(row => { row.memberId = member.id; });
        return member;
      });
      const previous = getSessionToken(req);
      if (previous) sessions.delete(previous);
      const session = random();
      sessions.set(session, { subject: payload.sub, role: 'member', memberId: member.id, expires: Date.now() + 3600000 });
      setSessionCookie(res, session);
      res.redirect('/student/');
    } catch { res.redirect('/join/?auth=error'); }
  });
  app.post('/api/auth/signout', (req, res) => {
    if (!trustedOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
    const token = getSessionToken(req);
    if (token) sessions.delete(token);
    clearSessionCookie(res);
    res.sendStatus(204);
  });

  // Auth Middleware
  const requireAuth = (req, res, next) => {
    const session = sessions.get(getSessionToken(req));
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    req.session = session;
    next();
  };

  const requireAdmin = (req, res, next) => {
    const session = sessions.get(getSessionToken(req));
    if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    req.session = session;
    next();
  };

  const requireMember = (req, res, next) => {
    const session = sessions.get(getSessionToken(req));
    if (!session || (session.role !== 'member' && session.role !== 'admin') || !session.memberId) {
      return res.status(401).json({ error: 'Sign in to view your member page.' });
    }
    req.session = session;
    next();
  };

  app.post('/api/auth/member/login', express.json({ limit: '8kb' }), async (req, res) => {
    if (!trustedOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const rawDept = typeof req.body?.department === 'string' ? req.body.department.trim() : '';
    const rawYear = typeof req.body?.year === 'string' ? req.body.year.trim() : '';
    const mode = req.body?.mode || 'auto'; // 'signin', 'register', or 'auto'

    if (!rawEmail || !validEmail(rawEmail)) {
      return res.status(400).json({ error: 'Please enter a valid student email address.' });
    }

    if (mode === 'signin') {
      const currentDb = await store.read();
      const existing = currentDb.members.find(item => item.email && item.email.toLowerCase() === rawEmail && item.status !== 'archived');
      if (!existing) {
        return res.status(404).json({ error: 'No member profile found with this email. Please register to create your account.' });
      }
    }

    const member = await store.transact(db => {
      let m = db.members.find(item => item.email && item.email.toLowerCase() === rawEmail && item.status !== 'archived');
      if (!m) {
        m = {
          id: `MEM-${createHash('sha256').update(rawEmail).digest('hex').slice(0, 16)}`,
          name: rawName || rawEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          email: rawEmail,
          department: rawDept || 'Computer Science & Engineering',
          year: rawYear || 'Student',
          status: 'active',
          badges: [],
          createdAt: new Date().toISOString()
        };
        db.members.push(m);
      } else {
        if (rawName && (!m.name || m.name.includes('@'))) m.name = rawName;
        if (rawDept && !m.department) m.department = rawDept;
        if (rawYear && !m.year) m.year = rawYear;
      }
      // Link any existing registrations for this email in real time
      db.registrations.filter(row => row.email && row.email.toLowerCase() === rawEmail && !row.memberId).forEach(row => {
        row.memberId = m.id;
      });
      return m;
    });

    if (sheets?.isConfigured) {
      sheets.upsertObject('Members', 'memberId', {
        memberId: member.id,
        name: member.name,
        email: member.email,
        department: member.department,
        academicYear: member.year,
        status: member.status,
        createdAt: member.createdAt
      }).catch(err => console.error('Sheet sync error:', err.message));
    }

    firestoreSync.save('members', member.id, member).catch(err => {
      console.error('Firestore member sync error:', err.message);
    });

    const previous = getSessionToken(req);
    if (previous) sessions.delete(previous);
    const session = random();
    sessions.set(session, { subject: member.email, role: 'member', memberId: member.id, expires: Date.now() + 3600000 });
    setSessionCookie(res, session);
    res.json({ authenticated: true, role: 'member', member: { id: member.id, name: member.name, email: member.email } });
  });

  app.use('/api', createDataApi({ store, sheets, sheetsReady, requireAdmin, requireMember, newId, trustedOrigin }));



  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(express.static(resolve('dist')));
  return app;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  createApp().listen(port, () => console.log(`Club server: http://127.0.0.1:${port}`));
}
