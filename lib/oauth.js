import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify } from 'jose';
import { reconcileAttendanceBadges } from './badges.js';
const random = () => randomBytes(32).toString('base64url');
const equal = (a,b) => typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const clean = (value,max=200) => typeof value==='string' ? value.trim().slice(0,max) : '';
const loopback = host => ['localhost','127.0.0.1','[::1]'].includes(host);

export function installOAuth(app, context, services = {}) {
  const {config,store,sessions,cookies,cookieOptions,sessionCookie,origin,local,notify}=context;
  const pending = new Map();
  const request = services.fetch || fetch;
  const appleKeys = services.appleKeys || createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
  const googleKeys = services.googleKeys || createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  const firebaseKeys = services.firebaseKeys || createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
  let appleAvailable=false, googleAvailable=false;
  const firebaseAvailable=['FIREBASE_PROJECT_ID','FIREBASE_WEB_APP_ID','FIREBASE_API_KEY','FIREBASE_AUTH_DOMAIN'].every(key=>Boolean(config[key]));
  const firebaseConfig=firebaseAvailable?{projectId:config.FIREBASE_PROJECT_ID,appId:config.FIREBASE_WEB_APP_ID,apiKey:config.FIREBASE_API_KEY,authDomain:config.FIREBASE_AUTH_DOMAIN}:null;
  const googleRedirect=config.GOOGLE_REDIRECT_URI || `${origin || `http://127.0.0.1:${config.PORT || 3001}`}/api/auth/google/callback`;
  try { const u=new URL(origin); appleAvailable=u.protocol==='https:' && u.origin===origin && !loopback(u.hostname) && ['APPLE_CLIENT_ID','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY_PATH'].every(k=>Boolean(config[k])); } catch {}
  try { const u=new URL(googleRedirect); googleAvailable=Boolean(config.GOOGLE_CLIENT_ID&&config.GOOGLE_CLIENT_SECRET) && u.pathname==='/api/auth/google/callback' && !u.search && !u.hash && !u.username && !u.password && (u.protocol==='https:' && u.origin===origin || local&&u.protocol==='http:'&&loopback(u.hostname)&&(!origin||u.origin===origin)); } catch {}
  const oauthCookie=provider=>cookieOptions.secure?`__Host-sgu_${provider}_oauth`:`sgu_local_${provider}_oauth`;
  // Preserve the Apple cookie name used by the existing flow.
  const appleCookie='__Host-sgu_oauth';
  const options=provider=>provider==='apple'?{...cookieOptions,secure:true,sameSite:'none'}:cookieOptions;
  const cookieName=provider=>provider==='apple'?appleCookie:oauthCookie(provider);
  function cleanup(){for(const [key,value] of pending)if(value.expires<=Date.now())pending.delete(key);}
  function memberSession(req,res,provider,payload,appleUser,asJson=false) {
    if(typeof payload.sub!=='string'||!payload.sub)throw new Error('Missing subject');
    // Provider subject is the identity key. Never merge separate accounts by an email claim.
    const memberId=`${provider}_${payload.sub}`;
    const existing=store.get('members',memberId);
    const verified=payload.email_verified===true||payload.email_verified==='true';
    const email=verified?clean(payload.email,254).toLowerCase():existing?.email||'';
    const suppliedName=provider==='apple'?[clean(appleUser?.name?.firstName,80),clean(appleUser?.name?.lastName,80)].filter(Boolean).join(' '):clean(payload.name,160);
    store.transaction(()=>{
      store.put('members',{...existing,id:memberId,provider,name:existing?.name||suppliedName||'Club member',email,emailVerified:verified||existing?.emailVerified||false,joinedDate:existing?.joinedDate||new Date().toISOString()});
      // A verified mailbox can claim its own unlinked guest registrations, never
      // another member's records. Provider accounts themselves stay separate.
      if(verified&&email)for(const r of store.all('registrations'))if(!r.memberId&&r.email===email)store.put('registrations',{...r,memberId});
      reconcileAttendanceBadges(store,memberId);
    });
    const previous=cookies(req)[sessionCookie];if(previous)sessions.delete(previous);
    const id=random();sessions.set(id,{memberId,role:'student',provider,expires:Date.now()+3600000});
    res.cookie(sessionCookie,id,{...cookieOptions,maxAge:3600000});notify();if(asJson)res.json({role:'student'});else res.redirect('/student/');
  }
  app.get('/api/auth/status',(req,res)=>{
    const session=sessions.get(cookies(req)[sessionCookie]);
    res.json({available:appleAvailable,authenticated:Boolean(session),providers:{apple:appleAvailable,google:firebaseAvailable||googleAvailable},googleMode:firebaseAvailable?'firebase':googleAvailable?'oauth':null,...(firebaseConfig?{firebaseConfig}:{}),...(local?{localPreview:true}:{}),...(session?{role:session.role,provider:session.provider||null}:{})});
  });
  app.post('/api/auth/firebase',express.json({limit:'8kb'}),async(req,res)=>{
    if(!firebaseAvailable)return res.status(503).json({error:'Firebase sign-in is unavailable.'});
    const expected=origin||(local&&loopback(req.hostname)?`http://${req.get('host')}`:'');
    if(!expected||req.get('origin')!==expected)return res.status(403).json({error:'Invalid origin'});
    const token=req.body?.idToken;
    if(typeof token!=='string'||token.length<100||token.length>8192)return res.status(400).json({error:'Invalid sign-in token.'});
    try{
      const {payload}=await jwtVerify(token,firebaseKeys,{issuer:`https://securetoken.google.com/${config.FIREBASE_PROJECT_ID}`,audience:config.FIREBASE_PROJECT_ID,algorithms:['RS256'],requiredClaims:['sub','iat','exp','auth_time'],maxTokenAge:'1h'});
      if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>128||payload.email_verified!==true||!payload.email||payload.firebase?.sign_in_provider!=='google.com'||typeof payload.auth_time!=='number'||payload.auth_time>Date.now()/1000+60)throw new Error('Invalid Firebase identity');
      memberSession(req,res,'firebase',payload,null,true);
    }catch{res.status(401).json({error:'Google sign-in could not be verified.'});}
  });
  for(const provider of ['apple','google'])app.get(`/api/auth/${provider}`,(req,res)=>{
    cleanup();
    if(!(provider==='apple'?appleAvailable:googleAvailable))return res.redirect('/join/?auth=unavailable&provider='+provider);
    if(pending.size>=1000)return res.status(429).send('Please try again shortly.');
    const state=random(),nonce=random(),binding=random(),verifier=random();
    pending.set(state,{provider,nonce,binding,verifier,expires:Date.now()+600000});
    res.cookie(cookieName(provider),binding,{...options(provider),maxAge:600000});
    const query=new URLSearchParams({client_id:config[provider==='apple'?'APPLE_CLIENT_ID':'GOOGLE_CLIENT_ID'],redirect_uri:provider==='apple'?`${origin}/api/auth/apple/callback`:googleRedirect,response_type:'code',scope:provider==='apple'?'name email':'openid email profile',state,nonce});
    if(provider==='apple')query.set('response_mode','form_post');
    else {query.set('code_challenge',createHash('sha256').update(verifier).digest('base64url'));query.set('code_challenge_method','S256');query.set('prompt','select_account');}
    res.redirect((provider==='apple'?'https://appleid.apple.com/auth/authorize?':'https://accounts.google.com/o/oauth2/v2/auth?')+query);
  });
  async function callback(req,res,provider){
    cleanup();const input=provider==='apple'?req.body:req.query;
    const state=typeof input?.state==='string'?input.state:'';
    const attempt=pending.get(state);pending.delete(state);
    res.clearCookie(cookieName(provider),options(provider));
    if(!(provider==='apple'?appleAvailable:googleAvailable)||!attempt||attempt.provider!==provider||!equal(attempt.binding,cookies(req)[cookieName(provider)]))return res.redirect('/join/?auth=error');
    if(['user_cancelled_authorize','access_denied'].includes(input.error))return res.redirect('/join/?auth=cancelled');
    if(typeof input.code!=='string'||input.code.length>4096)return res.redirect('/join/?auth=error');
    try{
      let secret=config.GOOGLE_CLIENT_SECRET;
      if(provider==='apple'){
        const key=await importPKCS8(await (services.readFile||readFile)(config.APPLE_PRIVATE_KEY_PATH,'utf8'),'ES256');
        secret=await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:config.APPLE_KEY_ID}).setIssuer(config.APPLE_TEAM_ID).setSubject(config.APPLE_CLIENT_ID).setAudience('https://appleid.apple.com').setIssuedAt().setExpirationTime('5m').sign(key);
      }
      const body=new URLSearchParams({client_id:config[provider==='apple'?'APPLE_CLIENT_ID':'GOOGLE_CLIENT_ID'],client_secret:secret,code:input.code,grant_type:'authorization_code',redirect_uri:provider==='apple'?`${origin}/api/auth/apple/callback`:googleRedirect});
      if(provider==='google')body.set('code_verifier',attempt.verifier);
      const response=await request(provider==='apple'?'https://appleid.apple.com/auth/token':'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Token exchange failed');
      const tokens=await response.json();
      const {payload}=await jwtVerify(tokens.id_token,provider==='apple'?appleKeys:googleKeys,{issuer:provider==='apple'?'https://appleid.apple.com':['https://accounts.google.com','accounts.google.com'],audience:config[provider==='apple'?'APPLE_CLIENT_ID':'GOOGLE_CLIENT_ID'],algorithms:['RS256'],requiredClaims:['sub','iat','exp','nonce'],maxTokenAge:'10m'});
      if(!equal(payload.nonce,attempt.nonce))throw new Error('Invalid nonce');
      if(provider==='google'&&(payload.email_verified!==true||!payload.email))throw new Error('Unverified email');
      let user;try{user=typeof input.user==='string'?JSON.parse(input.user):undefined;}catch{}
      memberSession(req,res,provider,payload,user);
    }catch{res.redirect('/join/?auth=error');}
  }
  app.post('/api/auth/apple/callback',(req,res)=>callback(req,res,'apple'));
  app.get('/api/auth/google/callback',(req,res)=>callback(req,res,'google'));
  app.post('/api/auth/signout',(req,res)=>{
    const expected=origin||(local&&loopback(req.hostname)?`http://${req.get('host')}`:'');
    if(!expected||req.get('origin')!==expected)return res.status(403).json({error:'Invalid origin'});
    sessions.delete(cookies(req)[sessionCookie]);res.clearCookie(sessionCookie,cookieOptions);notify();res.sendStatus(204);
  });
}
