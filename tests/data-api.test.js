import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { randomBytes, scryptSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';

async function withApp(run, options = {}) {
  const parent = process.env.TEST_TMP_ROOT || tmpdir();
  const directory = await mkdtemp(join(parent, 'club-forge-api-'));
  const salt = randomBytes(16).toString('hex');
  const password = 'test-only-password';
  const hash = scryptSync(password, salt, 64).toString('hex');
  const config = {
    DATA_FILE_PATH: join(directory, 'db.json'),
    ADMIN_USERNAME: 'admin@example.test',
    ADMIN_PASSWORD_HASH: `scrypt$${salt}$${hash}`,
    ...(options.config || {})
  };
  const server = createApp(config).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run({ base, password, config }); }
  finally { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
}

async function adminCookie(base, password) {
  const response = await fetch(`${base}/api/auth/admin/login`, {
    method: 'POST', headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin@example.test', password })
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('events and registrations validate, persist, and appear in the admin view', () => withApp(async ({ base, password, config }) => {
  assert.equal((await fetch(`${base}/api/admin/events`)).status, 403);
  const cookie = await adminCookie(base, password);
  const eventResponse = await fetch(`${base}/api/admin/events`, {
    method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Test Workshop', category: 'Workshop', description: 'Test description', date: '2027-01-15T10:00', location: 'Campus lab', capacity: 1, status: 'published' })
  });
  assert.equal(eventResponse.status, 201);
  const event = await eventResponse.json();
  assert.equal(event.sheetSync, 'not-configured');
  assert.equal((await (await fetch(`${base}/api/events`)).json()).length, 1);

  const editedResponse = await fetch(`${base}/api/admin/events/${event.id}`, {
    method: 'PUT', headers: { cookie, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Updated Test Workshop', category: 'Workshop', description: 'Updated description', date: '2027-01-16T10:00', location: 'Updated campus lab', capacity: 2, status: 'published' })
  });
  assert.equal(editedResponse.status, 200);
  const editedEvent = await editedResponse.json();
  assert.equal(editedEvent.title, 'Updated Test Workshop');
  const publicEvents = await (await fetch(`${base}/api/events`)).json();
  assert.equal(publicEvents[0].title, 'Updated Test Workshop');
  assert.equal(publicEvents[0].location, 'Updated campus lab');
  assert.equal(publicEvents[0].remainingCapacity, 2);

  const bad = await fetch(`${base}/api/events/${event.id}/register`, {
    method: 'POST', headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test Student', email: 'not-an-email', department: 'Computing', year: '1st Year' })
  });
  assert.equal(bad.status, 400);

  const submitted = await fetch(`${base}/api/events/${event.id}/register`, {
    method: 'POST', headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test Student', email: 'student@example.test', department: 'Computing', year: '1st Year', notes: 'Testing the flow' })
  });
  assert.equal(submitted.status, 201);
  const result = await submitted.json();
  assert.equal(result.sheetSync, 'not-configured');
  assert.equal(result.eventId, event.id);

  const duplicate = await fetch(`${base}/api/events/${event.id}/register`, {
    method: 'POST', headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test Student', email: 'STUDENT@example.test', department: 'Computing', year: '1st Year' })
  });
  assert.equal(duplicate.status, 409);
  const adminRows = await fetch(`${base}/api/admin/registrations`, { headers: { cookie } });
  assert.equal(adminRows.status, 200);
  const registrations = await adminRows.json();
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].eventId, event.id);
  assert.equal(registrations[0].email, 'student@example.test');
  const adminEvents = await (await fetch(`${base}/api/admin/events`, { headers: { cookie } })).json();
  assert.equal(adminEvents[0].registrationCount, 1);
  const stored = JSON.parse(await readFile(config.DATA_FILE_PATH, 'utf8'));
  assert.equal(stored.registrations.length, 1);
  assert.equal(stored.registrations[0].notes, 'Testing the flow');
  const publicAfterRegistration = await (await fetch(`${base}/api/events`)).json();
  assert.equal(publicAfterRegistration[0].registrationCount, 1);
  assert.equal(publicAfterRegistration[0].remainingCapacity, 1);

  const archived = await fetch(`${base}/api/admin/events/${event.id}`, { method: 'DELETE', headers: { cookie, origin: base } });
  assert.equal(archived.status, 200);
  assert.equal((await (await fetch(`${base}/api/events`)).json()).length, 0);
  const overview = await (await fetch(`${base}/api/admin/overview`, { headers: { cookie } })).json();
  assert.equal(overview.counts.upcomingEvents, 0);
  assert.equal(overview.counts.registrations, 1);
}));

test('member, badge, and resource administration use the same persisted records', () => withApp(async ({ base, password }) => {
  const cookie = await adminCookie(base, password);
  const memberResponse = await fetch(`${base}/api/admin/members`, {
    method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test Member', email: 'member@example.test', department: 'Computing', year: '2nd Year', status: 'active' })
  });
  assert.equal(memberResponse.status, 201);
  const member = await memberResponse.json();
  const badgeResponse = await fetch(`${base}/api/admin/badges`, {
    method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test Badge', desc: 'Awarded for the API test', icon: 'verified', color: 'purple' })
  });
  assert.equal(badgeResponse.status, 201);
  const badge = await badgeResponse.json();
  const assignment = await fetch(`${base}/api/admin/badges/assign`, {
    method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ memberId: member.id, badgeId: badge.id })
  });
  assert.equal(assignment.status, 201);
  assert.equal((await (await fetch(`${base}/api/admin/badges/${badge.id}/members`, { headers: { cookie } })).json()).length, 1);

  const resourceResponse = await fetch(`${base}/api/admin/resources`, {
    method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Apple Developer Documentation', category: 'Documentation', url: 'https://developer.apple.com/documentation/' })
  });
  assert.equal(resourceResponse.status, 201);
  assert.equal((await (await fetch(`${base}/api/resources`)).json()).length, 1);

  const overview = await fetch(`${base}/api/admin/overview`, { headers: { cookie } });
  assert.equal(overview.status, 200);
  const counts = (await overview.json()).counts;
  assert.equal(counts.members, 1);
  assert.equal(counts.activeBadges, 1);
}));

test('configured Sheets adapter receives visitor fields only from the server route', () => {
  const writes = [];
  const fakeSheets = {
    isConfigured: true,
    async setupSchema() { return true; },
    async checkConnection() { return { configured: true, connected: true }; },
    async upsertObject(tab, key, row) { writes.push({ tab, key, row }); return true; }
  };
  return withApp(async ({ base, password }) => {
    const cookie = await adminCookie(base, password);
    const created = await fetch(`${base}/api/admin/events`, {
      method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Sheet Test', date: '2027-02-10T11:00', location: 'Campus', status: 'published' })
    });
    const event = await created.json();
    const submitted = await fetch(`${base}/api/events/${event.id}/register`, {
      method: 'POST', headers: { origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Sheet Test Person', email: 'sheet@example.test', department: 'Computing', year: '1st Year' })
    });
    assert.equal(submitted.status, 201);
    assert.equal((await submitted.json()).sheetSync, 'synced');
    const write = writes.find(item => item.tab === 'Registrations');
    assert.ok(write);
    assert.equal(write.row.email, 'sheet@example.test');
    assert.equal(write.row.eventTitle, 'Sheet Test');
    assert.equal(write.row.academicYear, '1st Year');
  }, { config: { SHEETS_SERVICE: fakeSheets } });
});
