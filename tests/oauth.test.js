import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportPKCS8, SignJWT } from 'jose';
import { createApp } from '../server.js';
const rsa=await generateKeyPair('RS256'), ec=await generateKeyPair('ES256',{extractable:true});
const config={PUBLIC_ORIGIN:'https://club.example.com',GOOGLE_CLIENT_ID:'google-client',GOOGLE_CLIENT_SECRET:'server-only-secret',APPLE_CLIENT_ID:'apple-client',APPLE_TEAM_ID:'team',APPLE_KEY_ID:'key',APPLE_PRIVATE_KEY_PATH:'/test.p8'};
async function withServer(run){
 let nonce,claims={},provider='google',exchanges=0;
 const app=createApp(config,{googleKeys:rsa.publicKey,appleKeys:rsa.publicKey,readFile:()=>exportPKCS8(ec.privateKey),fetch:async(url,options)=>{
  exchanges++;
  assert.equal(url,provider==='google'?'https://oauth2.googleapis.com/token':'https://appleid.apple.com/auth/token');
  if(provider==='google')assert.ok(options.body.get('code_verifier').length>=43);
  const token=await new SignJWT({sub:'member-001',email:'member@example.com',email_verified:true,name:'Verified Member',nonce,...claims}).setProtectedHeader({alg:'RS256'}).setIssuer(provider==='google'?'https://accounts.google.com':'https://appleid.apple.com').setAudience(provider==='google'?'google-client':'apple-client').setIssuedAt().setExpirationTime('5m').sign(rsa.privateKey);
  return new Response(JSON.stringify({id_token:token}),{headers:{'content-type':'application/json'}});
 }});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function begin(p='google'){
  provider=p;const response=await fetch(base+'/api/auth/'+p,{redirect:'manual'});const url=new URL(response.headers.get('location'));nonce=url.searchParams.get('nonce');
  return {url,state:url.searchParams.get('state'),cookie:response.headers.getSetCookie()[0].split(';')[0]};
 }
 async function callback(start,extra={}){
  const body={state:start.state,code:'auth-code',...extra};
  return fetch(base+`/api/auth/${provider}/callback`+(provider==='google'?'?'+new URLSearchParams(body):''),{redirect:'manual',method:provider==='google'?'GET':'POST',headers:{cookie:start.cookie},...(provider==='apple'?{body:new URLSearchParams(body)}:{})});
 }
 try{await run({app,base,begin,callback,setClaims:value=>{claims=value;},exchanges:()=>exchanges});}finally{await new Promise(r=>server.close(r));app.locals.close();}
}
const sessionCookie=response=>response.headers.getSetCookie().find(s=>s.startsWith('__Host-sgu_session='))?.split(';')[0];
test('Google code flow verifies token, sets a persistent member identity, and consumes state',()=>withServer(async({begin,callback,base,exchanges})=>{
 const start=await begin();assert.equal(start.url.origin,'https://accounts.google.com');assert.equal(start.url.searchParams.get('code_challenge_method'),'S256');assert.equal(start.url.searchParams.get('scope'),'openid email profile');assert.ok(start.url.searchParams.get('code_challenge'));
 const response=await callback(start);assert.equal(response.headers.get('location'),'/student/');const cookie=sessionCookie(response);assert.ok(cookie);
 const me=await(await fetch(base+'/api/me/dashboard',{headers:{cookie}})).json();assert.equal(me.memberId,'google_member-001');assert.equal(me.name,'Verified Member');assert.equal(me.badgeProgress.earnedCount,0);
 assert.equal((await callback(start)).headers.get('location'),'/join/?auth=error');assert.equal(exchanges(),1);
}));
test('Google rejects forged browser binding, cancellation replay, nonce and unverified email',()=>withServer(async({begin,callback,setClaims,exchanges})=>{
 let start=await begin();assert.equal((await callback({...start,cookie:'sgu_google_oauth=forged'})).headers.get('location'),'/join/?auth=error');assert.equal(exchanges(),0);
 start=await begin();assert.equal((await callback(start,{error:'access_denied'})).headers.get('location'),'/join/?auth=cancelled');assert.equal((await callback(start)).headers.get('location'),'/join/?auth=error');
 setClaims({nonce:'wrong'});assert.equal((await callback(await begin())).headers.get('location'),'/join/?auth=error');
 setClaims({email_verified:false});assert.equal((await callback(await begin())).headers.get('location'),'/join/?auth=error');
}));
test('Apple creates a member after verification and keeps provider identities separate',()=>withServer(async({begin,callback,base})=>{
 const apple=await callback(await begin('apple'),{user:JSON.stringify({name:{firstName:'Apple',lastName:'Member'}})});
 assert.equal(apple.headers.get('location'),'/student/');
 const member=await(await fetch(base+'/api/me/dashboard',{headers:{cookie:sessionCookie(apple)}})).json();assert.equal(member.memberId,'apple_member-001');assert.equal(member.name,'Apple Member');
 const google=await callback(await begin('google'));const other=await(await fetch(base+'/api/me/dashboard',{headers:{cookie:sessionCookie(google)}})).json();assert.notEqual(other.memberId,member.memberId);
}));
test('verified sign-in claims only unlinked guest registrations and awards their event badge',()=>withServer(async({app,begin,callback,base})=>{
 app.locals.store.put('events',{id:'finished',title:'First Club Event',date:'2020-01-01T10:00:00Z',status:'past',badgeId:'event-badge-01'});
 app.locals.store.put('registrations',{id:'guest-reg',eventId:'finished',memberId:null,email:'member@example.com',attended:true,completedAt:'2020-01-01T12:00:00Z',timestamp:'2020-01-01T09:00:00Z'});
 app.locals.store.put('registrations',{id:'other-reg',eventId:'other',memberId:'other-member',email:'member@example.com',attended:true,timestamp:'2020-01-01T09:00:00Z'});
 const response=await callback(await begin());const me=await(await fetch(base+'/api/me/dashboard',{headers:{cookie:sessionCookie(response)}})).json();assert.equal(me.registeredEvents.length,1);assert.equal(me.badges.length,1);assert.equal(me.badges[0].eventTitle,'First Club Event');
}));
