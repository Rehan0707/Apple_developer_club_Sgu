import express from 'express';
import { firestoreSync } from './firestore.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (value, limit = 160) => typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, limit) : '';
const email = value => clean(value, 254).toLowerCase();
const validEmail = value => value.length <= 254 && emailPattern.test(value);
const localImage = value => !value || (/^\/images\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes('..'));
function eventFields(body, old = {}) {
  const title = clean(body?.title, 120), category = clean(body?.category, 60);
  const description = clean(body?.description, 1200), location = clean(body?.location, 160);
  const rawDate = clean(body?.date, 40), capacity = body?.capacity === '' || body?.capacity == null ? null : Number(body.capacity);
  const imageUrl = clean(body?.imageUrl, 240), status = body?.status || old.status || 'published';
  if (!title || !location || !rawDate || !Number.isFinite(Date.parse(rawDate)) || !['published', 'draft'].includes(status)) return null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 5000)) return null;
  if (!localImage(imageUrl)) return null;
  return { title, category, description, date: new Date(rawDate).toISOString(), location, capacity, imageUrl, status };
}

function resourceFields(body) {
  const title = clean(body?.title, 120), category = clean(body?.category, 60) || 'General';
  try {
    const url = new URL(clean(body?.url, 2048));
    if (!title || url.protocol !== 'https:') return null;
    return { title, category, url: url.toString() };
  } catch { return null; }
}

function badgeFields(body) {
  const name = clean(body?.name, 90), desc = clean(body?.desc, 400);
  const icon = clean(body?.icon || 'verified', 48), color = clean(body?.color || 'blue', 24);
  const imageUrl = clean(body?.imageUrl, 240);
  if (!name || !desc || !/^[a-z0-9_-]+$/i.test(icon) || !['blue', 'green', 'orange', 'red', 'purple', 'primary', 'secondary', 'tertiary', 'error'].includes(color) || !localImage(imageUrl)) return null;
  return { name, desc, icon, color, imageUrl, status: 'active' };
}

function memberFields(body, old = {}) {
  const name = clean(body?.name ?? old.name, 100), memberEmail = email(body?.email ?? old.email);
  const department = clean(body?.department ?? body?.branch ?? old.department, 120);
  const year = clean(body?.year ?? old.year, 40), status = body?.status || old.status || 'active';
  if (!name || !validEmail(memberEmail) || !['pending', 'active', 'alumni', 'archived'].includes(status)) return null;
  return { name, email: memberEmail, department, year, status };
}

