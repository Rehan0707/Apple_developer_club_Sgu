const origin = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https:\/\//.test(origin)) {
  console.error('Usage: npm run check:deployment -- https://your-site.web.app');
  process.exit(2);
}

const checks = [
  { path: '/', type: 'text/html', text: 'Apple Developer Club' },
  { path: '/events/', type: 'text/html', text: 'Events' },
  { path: '/join/', type: 'text/html', text: 'Join the Club' },
  { path: '/student/', type: 'text/html', text: 'Student Dashboard' },
  { path: '/admin/login.html', type: 'text/html', text: 'Admin' },
  { path: '/api/health', type: 'application/json', json: data => data.status === 'ok' },
  { path: '/api/events', type: 'application/json', json: Array.isArray },
  { path: '/api/resources', type: 'application/json', json: Array.isArray },
  { path: '/api/auth/status', type: 'application/json', json: data => typeof data === 'object' && data !== null && 'authenticated' in data }
];

let failed = false;
for (const check of checks) {
  try {
    const response = await fetch(origin + check.path, { signal: AbortSignal.timeout(10000) });
    const body = await response.text();
    const type = response.headers.get('content-type') || '';
    const data = check.json && type.includes('application/json') ? JSON.parse(body) : null;
    const okay = response.ok && type.includes(check.type) && (check.json ? check.json(data) : body.includes(check.text));
    console.log(`${okay ? 'PASS' : 'FAIL'} ${check.path} — HTTP ${response.status}, ${type || 'no content type'}`);
    if (!okay) failed = true;
  } catch (error) {
    failed = true;
    console.log(`FAIL ${check.path} — ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
