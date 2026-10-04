import test from 'node:test';
import assert from 'node:assert/strict';
import { CollectionCache } from '../src/collection-cache.js';

test('overlapping reads share a request while unwatched collections remain fresh', async () => {
  const cache = new CollectionCache();
  let count = 0;
  const fetchRows = async () => [{ count: ++count }];
  const [a,b] = await Promise.all([cache.read('events', fetchRows),cache.read('events', fetchRows)]);
  assert.equal(count,1);
  assert.deepEqual(a,b);
  assert.deepEqual(await cache.read('events', fetchRows),[{count:2}]);
});

test('a live snapshot supersedes an older pending response and can be released', async () => {
  const cache = new CollectionCache();
  let finish;
  const request = cache.read('events', () => new Promise(resolve => { finish=resolve; }));
  await Promise.resolve();
  cache.publish('events',[{id:'new-event'}]);
  finish([{id:'old-event'}]);
  assert.deepEqual(await request,[{id:'new-event'}]);
  assert.deepEqual(await cache.read('events',()=>assert.fail('Live snapshot should be reused')),[{id:'new-event'}]);
  cache.forget('events');
  assert.deepEqual(await cache.read('events',async()=>[]),[]);
});

test('failed requests do not poison subsequent reads or share different member queries', async () => {
  const cache = new CollectionCache();
  await assert.rejects(cache.read('events',async()=>{throw new Error('Offline');}));
  assert.deepEqual(await cache.read('events',async()=>[]),[]);
  cache.publish('registrations:ownerUid:alice',[{id:'alice-registration'}]);
  assert.deepEqual(await cache.read('registrations:ownerUid:bob',async()=>[]),[]);
});
