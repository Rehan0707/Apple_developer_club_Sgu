import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
async function withServer(config, run) {
  const server = createApp(config).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const config = { PUBLIC_ORIGIN:'https://club.example.com', APPLE_CLIENT_ID:'club.test', APPLE_TEAM_ID:'team', APPLE_KEY_ID:'key', APPLE_PRIVATE_KEY_PATH:'/not-a-real-key.p8' };
test('missing configuration never presents authentication as available', () => withServer({}, async base => {
  const status = await fetch(base+'/api/auth/status');
  assert.deepEqual(await status.json(), {available:false,authenticated:false});
  assert.equal(status.headers.get('cache-control'),'no-store');
  const start = await fetch(base+'/api/auth/apple',{redirect:'manual'});
  assert.equal(start.headers.get('location'),'/join/?auth=unavailable');
}));
test('malformed and forged callbacks fail without creating a session', () => withServer({}, async base => {
  const callback = await fetch(base+'/api/auth/apple/callback',{method:'POST',redirect:'manual'});
  assert.equal(callback.headers.get('location'),'/join/?auth=error');
  const status = await fetch(base+'/api/auth/status',{headers:{cookie:'__Host-sgu_session=fake'}});
  assert.equal((await status.json()).authenticated,false);
}));
test('authorization contains nonce and state, and requires a matching browser cookie', () => withServer(config, async base => {
  const start = await fetch(base+'/api/auth/apple',{redirect:'manual'});
  const url = new URL(start.headers.get('location'));
  assert.equal(url.origin,'https://appleid.apple.com');
  assert.equal(url.searchParams.get('redirect_uri'),'https://club.example.com/api/auth/apple/callback');
  assert.equal(url.searchParams.get('response_mode'),'form_post');
  assert.ok(url.searchParams.get('nonce').length >= 32);
  assert.match(start.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=None/);
  const callback = await fetch(base+'/api/auth/apple/callback',{method:'POST',redirect:'manual',body:new URLSearchParams({state:url.searchParams.get('state'),error:'user_cancelled_authorize'})});
  assert.equal(callback.headers.get('location'),'/join/?auth=error');
}));
test('bound cancellation is handled and state cannot be replayed', () => withServer(config, async base => {
  const start = await fetch(base+'/api/auth/apple',{redirect:'manual'});
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const options = {method:'POST',redirect:'manual',headers:{cookie:start.headers.get('set-cookie').split(';')[0]},body:new URLSearchParams({state,error:'user_cancelled_authorize'})};
  assert.equal((await fetch(base+'/api/auth/apple/callback',options)).headers.get('location'),'/join/?auth=cancelled');
  assert.equal((await fetch(base+'/api/auth/apple/callback',options)).headers.get('location'),'/join/?auth=error');
}));
test('cross-origin sign-out is rejected', () => withServer(config, async base => {
  assert.equal((await fetch(base+'/api/auth/signout',{method:'POST',headers:{origin:'https://other.example'}})).status,403);
}));
