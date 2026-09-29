import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes, scryptSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';

async function withApp(run) {
  const directory = await mkdtemp(join(tmpdir(), 'club-member-test-'));
  const salt = randomBytes(16).toString('hex');
  const password = 'test-admin-pass';
  const hash = scryptSync(password, salt, 64).toString('hex');
  const config = {
    DATA_FILE_PATH: join(directory, 'db.json'),
    ADMIN_USERNAME: 'admin@example.test',
    ADMIN_PASSWORD_HASH: `scrypt$${salt}$${hash}`
  };
  const server = createApp(config).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run({ base, password }); }
  finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

test('member login, dashboard retrieval, profile update, and admin dual-access flow', () => withApp(async ({ base, password }) => {
  // 1. Member login creates account and session
  const memberLogin = await fetch(`${base}/api/auth/member/login`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'student.test@sgu.ac.in', name: 'Student Tester', department: 'CSE', year: '2nd Year' })
  });
  assert.equal(memberLogin.status, 200);
  const memberData = await memberLogin.json();
  assert.equal(memberData.authenticated, true);
  assert.equal(memberData.role, 'member');
  const memberCookie = memberLogin.headers.get('set-cookie').split(';')[0];

  // 2. Member dashboard loads successfully
  const memberDash = await fetch(`${base}/api/me/dashboard`, {
    headers: { cookie: memberCookie }
  });
  assert.equal(memberDash.status, 200);
  const dashData = await memberDash.json();
  assert.equal(dashData.profile.email, 'student.test@sgu.ac.in');
  assert.equal(dashData.role, 'member');

  // 3. Member profile update works
  const profileUpdate = await fetch(`${base}/api/me/profile`, {
    method: 'PUT',
    headers: { cookie: memberCookie, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Student Tester Updated', email: 'student.test@sgu.ac.in', department: 'AI & DS', year: '3rd Year' })
  });
  assert.equal(profileUpdate.status, 200);
  const updatedData = await profileUpdate.json();
  assert.equal(updatedData.profile.name, 'Student Tester Updated');
  assert.equal(updatedData.profile.department, 'AI & DS');

  // 4. Admin login and access to member dashboard
  const adminLogin = await fetch(`${base}/api/auth/admin/login`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin@example.test', password })
  });
  assert.equal(adminLogin.status, 200);
  const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];

  // Admin can access admin overview
  const overview = await fetch(`${base}/api/admin/overview`, { headers: { cookie: adminCookie } });
  assert.equal(overview.status, 200);

  // Admin can also access /api/me/dashboard seamlessly (Member View)
  const adminMemberDash = await fetch(`${base}/api/me/dashboard`, { headers: { cookie: adminCookie } });
  assert.equal(adminMemberDash.status, 200);
  const adminDashData = await adminMemberDash.json();
  assert.equal(adminDashData.role, 'admin');
  assert.ok(adminDashData.profile);
}));
