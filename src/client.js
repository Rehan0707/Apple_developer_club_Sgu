export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function youtubeVideoId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./,'');
    const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com','m.youtube.com'].includes(host) && url.pathname === '/watch' ? url.searchParams.get('v') : null;
    return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}
export const entryCode = registrationId => `SGU-ENTRY:${registrationId}`;
export const isFirebaseHosted = typeof location !== 'undefined' && /(?:\.web\.app|\.firebaseapp\.com)$/.test(location.hostname);
export function parseEntryCode(value) {
  const raw = String(value || '').trim().replace(/^SGU-ENTRY:/i,'');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw.toLowerCase() : null;
}
export async function api(path, options = {}) {
  if (isFirebaseHosted) return (await import('./firebase-backend.js')).firebaseApi(path, options);
  const response = await fetch(path, { ...options, headers: { ...(options.body ? {'Content-Type':'application/json'} : {}), ...options.headers } });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Unable to complete the request. Please try again.'), {status:response.status});
  return data;
}
export function message(error) {
  let el = document.getElementById('app-message');
  if (!el) { el = document.createElement('p'); el.id = 'app-message'; el.setAttribute('role','status'); el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;padding:14px 22px;background:#1d1d1f;color:white;border-radius:12px;max-width:90vw;box-shadow:0 4px 20px #0003'; document.body.append(el); }
  (document.querySelector('dialog[open]') || document.body).append(el);
  el.textContent = error instanceof Error ? error.message : error;
  clearTimeout(message.timer); message.timer = setTimeout(()=>el.remove(),8000);
}
export async function submit(event, work) {
  event.preventDefault(); const button = event.target.querySelector('[type="submit"]');
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try { await work(); } catch (error) { message(error); } finally { if(button) button.disabled=false; }
}
export function live(refresh, { role, intervalMs } = {}) {
  let running = false, again = false;
  const run = async () => { if(running) {again=true;return;} running=true; try { await refresh(); } catch(error) { if(role && [401,403].includes(error.status)) location.replace(role==='admin'?'/admin/login.html':'/join/'); else message(error); } finally {running=false;if(again){again=false;run();}} };
  if (isFirebaseHosted) { import('./firebase-backend.js').then(({firebaseLive}) => firebaseLive(run,role,intervalMs)).catch(message); return run; }
  const stream = new EventSource('/api/stream'); stream.addEventListener('change',run);
  stream.onopen = run;
  window.addEventListener('focus',run);
  const timer = intervalMs ? setInterval(run,intervalMs) : null;
  window.addEventListener('pagehide',()=>{stream.close();if(timer)clearInterval(timer);},{once:true});
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  return run;
}
export async function requireRole(role) {
  const status = await api('/api/auth/status');
  if(!status.authenticated || status.role!==role) { location.replace(role==='admin'?'/admin/login.html':'/join/'); return false; }
  return true;
}
