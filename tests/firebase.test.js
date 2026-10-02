import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {createApp} from '../server.js';

const keys=await generateKeyPair('RS256');
const config={PUBLIC_ORIGIN:'https://club.example.com',FIREBASE_PROJECT_ID:'club-test',FIREBASE_WEB_APP_ID:'test-app',FIREBASE_API_KEY:'public-test-key',FIREBASE_AUTH_DOMAIN:'club-test.firebaseapp.com'};
async function run(work){
 const app=createApp(config,{firebaseKeys:keys.publicKey});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{await work(base,app);}finally{await new Promise(resolve=>server.close(resolve));app.locals.close();}
}
const token=async(overrides={})=>new SignJWT({sub:'firebase-user-1',email:'member@example.com',email_verified:true,name:'Club Member',auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'google.com'},...overrides})
 .setProtectedHeader({alg:'RS256'}).setIssuer('https://securetoken.google.com/club-test').setAudience('club-test').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
const signIn=(base,idToken,origin='https://club.example.com')=>fetch(base+'/api/auth/firebase',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({idToken})});

test('verified Firebase Google identity gets a durable portal member session and attendance badge',()=>run(async(base,app)=>{
 app.locals.store.put('events',{id:'first',title:'First Event',status:'past',date:'2020-01-01T00:00:00Z',badgeId:'event-badge-01'});
 app.locals.store.put('registrations',{id:'guest',eventId:'first',email:'member@example.com',memberId:null,attended:true,completedAt:'2020-01-01T01:00:00Z'});
 const status=await(await fetch(base+'/api/auth/status')).json();assert.equal(status.googleMode,'firebase');assert.equal(status.providers.google,true);
 const response=await signIn(base,await token());assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie').split(';')[0];
 const member=await(await fetch(base+'/api/me/dashboard',{headers:{cookie}})).json();
 assert.equal(member.memberId,'firebase_firebase-user-1');assert.equal(member.name,'Club Member');assert.equal(member.badgeProgress.earnedCount,1);
}));

test('Firebase sign-in rejects forged identity, wrong origin and non-Google providers',()=>run(async base=>{
 assert.equal((await signIn(base,await token(), 'https://other.example')).status,403);
 assert.equal((await signIn(base,await token({email_verified:false}))).status,401);
 assert.equal((await signIn(base,await token({firebase:{sign_in_provider:'anonymous'}}))).status,401);
 assert.equal((await signIn(base,await token({auth_time:Math.floor(Date.now()/1000)+3600}))).status,401);
 const forged=await new SignJWT({sub:'x',email:'x@example.com',email_verified:true,auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'google.com'}}).setProtectedHeader({alg:'RS256'}).setIssuer('https://securetoken.google.com/other-project').setAudience('other-project').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
 assert.equal((await signIn(base,forged)).status,401);
}));
