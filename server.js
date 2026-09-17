import express from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify } from 'jose';

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
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(express.static(resolve('dist')));
  return app;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  createApp().listen(port, () => console.log(`Club server: http://127.0.0.1:${port}`));
}



