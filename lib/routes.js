import { reconcileAttendanceBadges, memberBadges, eventBadges } from './badges.js';
import express from 'express';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (value, label, max = 200, required = true) => {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(`Please enter a valid ${label}.`);
  return value.trim();
};
const url = (value, label, image = false) => {
  const v = text(value, label, 2048);
  if (image && /^\/images\/[a-zA-Z0-9_.-]+$/.test(v)) return v;
  try { if (new URL(v).protocol === 'https:') return v; } catch {}
  fail(`${label} must be an HTTPS URL.`);
};
const email = value => { const v = text(value, 'email', 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail('Please enter a valid email address.'); return v; };
const digest = value => createHash('sha256').update(value).digest();
const equals = (a, b) => timingSafeEqual(digest(String(a)), digest(String(b)));

export function installClubRoutes(app, ctx) {
  const { config, store, sessions, cookies, cookieOptions, sessionCookie, origin, notify, uploadDir } = ctx;
  const local = config.LOCAL_PREVIEW === 'true' && config.NODE_ENV !== 'production';
  const loopback = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && ['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname);
  const session = req => sessions.get(cookies(req)[sessionCookie]);
  const auth = (req, res, next) => { req.session = session(req); if (!req.session) return res.status(401).json({ error: 'Please sign in to continue.' }); next(); };
  const admin = (req, res, next) => { req.session = session(req); if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Administrator access is required.' }); next(); };
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const expected = origin || (local && loopback(req) ? `http://${req.get('host')}` : null);
    if (!expected || req.get('origin') !== expected) return res.status(403).json({ error: 'Invalid request origin.' });
    next();
  }, express.json({ limit: '16kb' }));
  const attempts = new Map();
  const limit = (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const key = `${req.socket.remoteAddress}:${req.path}`;
    const entry = attempts.get(key) || { count: 0, until: now + 600000 };
    attempts.set(key, entry);
    if (++entry.count > 20) return res.status(429).set('Retry-After', '600').json({ error: 'Too many attempts. Please try again in ten minutes.' });
    next();
  };
  function signIn(req, res, memberId, role) {
    const old = cookies(req)[sessionCookie]; if (old) sessions.delete(old);
    const id = randomBytes(32).toString('base64url');
    sessions.set(id, { memberId, role, expires: Date.now() + 3600000 });
    res.cookie(sessionCookie, id, { ...cookieOptions, maxAge: 3600000 });
    notify(); res.json({ role });
  }
  app.post('/api/auth/admin', limit, (req, res) => {
    if (!config.ADMIN_USERNAME || !config.ADMIN_PASSWORD_HASH) return res.status(503).json({ error: 'Admin access has not been configured.' });
    const [salt, hash] = config.ADMIN_PASSWORD_HASH.split(':');
    const username = text(req.body?.username, 'username');
    const password = text(req.body?.password, 'password', 256);
    if (!salt || !hash || !equals(username, config.ADMIN_USERNAME) || !equals(scryptSync(password, salt, 64).toString('hex'), hash)) return res.status(401).json({ error: 'Incorrect username or password.' });
    signIn(req, res, 'admin', 'admin');
  });
  app.post('/api/auth/local-student', limit, (req, res) => {
    if (!local || !loopback(req)) return res.sendStatus(404);
    const id = 'local-student';
    if (!store.get('members', id)) store.put('members', { id, name: 'Local Student', email: 'student@localhost.test', joinedDate: new Date().toISOString() });
    signIn(req, res, id, 'student');
  });
  app.get('/api/health', (_req, res) => { store.all('events'); res.json({ status: 'ok' }); });
  const events = () => store.all('events').filter(e => e.status !== 'deleted').sort((a,b) => a.date.localeCompare(b.date));
  const open = e => e.status === 'upcoming' && Date.parse(e.date) > Date.now();
  const publicEvents = () => events().filter(e => e.status !== 'draft').map(e => ({ ...e, registrationOpen: open(e), registeredCount: store.all('registrations').filter(r => r.eventId === e.id && !r.cancelledAt).length }));
  app.get('/api/events', (_req, res) => res.json(publicEvents()));
  app.get('/api/admin/events', admin, (_req, res) => res.json(events()));
  app.post('/api/admin/event-banner', admin, express.raw({ type: ['image/png','image/jpeg','image/webp'], limit: '5mb' }), (req,res) => {
    const bytes=req.body;
    if (!Buffer.isBuffer(bytes) || !bytes.length) fail('Choose a PNG, JPEG, or WebP image.',415);
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    const extension=png?'png':jpeg?'jpg':webp?'webp':null;
    if (!extension) fail('Choose a valid PNG, JPEG, or WebP image.',415);
    const name=`${randomUUID()}.${extension}`;
    writeFileSync(join(uploadDir,name),bytes,{flag:'wx'});
    res.status(201).json({url:`/uploads/${name}`});
  });
  function eventData(body, current = null) {
    const title = text(body.title, 'title'), location = text(body.location, 'location');
    const date = text(body.date, 'date'); if (!Number.isFinite(Date.parse(date))) fail('Please enter a valid date.');
    const status = body.status || 'upcoming'; if (!['draft','upcoming','past','cancelled'].includes(status)) fail('Invalid event status.');
    const capacity = body.capacity == null || body.capacity === '' ? null : Number(body.capacity);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000)) fail('Capacity must be a positive whole number.');
    const badgeId = body.badgeId === undefined ? current?.badgeId || (store.all('events').length === 0 ? eventBadges[0].id : null) : body.badgeId || null;
    if (badgeId && !eventBadges.some(b=>b.id===badgeId)) fail('Select a club event badge.');
    if (badgeId && store.all('events').some(e=>e.id!==current?.id && e.badgeId===badgeId)) fail('This badge is already assigned to another event.',409);
    const bannerUrl=body.bannerUrl===undefined?current?.bannerUrl||'':body.bannerUrl||'';
    if (bannerUrl && !/^\/uploads\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(bannerUrl)) fail('Choose an uploaded event banner.');
    return { badgeId, title, location, date: new Date(date).toISOString(), status, capacity, bannerUrl, category: text(body.category, 'category', 80, false), description: text(body.description, 'description', 2000, false) };
  }
  app.post('/api/admin/events', admin, (req, res) => { const id = randomUUID(); const event = store.put('events', { ...eventData(req.body), id, eventId: id }); notify(); res.status(201).json(event); });
  app.put('/api/admin/events/:id', admin, (req, res) => { const event = store.get('events', req.params.id); if (!event) fail('Event not found.',404); const updated=store.transaction(()=>{const changes=eventData(req.body,event);const labels=[['title','name'],['description','details'],['date','time'],['location','location'],['status','status']].filter(([key])=>event[key]!==changes[key]).map(([,label])=>label);const updated=store.put('events',{...event,...changes,...(labels.length?{changedAt:new Date().toISOString(),changeSummary:labels.join(', ')}:{})});for(const member of store.all('members'))reconcileAttendanceBadges(store,member.id);return updated;}); notify(); res.json(updated); });
  app.delete('/api/admin/events/:id', admin, (req, res) => { const event = store.get('events', req.params.id); if (!event) fail('Event not found.',404); store.put('events', { ...event, status: 'deleted', badgeId:store.all('registrations').some(r=>r.eventId===event.id&&r.attended) ? event.badgeId : null }); notify(); res.sendStatus(204); });
  app.post('/api/events/:id/register', limit, (req, res) => {
    const event = store.get('events', req.params.id); if (!event || !open(event)) fail('Registration is not open for this event.',409);
    const member = session(req)?.memberId && store.get('members', session(req).memberId);
    const body = req.body || {};
    const details = { name: text(body.name || member?.name, 'name',100), email: email(body.email || member?.email), branch: text(body.branch, 'department',100,!member), year: text(body.year, 'year',40,!member), notes: text(body.notes, 'notes',1000,false) };
    const registration = store.transaction(() => {
      const rows = store.all('registrations').filter(r => r.eventId === event.id && !r.cancelledAt);
      if (rows.some(r => r.email === details.email || (member && r.memberId === member.id))) fail('You are already registered for this event.',409);
      if (event.capacity && rows.length >= event.capacity) fail('This event is full.',409);
      const id = randomUUID(); return store.put('registrations', { ...details, id, registrationId: id, eventId: event.id, memberId: member?.id || null, timestamp: new Date().toISOString(), attended: false });
    });
    notify(); res.status(201).json({ registrationId: registration.id, eventId: event.id, title: event.title });
  });
  app.delete('/api/me/registrations/:id', auth, (req,res) => {
    if (req.session.role !== 'student') return res.status(403).json({error:'Member access is required.'});
    const row=store.get('registrations',req.params.id);
    if (!row || row.memberId !== req.session.memberId) fail('Registration not found.',404);
    const event=store.get('events',row.eventId);
    if (row.cancelledAt) fail('This registration is already cancelled.',409);
    if (row.attended || !event || !open(event)) fail('Cancellation is available before the event starts.',409);
    store.put('registrations',{...row,cancelledAt:new Date().toISOString()});
    notify();res.json({success:true});
  });
  app.get('/api/admin/registrations', admin, (_req,res) => res.json(store.all('registrations').map(r => {const event=store.get('events',r.eventId);return {...r,title:event?.title||'Removed event',eventDate:event?.date||null,eventStatus:event?.status||'deleted',eventLocation:event?.location||''};})));
  app.get('/api/admin/events/:id/registrations', admin, (req,res) => res.json(store.all('registrations').filter(r => r.eventId === req.params.id)));
  app.put('/api/admin/registrations/:id', admin, (req,res) => {
    const row = store.get('registrations', req.params.id);
    if (!row) fail('Registration not found.',404);
    if (typeof req.body.attended !== 'boolean') fail('Attendance must be true or false.');
    const event = store.get('events', row.eventId);
    if (row.cancelledAt) fail('This registration was cancelled.',409);
    if (req.body.attended && (!event || ['draft','cancelled','deleted'].includes(event.status) || Date.parse(event.date) > Date.now())) fail('Attendance can be confirmed after the event starts.',409);
    store.transaction(() => {
      store.put('registrations', {...row, attended:req.body.attended, completedAt:req.body.attended ? row.completedAt || new Date().toISOString() : null});
      if (!req.body.attended) store.delete('feedback',row.id);
      reconcileAttendanceBadges(store, row.memberId);
    });
    notify(); res.json({success:true, badgeProgress:row.memberId ? memberBadges(store,row.memberId) : null});
  });
  app.put('/api/me/registrations/:id/feedback', auth, (req,res) => {
    if (req.session.role !== 'student') return res.status(403).json({error:'Member access is required.'});
    const registration=store.get('registrations',req.params.id);
    if (!registration || registration.memberId!==req.session.memberId) fail('Registration not found.',404);
    const event=store.get('events',registration.eventId);
    if (registration.cancelledAt || !registration.attended || !event || Date.parse(event.date)>Date.now()) fail('Feedback opens after you attend the event.',409);
    const rating=Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating<1 || rating>5) fail('Choose a rating from 1 to 5.');
    const liked=text(req.body?.liked,'what worked well',1000,false);
    const improve=text(req.body?.improve,'what could improve',1000,false);
    const previous=store.get('feedback',registration.id);
    const feedback=store.put('feedback',{id:registration.id,registrationId:registration.id,eventId:event.id,memberId:registration.memberId,rating,liked,improve,createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});
    notify();res.json(feedback);
  });
  app.get('/api/admin/feedback', admin, (_req,res) => res.json(store.all('feedback').map(f=>{const event=store.get('events',f.eventId);const registration=store.get('registrations',f.registrationId);return {...f,eventTitle:event?.title||'Removed event',memberName:registration?.name||'Former member'};})));
  function resourceData(body) { return { title: text(body.title,'title'), url: url(body.url,'Resource URL'), category: text(body.category,'category',80,false), desc: text(body.desc,'description',2000,false) }; }
  app.get('/api/resources', (_req,res) => res.json(store.all('resources')));
  app.post('/api/admin/resources', admin, (req,res) => { const row = store.put('resources', { ...resourceData(req.body), id: randomUUID() }); notify(); res.status(201).json(row); });
  app.put('/api/admin/resources/:id', admin, (req,res) => { if (!store.get('resources',req.params.id)) fail('Resource not found.',404); const row = store.put('resources',{...resourceData(req.body),id:req.params.id}); notify(); res.json(row); });
  app.delete('/api/admin/resources/:id', admin, (req,res) => { if (!store.get('resources',req.params.id)) fail('Resource not found.',404); store.delete('resources',req.params.id); notify(); res.sendStatus(204); });
  app.get('/api/badges', (_req,res) => res.json(store.all('badges')));
  app.get('/api/admin/badges/summary', admin, (_req,res) => {
    const counts = Object.fromEntries(store.all('badges').map(b => [b.id, 0]));
    for (const award of store.all('awards')) if (Object.hasOwn(counts, award.badgeId)) counts[award.badgeId]++;
    res.json(counts);
  });
  app.post('/api/admin/badges', admin, (req,res) => {
    const name = text(req.body.name,'name'), desc = text(req.body.desc,'description',2000,false), icon = text(req.body.icon || 'star','icon',50);
    const color = req.body.color || 'primary'; if (!['primary','secondary','tertiary','error'].includes(color)) fail('Invalid badge color.');
    const imageUrl = req.body.imageUrl ? url(req.body.imageUrl,'Image URL',true) : ({primary:'/images/badge_blue.jpg',secondary:'/images/badge_green.jpg',tertiary:'/images/badge_orange.jpg',error:'/images/badge_red.jpg'})[color];
    const row = store.put('badges',{id:randomUUID(),name,desc,icon,color,imageUrl}); notify(); res.status(201).json(row);
  });
  app.get('/api/admin/stats',admin,(_req,res)=>res.json({members:store.all('members').length,badges:store.all('badges').length,awards:store.all('awards').length}));
  app.get('/api/admin/students', admin, (_req,res) => res.json(store.all('members')));
  function award(req,res) {
    const badgeId = text(req.body.badgeId,'badge'), studentId = text(req.body.studentId || req.body.memberId,'member');
    if (!store.get('badges',badgeId) || !store.get('members',studentId)) fail('Badge or member not found.',404);
    if (store.get('badges',badgeId).type === 'event') fail('Event badges are awarded through confirmed attendance.',409);
    const id = `${studentId}:${badgeId}`; if (!store.get('awards',id)) store.put('awards',{id,badgeId,memberId:studentId,date:new Date().toISOString()}); notify(); res.json({success:true});
  }
  app.post('/api/admin/badges/assign',admin,award); app.post('/api/admin/badges/award',admin,award);
  app.get('/api/admin/badges/:id/students',admin,(req,res) => { const ids = store.all('awards').filter(a=>a.badgeId===req.params.id).map(a=>a.memberId); res.json(store.all('members').filter(m=>ids.includes(m.id))); });
  app.get('/api/me/badges',auth,(req,res)=>res.json(memberBadges(store,req.session.memberId)));
  app.get('/api/me/dashboard',auth,(req,res) => {
    const member = store.get('members',req.session.memberId); if (!member) return res.json({memberId:req.session.memberId,name:'Administrator',registeredEvents:[],badges:[]});
    const registeredEvents = store.all('registrations').filter(r=>r.memberId===member.id && !r.cancelledAt).map(r=>({...store.get('events',r.eventId),...r,feedback:store.get('feedback',r.id)||null}));
    const badgeProgress=memberBadges(store,member.id);
    const badges=badgeProgress.badges.filter(b=>b.earned).sort((a,b)=>a.awardedAt.localeCompare(b.awardedAt));
    res.json({...member,memberId:member.id,registeredEvents,badges,badgeProgress});
  });
  app.get('/api/team',(_req,res)=>res.json(store.all('team')));
}