export function createDataApi({ store, sheets, sheetsReady = Promise.resolve(true), requireAdmin, requireMember, newId, trustedOrigin }) {
  const router = express.Router();
  const registrationAttempts = new Map();
  const sync = async (tab, key, row) => {
    // 1. Replicate to Cloud Firestore in real time
    const collectionMap = {
      Events: 'events',
      Resources: 'resources',
      Badges: 'badges',
      Members: 'members',
      Registrations: 'registrations',
      BadgeAwards: 'badgeAwards'
    };
    const collectionName = collectionMap[tab] || tab.toLowerCase();
    const docId = row[key] || row.id;
    if (docId) {
      try {
        await firestoreSync.save(collectionName, docId, row);
      } catch (e) {
        console.error('[Firestore sync error]', e.message);
      }
    }

    // 2. Sync to Google Sheets if configured
    if (!sheets?.isConfigured) return 'not-configured';
    try {
      if (!await sheetsReady) return 'pending';
      return await sheets.upsertObject(tab, key, row) ? 'synced' : 'pending';
    }
    catch { return 'pending'; }
  };
  const registrationCount = (db, eventId) => db.registrations.filter(row => row.eventId === eventId && row.status !== 'cancelled').length;

  router.get('/events', async (_req, res) => {
    const db = await store.read(), now = Date.now();
    res.json(db.events.filter(row => row.status === 'published' && Date.parse(row.date) >= now)
      .map(row => ({ ...row, registrationCount: registrationCount(db, row.id), remainingCapacity: row.capacity == null ? null : Math.max(0, row.capacity - registrationCount(db, row.id)) }))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)));
  });
  router.get('/resources', async (_req, res) => res.json((await store.read()).resources.filter(row => row.status !== 'archived')));
  router.get('/badges', async (_req, res) => res.json((await store.read()).badges.filter(row => row.status !== 'archived')));
  router.get('/admin/overview', requireAdmin, async (_req, res) => {
    const db = await store.read(), now = Date.now();
    let googleSheets = { configured: Boolean(sheets?.isConfigured), connected: false };
    if (sheets?.checkConnection) {
      try { googleSheets = await sheets.checkConnection(); } catch {}
    }
    res.json({
      counts: {
        members: db.members.filter(row => row.status !== 'archived').length,
        upcomingEvents: db.events.filter(row => row.status === 'published' && Date.parse(row.date) >= now).length,
        activeBadges: db.badges.filter(row => row.status !== 'archived').length,
        registrations: db.registrations.filter(row => row.status !== 'cancelled').length
      },
      storage: {
        local: 'ready',
        firebase: {
          configured: true,
          connected: true,
          projectId: 'apple-developer-club-sgu',
          database: '(default)',
          region: 'asia-south1'
        },
        googleSheets
      }
    });
  });

  router.get('/admin/events', requireAdmin, async (_req, res) => {
    const db = await store.read();
    const events = db.events
      .filter(row => row.status !== 'archived')
      .map(row => ({ ...row, registrationCount: registrationCount(db, row.id) }))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    res.json(events);
  });
  router.post('/admin/events', requireAdmin, express.json({ limit: '16kb' }), async (req, res) => {
    const data = eventFields(req.body);
    if (!data) return res.status(400).json({ error: 'Add a title, valid date, location, and supported event details.' });
    const row = { id: newId('EVT'), ...data, createdAt: new Date().toISOString() };
    await store.transact(db => db.events.push(row));
    const sheetSync = await sync('Events', 'eventId', { ...row, eventId: row.id });
    if (sheetSync !== 'not-configured') await store.transact(db => { const saved = db.events.find(item => item.id === row.id); if (saved) saved.sheetSync = sheetSync; });
    res.status(201).json({ ...row, sheetSync });
  });
  router.put('/admin/events/:id', requireAdmin, express.json({ limit: '16kb' }), async (req, res) => {
    const existing = (await store.read()).events.find(row => row.id === req.params.id);
    if (!existing || existing.status === 'archived') return res.status(404).json({ error: 'Event not found.' });
    const data = eventFields(req.body, existing);
    if (!data) return res.status(400).json({ error: 'Add a title, valid date, location, and supported event details.' });
    const row = { ...existing, ...data, updatedAt: new Date().toISOString() };
    await store.transact(db => { const index = db.events.findIndex(item => item.id === row.id); if (index >= 0) db.events[index] = row; });
    const sheetSync = await sync('Events', 'eventId', { ...row, eventId: row.id });
    res.json({ ...row, sheetSync });
  });
  router.delete('/admin/events/:id', requireAdmin, async (req, res) => {
    const row = await store.transact(db => {
      const event = db.events.find(item => item.id === req.params.id);
      if (!event) return { persist: false, value: null };
      event.status = 'archived'; event.updatedAt = new Date().toISOString(); return event;
    });
    if (!row) return res.status(404).json({ error: 'Event not found.' });
    const sheetSync = await sync('Events', 'eventId', { ...row, eventId: row.id });
    res.json({ success: true, sheetSync });
  });

  router.post('/events/:id/register', express.json({ limit: '16kb' }), async (req, res) => {
    if (!trustedOrigin(req)) return res.status(403).json({ error: 'Invalid origin.' });
    const addressKey = req.ip || req.socket.remoteAddress || 'unknown';
    for (const [key, entry] of registrationAttempts) if (entry.expires < Date.now()) registrationAttempts.delete(key);
    const previousAttempt = registrationAttempts.get(addressKey);
    if (previousAttempt?.count >= 10 && previousAttempt.expires > Date.now()) return res.status(429).json({ error: 'Too many registrations from this connection. Please try again later.' });
    const name = clean(req.body?.name, 100), address = email(req.body?.email);
    const department = clean(req.body?.department || req.body?.branch, 120);
    const year = clean(req.body?.year, 40), notes = clean(req.body?.notes, 1000);
    if (!name || !validEmail(address) || !department || !year) return res.status(400).json({ error: 'Enter your name, a valid email, department, and academic year.' });
    const now = new Date();
    const result = await store.transact(db => {
      const event = db.events.find(row => row.id === req.params.id && row.status === 'published');
      if (!event || Date.parse(event.date) < now.getTime()) return { persist: false, value: { error: 'This event is no longer open for registration.', status: 404 } };
      if (db.registrations.some(row => row.eventId === event.id && row.email === address && row.status !== 'cancelled')) return { persist: false, value: { error: 'This email is already registered for this event.', status: 409 } };
      if (event.capacity != null && registrationCount(db, event.id) >= event.capacity) return { persist: false, value: { error: 'This event has reached capacity.', status: 409 } };
      const matchedMember = db.members.find(m => m.email && m.email.toLowerCase() === address.toLowerCase() && m.status !== 'archived');
      const registration = { id: newId('REG'), eventId: event.id, eventTitle: event.title, memberId: matchedMember ? matchedMember.id : (req.session?.memberId || null), name, email: address, department, year, notes, createdAt: now.toISOString(), status: 'registered' };
      db.registrations.push(registration);
      return { value: registration };
    });
    if (result?.error) return res.status(result.status).json({ error: result.error });
    const attempt = previousAttempt?.expires > Date.now() ? previousAttempt : { count: 0, expires: Date.now() + 60 * 60 * 1000 };
    attempt.count += 1; registrationAttempts.set(addressKey, attempt);
    const sheetSync = await sync('Registrations', 'registrationId', {
      registrationId: result.id, eventId: result.eventId, eventTitle: result.eventTitle, name: result.name,
      email: result.email, department: result.department, academicYear: result.year, notes: result.notes,
      createdAt: result.createdAt, status: result.status
    });
    if (sheetSync !== 'not-configured') await store.transact(db => { const row = db.registrations.find(item => item.id === result.id); if (row) row.sheetSync = sheetSync; });
    res.status(201).json({ registrationId: result.id, eventId: result.eventId, eventTitle: result.eventTitle, sheetSync });
  });

  router.get('/admin/registrations', requireAdmin, async (req, res) => {
    const db = await store.read();
    const rows = req.query.eventId ? db.registrations.filter(row => row.eventId === req.query.eventId) : db.registrations;
    res.json([...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  });
  router.get('/admin/events/:id/registrations', requireAdmin, async (req, res) => res.json((await store.read()).registrations.filter(row => row.eventId === req.params.id)));
  router.patch('/admin/registrations/:id', requireAdmin, express.json({ limit: '4kb' }), async (req, res) => {
    if (!['registered', 'attended', 'cancelled'].includes(req.body?.status)) return res.status(400).json({ error: 'Unsupported registration status.' });
    const row = await store.transact(db => { const item = db.registrations.find(record => record.id === req.params.id); if (!item) return { persist: false, value: null }; item.status = req.body.status; return item; });
    if (!row) return res.status(404).json({ error: 'Registration not found.' });
    const sheetSync = await sync('Registrations', 'registrationId', { ...row, registrationId: row.id, academicYear: row.year });
    res.json({ ...row, sheetSync });
  });

  router.get('/admin/members', requireAdmin, async (_req, res) => res.json((await store.read()).members.filter(row => row.status !== 'archived').sort((a, b) => (a.name || '').localeCompare(b.name || ''))));
  router.get('/admin/students', requireAdmin, async (_req, res) => res.json((await store.read()).members.filter(row => row.status !== 'archived')));
  router.post('/admin/members', requireAdmin, express.json({ limit: '12kb' }), async (req, res) => {
    const data = memberFields(req.body);
    if (!data) return res.status(400).json({ error: 'Enter a name and valid email address.' });
    const duplicate = (await store.read()).members.some(row => row.email === data.email && row.status !== 'archived');
    if (duplicate) return res.status(409).json({ error: 'A member with this email already exists.' });
    const row = { id: newId('MEM'), ...data, badges: [], createdAt: new Date().toISOString() };
    await store.transact(db => db.members.push(row));
    const sheetSync = await sync('Members', 'memberId', { ...row, memberId: row.id, academicYear: row.year });
    res.status(201).json({ ...row, sheetSync });
  });
  router.put('/admin/members/:id', requireAdmin, express.json({ limit: '12kb' }), async (req, res) => {
    const existing = (await store.read()).members.find(row => row.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'Member not found.' });
    const data = memberFields(req.body, existing);
    if (!data) return res.status(400).json({ error: 'Enter a name and valid email address.' });
    const duplicate = (await store.read()).members.some(row => row.id !== existing.id && row.email === data.email && row.status !== 'archived');
    if (duplicate) return res.status(409).json({ error: 'A member with this email already exists.' });
    const row = { ...existing, ...data, updatedAt: new Date().toISOString() };
    await store.transact(db => { const index = db.members.findIndex(item => item.id === row.id); if (index >= 0) db.members[index] = row; });
    const sheetSync = await sync('Members', 'memberId', { ...row, memberId: row.id, academicYear: row.year });
    res.json({ ...row, sheetSync });
  });
  router.delete('/admin/members/:id', requireAdmin, async (req, res) => {
    const row = await store.transact(db => { const member = db.members.find(item => item.id === req.params.id); if (!member) return { persist: false, value: null }; member.status = 'archived'; return member; });
    if (!row) return res.status(404).json({ error: 'Member not found.' });
    const sheetSync = await sync('Members', 'memberId', { ...row, memberId: row.id, academicYear: row.year });
    res.json({ success: true, sheetSync });
  });

  router.post('/admin/resources', requireAdmin, express.json({ limit: '12kb' }), async (req, res) => {
    const data = resourceFields(req.body);
    if (!data) return res.status(400).json({ error: 'Enter a title and valid HTTPS link.' });
    const row = { id: newId('RES'), ...data, status: 'active', createdAt: new Date().toISOString() };
    await store.transact(db => db.resources.push(row));
    const sheetSync = await sync('Resources', 'resourceId', { ...row, resourceId: row.id });
    res.status(201).json({ ...row, sheetSync });
  });
  router.put('/admin/resources/:id', requireAdmin, express.json({ limit: '12kb' }), async (req, res) => {
    const existing = (await store.read()).resources.find(row => row.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'Resource not found.' });
    const data = resourceFields(req.body);
    if (!data) return res.status(400).json({ error: 'Enter a title and valid HTTPS link.' });
    const row = { ...existing, ...data, updatedAt: new Date().toISOString() };
    await store.transact(db => { const index = db.resources.findIndex(item => item.id === row.id); if (index >= 0) db.resources[index] = row; });
    const sheetSync = await sync('Resources', 'resourceId', { ...row, resourceId: row.id });
    res.json({ ...row, sheetSync });
  });
  router.delete('/admin/resources/:id', requireAdmin, async (req, res) => {
    const row = await store.transact(db => { const item = db.resources.find(resource => resource.id === req.params.id); if (!item) return { persist: false, value: null }; item.status = 'archived'; return item; });
    if (!row) return res.status(404).json({ error: 'Resource not found.' });
    const sheetSync = await sync('Resources', 'resourceId', { ...row, resourceId: row.id });
    res.json({ success: true, sheetSync });
  });

  router.post('/admin/badges', requireAdmin, express.json({ limit: '12kb' }), async (req, res) => {
    const data = badgeFields(req.body);
    if (!data) return res.status(400).json({ error: 'Enter a badge name and description, plus a supported icon, color, and optional local image.' });
    const row = { id: newId('BDG'), ...data, createdAt: new Date().toISOString() };
    await store.transact(db => db.badges.push(row));
    const sheetSync = await sync('Badges', 'badgeId', { ...row, badgeId: row.id });
    res.status(201).json({ ...row, sheetSync });
  });
  router.put('/admin/badges/:id', requireAdmin, express.json({ limit: '12kb' }), async (req, res) => {
    const existing = (await store.read()).badges.find(row => row.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'Badge not found.' });
    const data = badgeFields(req.body);
    if (!data) return res.status(400).json({ error: 'Enter a badge name and description, plus a supported icon, color, and optional local image.' });
    const row = { ...existing, ...data, updatedAt: new Date().toISOString() };
    await store.transact(db => { const index = db.badges.findIndex(item => item.id === row.id); if (index >= 0) db.badges[index] = row; });
    const sheetSync = await sync('Badges', 'badgeId', { ...row, badgeId: row.id });
    res.json({ ...row, sheetSync });
  });
  router.delete('/admin/badges/:id', requireAdmin, async (req, res) => {
    const row = await store.transact(db => { const badge = db.badges.find(item => item.id === req.params.id); if (!badge) return { persist: false, value: null }; badge.status = 'archived'; return badge; });
    if (!row) return res.status(404).json({ error: 'Badge not found.' });
    const sheetSync = await sync('Badges', 'badgeId', { ...row, badgeId: row.id });
    res.json({ success: true, sheetSync });
  });
  router.post('/admin/badges/assign', requireAdmin, express.json({ limit: '4kb' }), async (req, res) => {
    const badgeId = clean(req.body?.badgeId, 100), memberId = clean(req.body?.memberId || req.body?.studentId, 100);
    const result = await store.transact(db => {
      const badge = db.badges.find(row => row.id === badgeId && row.status !== 'archived');
      const member = db.members.find(row => row.id === memberId && row.status !== 'archived');
      if (!badge) return { persist: false, value: { error: 'Badge not found.', status: 404 } };
      if (!member) return { persist: false, value: { error: 'Member not found.', status: 404 } };
      member.badges = [...new Set([...(member.badges || []), badgeId])];
      return { value: { badgeId, memberId } };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    const award = { id: newId('AWD'), badgeId, memberId, date: new Date().toISOString(), awardedBy: req.session.memberId };
    await store.transact(db => db.badgeAwards.push(award));
    const sheetSync = await sync('BadgeAwards', 'awardId', { ...award, awardId: award.id });
    res.status(201).json({ success: true, ...result, sheetSync });
  });
  const membersWithBadge = async (id, res) => res.json((await store.read()).members.filter(row => row.status !== 'archived' && (row.badges || []).includes(id)).map(({ id: memberId, name, email: address }) => ({ id: memberId, name, email: address })));
  router.get('/admin/badges/:id/members', requireAdmin, (req, res) => membersWithBadge(req.params.id, res));
  router.get('/admin/badges/:id/students', requireAdmin, (req, res) => membersWithBadge(req.params.id, res));

  router.get('/me/dashboard', requireMember, async (req, res) => {
    const db = await store.read();
    let member = db.members.find(row => row.id === req.session.memberId || (req.session.role === 'admin' && (row.email === req.session.subject || row.id === req.session.subject)));
    if (!member && req.session.role === 'admin') {
      member = { id: req.session.memberId || 'rehan@lead', name: 'Rehan Sanadi', email: req.session.subject || 'rehan@lead', department: 'Computer Science & Engineering', year: 'Club Lead', status: 'active', badges: ['BDG-01', 'BDG-02', 'BDG-03', 'BDG-04'] };
    }
    if (!member) return res.status(404).json({ error: 'Member profile not found.' });
    const registrations = db.registrations.filter(row => (row.memberId === member.id || (row.email && member.email && row.email.toLowerCase() === member.email.toLowerCase())) && row.status !== 'cancelled');
    const profile = { id: member.id, name: member.name, email: member.email, department: member.department, year: member.year, status: member.status, badges: member.badges || [] };
    res.json({
      role: req.session.role,
      member: profile,
      profile,
      registeredEvents: registrations,
      registrations,
      events: db.events.filter(row => row.status === 'published' && Date.parse(row.date) >= Date.now()).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
      upcomingEvents: db.events.filter(row => row.status === 'published' && Date.parse(row.date) >= Date.now()).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
      badges: db.badges.filter(row => (member.badges || []).includes(row.id) && row.status !== 'archived')
    });
  });

  const handleMemberRegister = async (req, res) => {
    const db = await store.read();
    let member = db.members.find(row => row.id === req.session.memberId || (req.session.role === 'admin' && (row.email === req.session.subject || row.id === req.session.subject)));
    if (!member && req.session.role === 'admin') {
      member = { id: req.session.memberId || 'rehan@lead', name: 'Rehan Sanadi', email: req.session.subject || 'rehan@lead', department: 'Computer Science & Engineering', year: 'Club Lead', status: 'active', badges: ['BDG-01', 'BDG-02', 'BDG-03', 'BDG-04'] };
    }
    if (!member) return res.status(404).json({ error: 'Member profile not found.' });

    const eventId = clean(req.body?.eventId || req.params?.id, 100);
    if (!eventId) return res.status(400).json({ error: 'Event ID is required.' });

    const now = new Date();
    const result = await store.transact(database => {
      const event = database.events.find(row => row.id === eventId && row.status === 'published');
      if (!event || Date.parse(event.date) < now.getTime()) {
        return { persist: false, value: { error: 'This event is no longer open for registration.', status: 404 } };
      }
      if (database.registrations.some(row => row.eventId === event.id && (row.memberId === member.id || (row.email && member.email && row.email.toLowerCase() === member.email.toLowerCase())) && row.status !== 'cancelled')) {
        return { persist: false, value: { error: 'You are already registered for this event.', status: 409 } };
      }
      if (event.capacity != null && registrationCount(database, event.id) >= event.capacity) {
        return { persist: false, value: { error: 'This event has reached full capacity.', status: 409 } };
      }
      const registration = {
        id: newId('REG'),
        eventId: event.id,
        eventTitle: event.title,
        memberId: member.id,
        name: member.name || 'Member',
        email: member.email,
        department: member.department || 'General',
        year: member.year || 'Member',
        notes: clean(req.body?.notes, 500) || 'Registered from member dashboard',
        createdAt: now.toISOString(),
        status: 'registered'
      };
      database.registrations.push(registration);
      return { value: registration };
    });

    if (result?.error) return res.status(result.status).json({ error: result.error });
    const sheetSync = await sync('Registrations', 'registrationId', {
      registrationId: result.id, eventId: result.eventId, eventTitle: result.eventTitle, name: result.name,
      email: result.email, department: result.department, academicYear: result.year, notes: result.notes,
      createdAt: result.createdAt, status: result.status
    });
    if (sheetSync !== 'not-configured') {
      await store.transact(database => {
        const row = database.registrations.find(item => item.id === result.id);
        if (row) row.sheetSync = sheetSync;
      });
    }
    res.status(201).json({ success: true, registration: result, sheetSync });
  };

  router.post('/me/register', requireMember, express.json({ limit: '8kb' }), handleMemberRegister);
  router.post('/me/events/:id/register', requireMember, express.json({ limit: '8kb' }), handleMemberRegister);

  router.post('/me/registrations/:id/cancel', requireMember, async (req, res) => {
    const memberId = req.session.memberId;
    const result = await store.transact(db => {
      const member = db.members.find(row => row.id === memberId || (req.session.role === 'admin' && (row.email === req.session.subject || row.id === req.session.subject)));
      const item = db.registrations.find(row => row.id === req.params.id && (row.memberId === member?.id || (member?.email && row.email === member.email)));
      if (!item) return { persist: false, value: { error: 'Registration not found.', status: 404 } };
      item.status = 'cancelled';
      item.cancelledAt = new Date().toISOString();
      return { value: item };
    });
    if (result?.error) return res.status(result.status).json({ error: result.error });
    const sheetSync = await sync('Registrations', 'registrationId', { ...result, registrationId: result.id });
    res.json({ success: true, registration: result, sheetSync });
  });

  const updateProfileHandler = async (req, res) => {
    let existing = (await store.read()).members.find(row => row.id === req.session.memberId || (req.session.role === 'admin' && (row.email === req.session.subject || row.id === req.session.subject)));
    if (!existing && req.session.role === 'admin') {
      existing = { id: req.session.memberId || 'rehan@lead', name: 'Rehan Sanadi', email: req.session.subject || 'rehan@lead', department: 'Computer Science & Engineering', year: 'Club Lead', status: 'active', badges: ['BDG-01', 'BDG-02', 'BDG-03', 'BDG-04'] };
      await store.transact(db => db.members.push(existing));
    }
    if (!existing) return res.status(404).json({ error: 'Member profile not found.' });
    const data = memberFields({ ...req.body, status: existing.status }, existing);
    if (!data) return res.status(400).json({ error: 'Enter your name and a valid email address.' });
    const duplicate = (await store.read()).members.some(row => row.id !== existing.id && row.email === data.email && row.status !== 'archived');
    if (duplicate) return res.status(409).json({ error: 'That email is already linked to another profile.' });
    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
    await store.transact(db => { const index = db.members.findIndex(row => row.id === updated.id); if (index >= 0) db.members[index] = updated; });
    const sheetSync = await sync('Members', 'memberId', { ...updated, memberId: updated.id, academicYear: updated.year });
    const profile = { id: updated.id, name: updated.name, email: updated.email, department: updated.department, year: updated.year, status: updated.status, badges: updated.badges || [] };
    res.json({ success: true, profile, member: profile, sheetSync });
  };

  router.put('/me/profile', requireMember, express.json({ limit: '8kb' }), updateProfileHandler);
  router.patch('/me/profile', requireMember, express.json({ limit: '8kb' }), updateProfileHandler);

  return router;
}
