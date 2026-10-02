import express from 'express';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { publicResourceSeeds } from './lib/public-resource-seeds.js';
import { installOAuth } from './lib/oauth.js';
import { initializeBadges } from './lib/badges.js';
import { Store } from './lib/store.js';
import { installClubRoutes } from './lib/routes.js';

const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(v => { const i = v.indexOf('='); return i < 0 ? ['', ''] : [v.slice(0, i).trim(), v.slice(i + 1)]; }));
export function createApp(config = process.env, services = {}) {
  const app = express();
  const store = new Store(config.DATABASE_PATH || (config === process.env ? resolve('data/club.sqlite') : ':memory:'));
  const uploadDir = resolve(config.UPLOADS_PATH || join(dirname(config.DATABASE_PATH && config.DATABASE_PATH !== ':memory:' ? config.DATABASE_PATH : resolve('data/club.sqlite')), 'uploads'));
  mkdirSync(uploadDir, { recursive: true });
  app.locals.store = store;
  initializeBadges(store);
  if (config.SEED_PUBLIC_RESOURCES === 'true' && store.all('resources').length === 0) {
    for (const resource of publicResourceSeeds) store.put('resources', resource);
  }
  const sessions = {
    get: id => id ? store.get('sessions', id) : undefined,
    set: (id, value) => store.put('sessions', { id, ...value }),
    delete: id => id && store.delete('sessions', id),
    [Symbol.iterator]: function* () { for (const s of store.all('sessions')) yield [s.id, s]; }
  };
  const local = config.LOCAL_PREVIEW === 'true' && config.NODE_ENV !== 'production';
  const origin = (config.PUBLIC_ORIGIN || config.RENDER_EXTERNAL_URL)?.replace(/\/$/, '');
  const secureCookies = !local || Boolean(origin?.startsWith('https://'));
  const sessionCookie = secureCookies ? '__Host-sgu_session' : 'sgu_local_session';
  const clients = new Set();
  const notify = () => { for (const client of clients) client.write('event: change\ndata: {}\n\n'); };
  app.locals.close = () => { for (const client of clients) client.end(); store.close(); };
  app.get('/api/stream', (req, res) => {
    if (clients.size >= 100) return res.sendStatus(503);
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    res.flushHeaders(); res.write('retry: 3000\n\n'); clients.add(res);
    const timer = setInterval(() => res.write(': heartbeat\n\n'), 25000);
    req.on('close', () => { clearInterval(timer); clients.delete(res); });
  });
  const cookieOptions = { httpOnly: true, secure: secureCookies, sameSite: 'lax', path: '/' };
  app.disable('x-powered-by');
  app.use('/api', (req,res,next)=>{
    for(const [key,value] of sessions)if(value.expires<=Date.now())sessions.delete(key);
    res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next();
  });
  app.use(express.urlencoded({extended:false,limit:'8kb'}));
  installOAuth(app,{config,store,sessions,cookies,cookieOptions,sessionCookie,origin,local,notify},services);

  // Application routes share the same durable storage as authenticated members.
  installClubRoutes(app, { config, store, sessions, cookies, cookieOptions, sessionCookie, origin, notify, uploadDir });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/uploads', express.static(uploadDir, { immutable: true, maxAge: '1y', dotfiles: 'deny' }));
  app.use(express.static(resolve('dist')));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || 500;
    res.status(status).json({ error: status < 500 ? err.message : 'Unable to complete the request. Please try again.' });
  });
  return app;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  const app = createApp();
  const server = app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Club server: http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); app.locals.close(); process.exit(0); });
}
