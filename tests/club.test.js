import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { entryCode, parseEntryCode } from '../src/client.js';
const config={LOCAL_PREVIEW:'true',ADMIN_USERNAME:'admin',ADMIN_PASSWORD_HASH:'test:'+scryptSync('correct-password','test',64).toString('hex')};
async function server(config,run){const app=createApp(config),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;const request=(path,{body,cookie,method='GET',origin=base}={})=>fetch(base+path,{method,headers:{origin,...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});try{return await run(request,base);}finally{await new Promise(r=>server.close(r));app.locals.close();}}
async function login(req,role='admin'){const res=await req(role==='admin'?'/api/auth/admin':'/api/auth/local-student',{method:'POST',body:role==='admin'?{username:'admin',password:'correct-password'}:{}});assert.equal(res.status,200);return res.headers.get('set-cookie').split(';')[0];}
const event={title:'Swift Workshop',date:'2099-01-01T10:00:00Z',location:'SGU Lab',capacity:2};
test('admin auth rejects bypass, wrong password, cross origin and student privileges',()=>server(config,async req=>{
 assert.equal((await req('/api/auth/mock/admin',{method:'POST'})).status,404);
 assert.equal((await req('/api/auth/admin',{method:'POST',body:{username:'admin',password:'wrong'}})).status,401);
 assert.equal((await req('/api/auth/admin',{method:'POST',origin:'https://evil.example',body:{username:'admin',password:'correct-password'}})).status,403);
 const student=await login(req,'student');assert.equal((await req('/api/admin/students',{cookie:student})).status,403);
 assert.equal((await req('/api/admin/events',{method:'POST',cookie:student,body:event})).status,403);
}));
test('hosted origin can use Render service URL without a hardcoded public origin',()=>server({...config,LOCAL_PREVIEW:'false',NODE_ENV:'production',RENDER_EXTERNAL_URL:'https://club.example.test'},async req=>{
 const login=await req('/api/auth/admin',{method:'POST',origin:'https://club.example.test',body:{username:'admin',password:'correct-password'}});
 assert.equal(login.status,200);
 assert.match(login.headers.get('set-cookie'),/__Host-sgu_session=.*Secure/);
 assert.equal((await req('/api/auth/admin',{method:'POST',origin:'https://other.example.test',body:{username:'admin',password:'correct-password'}})).status,403);
}));
test('events, capacity, duplicate prevention, attendance, badges and dashboard work together',()=>server(config,async req=>{
 const admin=await login(req),student=await login(req,'student');
 const created=await req('/api/admin/events',{method:'POST',cookie:admin,body:event});assert.equal(created.status,201);const e=await created.json();
 assert.equal((await req('/api/events/missing/register',{method:'POST',cookie:student,body:{}})).status,409);
 const registered=await req(`/api/events/${e.id}/register`,{method:'POST',cookie:student,body:{}});assert.equal(registered.status,201);const reg=await registered.json();
 assert.equal(parseEntryCode(entryCode(reg.registrationId)),reg.registrationId);
 assert.equal(parseEntryCode('SGU-ENTRY:invalid'),null);
 const adminRegistration=(await(await req('/api/admin/registrations',{cookie:admin})).json())[0];
 assert.equal(adminRegistration.eventDate,e.date);assert.equal(adminRegistration.eventStatus,'upcoming');
 assert.equal((await req(`/api/events/${e.id}/register`,{method:'POST',cookie:student,body:{}})).status,409);
 const guest={name:'Guest',email:'guest@example.com',branch:'CSE',year:'1st Year'};
 assert.equal((await req(`/api/events/${e.id}/register`,{method:'POST',body:guest})).status,201);
 assert.equal((await req(`/api/events/${e.id}/register`,{method:'POST',body:{...guest,email:'other@example.com'}})).status,409);
 await req('/api/admin/events/'+e.id,{method:'PUT',cookie:admin,body:{...event,date:'2020-01-01T10:00:00Z',status:'past'}});
 await req('/api/admin/registrations/'+reg.registrationId,{method:'PUT',cookie:admin,body:{attended:true}});
 const badge=await (await req('/api/admin/badges',{method:'POST',cookie:admin,body:{name:'Builder',desc:'Built an app',color:'primary'}})).json();
 for(let i=0;i<2;i++)assert.equal((await req('/api/admin/badges/assign',{method:'POST',cookie:admin,body:{badgeId:badge.id,studentId:'local-student'}})).status,200);
 const dashboard=await (await req('/api/me/dashboard',{cookie:student})).json();assert.equal(dashboard.registeredEvents.length,1);assert.equal(dashboard.registeredEvents[0].attended,true);assert.equal(dashboard.badges.length,2);
 await req('/api/admin/events/'+e.id,{method:'DELETE',cookie:admin});assert.deepEqual(await (await req('/api/events')).json(),[]);
 assert.equal((await req(`/api/events/${e.id}/register`,{method:'POST',body:guest})).status,409);
}));
test('parallel registrations cannot exceed capacity',()=>server(config,async req=>{
 const cookie=await login(req);const eventRow=await(await req('/api/admin/events',{method:'POST',cookie,body:{...event,capacity:1}})).json();
 const results=await Promise.all([1,2].map(i=>req(`/api/events/${eventRow.id}/register`,{method:'POST',body:{name:'Guest',email:`guest${i}@example.com`,branch:'CSE',year:'1st'}})));
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
}));
test('member cancellation releases a seat, preserves admin history, and invalidates check-in',()=>server(config,async req=>{
 const admin=await login(req),student=await login(req,'student');
 const created=await(await req('/api/admin/events',{method:'POST',cookie:admin,body:{...event,capacity:1}})).json();
 const registered=await(await req(`/api/events/${created.id}/register`,{method:'POST',cookie:student,body:{}})).json();
 assert.equal((await req(`/api/events/${created.id}/register`,{method:'POST',body:{name:'Guest',email:'guest@example.com',branch:'CSE',year:'1st'}})).status,409);
 assert.equal((await req(`/api/me/registrations/${registered.registrationId}`,{method:'DELETE'})).status,401);
 assert.equal((await req(`/api/me/registrations/${registered.registrationId}`,{method:'DELETE',cookie:admin})).status,403);
 assert.equal((await req(`/api/me/registrations/${registered.registrationId}`,{method:'DELETE',cookie:student})).status,200);
 assert.equal((await req(`/api/me/registrations/${registered.registrationId}`,{method:'DELETE',cookie:student})).status,409);
 assert.equal((await(await req('/api/events')).json())[0].registeredCount,0);
 assert.equal((await(await req('/api/me/dashboard',{cookie:student})).json()).registeredEvents.length,0);
 const records=await(await req('/api/admin/registrations',{cookie:admin})).json();assert.ok(records[0].cancelledAt);
 assert.equal((await req(`/api/admin/registrations/${registered.registrationId}`,{method:'PUT',cookie:admin,body:{attended:true}})).status,409);
 assert.equal((await req(`/api/events/${created.id}/register`,{method:'POST',body:{name:'Guest',email:'guest@example.com',branch:'CSE',year:'1st'}})).status,201);
 assert.equal((await(await req('/api/events')).json())[0].registeredCount,1);
}));
test('event detail changes are visible to registered members without changing their registration',()=>server(config,async req=>{
 const admin=await login(req),student=await login(req,'student');
 const created=await(await req('/api/admin/events',{method:'POST',cookie:admin,body:event})).json();
 await req(`/api/events/${created.id}/register`,{method:'POST',cookie:student,body:{}});
 const changed=await(await req(`/api/admin/events/${created.id}`,{method:'PUT',cookie:admin,body:{...event,location:'Innovation Hall',description:'Build a SwiftUI prototype'}})).json();
 assert.match(changed.changeSummary,/location/);assert.match(changed.changeSummary,/details/);
 const dashboard=await(await req('/api/me/dashboard',{cookie:student})).json();
 assert.equal(dashboard.registeredEvents[0].location,'Innovation Hall');
 assert.equal(dashboard.registeredEvents[0].description,'Build a SwiftUI prototype');
 assert.equal(dashboard.registeredEvents[0].changedAt,changed.changedAt);
}));
test('only an attended member can submit and edit feedback, which admins can review',()=>server(config,async req=>{
 const admin=await login(req),student=await login(req,'student');
 const created=await(await req('/api/admin/events',{method:'POST',cookie:admin,body:event})).json();
 const registered=await(await req(`/api/events/${created.id}/register`,{method:'POST',cookie:student,body:{}})).json();
 const path=`/api/me/registrations/${registered.registrationId}/feedback`;
 assert.equal((await req(path,{method:'PUT',cookie:student,body:{rating:5}})).status,409);
 assert.equal((await req(path,{method:'PUT',cookie:admin,body:{rating:5}})).status,403);
 await req('/api/admin/events/'+created.id,{method:'PUT',cookie:admin,body:{...event,date:'2020-01-01T10:00:00Z',status:'past'}});
 assert.equal((await req(path,{method:'PUT',cookie:student,body:{rating:5}})).status,409);
 await req('/api/admin/registrations/'+registered.registrationId,{method:'PUT',cookie:admin,body:{attended:true}});
 assert.equal((await req(path,{method:'PUT',cookie:student,body:{rating:0}})).status,400);
 assert.equal((await req(path,{method:'PUT',cookie:student,body:{rating:6}})).status,400);
 assert.equal((await req(path,{method:'PUT',cookie:student,body:{rating:5,liked:'Hands-on SwiftUI',improve:'More time for questions'}})).status,200);
 assert.equal((await req(path,{method:'PUT',cookie:student,body:{rating:4,liked:'Good workshop',improve:''}})).status,200);
 const dashboard=await(await req('/api/me/dashboard',{cookie:student})).json();assert.equal(dashboard.registeredEvents[0].feedback.rating,4);
 assert.equal((await req('/api/admin/feedback',{cookie:student})).status,403);
 const feedback=await(await req('/api/admin/feedback',{cookie:admin})).json();assert.equal(feedback.length,1);assert.equal(feedback[0].liked,'Good workshop');
 await req('/api/admin/registrations/'+registered.registrationId,{method:'PUT',cookie:admin,body:{attended:false}});
 assert.deepEqual(await(await req('/api/admin/feedback',{cookie:admin})).json(),[]);
}));
test('invalid fields and unsafe resource URLs are rejected',()=>server(config,async req=>{
 const cookie=await login(req);
 for(const url of ['javascript:alert(1)','data:text/html,x','http://example.com'])assert.equal((await req('/api/admin/resources',{method:'POST',cookie,body:{title:'Bad link',url}})).status,400);
 assert.equal((await req('/api/admin/events',{method:'POST',cookie,body:{...event,date:'not a date'}})).status,400);
 const resource=await(await req('/api/admin/resources',{method:'POST',cookie,body:{title:'Swift',url:'https://www.swift.org/'}})).json();
 assert.equal((await req('/api/admin/resources/'+resource.id,{method:'PUT',cookie,body:{title:'Swift Docs',url:'https://www.swift.org/documentation/'}})).status,200);
 assert.equal((await req('/api/admin/resources/'+resource.id,{method:'DELETE',cookie})).status,204);
}));
test('admin publishes and removes app logos while visitors can read them',()=>server(config,async req=>{
 const admin=await login(req),student=await login(req,'student');
 const logo={name:'Club App',imageUrl:'data:image/webp;base64,UklGRg=='};
 assert.deepEqual(await(await req('/api/app-logos')).json(),[]);
 assert.equal((await req('/api/admin/app-logos',{method:'POST',cookie:student,body:logo})).status,403);
 assert.equal((await req('/api/admin/app-logos',{method:'POST',cookie:admin,body:{...logo,imageUrl:'data:image/svg+xml;base64,PHN2Zz4='}})).status,400);
 const created=await req('/api/admin/app-logos',{method:'POST',cookie:admin,body:logo});
 assert.equal(created.status,201);
 const row=await created.json();
 assert.equal(row.name,'Club App');
 assert.deepEqual((await(await req('/api/app-logos')).json()).map(item=>item.id),[row.id]);
 assert.equal((await req('/api/admin/app-logos/'+row.id,{method:'DELETE',cookie:student})).status,403);
 assert.equal((await req('/api/admin/app-logos/'+row.id,{method:'DELETE',cookie:admin})).status,204);
 assert.deepEqual(await(await req('/api/app-logos')).json(),[]);
}));
test('admin can upload an event banner and publish it on public event data',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sgu-banners-'));
 try{await server({...config,UPLOADS_PATH:directory},async(req,base)=>{
  const admin=await login(req),student=await login(req,'student');
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9jr8sAAAAASUVORK5CYII=','base64');
  const upload=(cookie,body)=>fetch(base+'/api/admin/event-banner',{method:'POST',headers:{origin:base,cookie,'content-type':'image/png'},body});
  assert.equal((await upload(student,image)).status,403);
  assert.equal((await upload(admin,Buffer.from('not an image'))).status,415);
  const result=await upload(admin,image);assert.equal(result.status,201);
  const {url}=await result.json();assert.match(url,/^\/uploads\/[0-9a-f-]+\.png$/);
  assert.equal((await fetch(base+url)).headers.get('content-type'),'image/png');
  const created=await req('/api/admin/events',{method:'POST',cookie:admin,body:{...event,bannerUrl:url}});assert.equal(created.status,201);
  assert.equal((await(await req('/api/events')).json())[0].bannerUrl,url);
  assert.equal((await req('/api/admin/events',{method:'POST',cookie:admin,body:{...event,bannerUrl:'javascript:alert(1)'}})).status,400);
 });}finally{await rm(directory,{recursive:true,force:true});}
});
test('sessions and data survive application restart; signout revokes access',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sgu-test-'));const persistent={...config,DATABASE_PATH:join(directory,'club.sqlite')};let cookie;
 try{await server(persistent,async req=>{cookie=await login(req);await req('/api/admin/events',{method:'POST',cookie,body:event});});await server(persistent,async req=>{assert.equal((await req('/api/admin/events',{cookie})).status,200);assert.equal((await(await req('/api/events')).json()).length,1);assert.equal((await req('/api/auth/signout',{method:'POST',cookie})).status,204);assert.equal((await req('/api/admin/events',{cookie})).status,403);});}finally{await rm(directory,{recursive:true,force:true});}
});
test('production never enables local student preview',()=>server({...config,NODE_ENV:'production'},async req=>{assert.equal((await req('/api/auth/status')).status,200);assert.equal((await req('/api/auth/local-student',{method:'POST'})).status,403);}));
test('changes are broadcast to an open live stream',()=>server(config,async(req,base)=>{
 const controller=new AbortController();
 const stream=await fetch(base+'/api/stream',{signal:controller.signal});assert.equal(stream.headers.get('content-type').split(';')[0],'text/event-stream');
 const reader=stream.body.getReader();await reader.read();
 const cookie=await login(req);
 await req('/api/admin/events',{method:'POST',cookie,body:event});
 const chunk=await reader.read();assert.match(new TextDecoder().decode(chunk.value),/event: change/);
 await req('/api/auth/signout',{method:'POST',cookie});
 const signout=await reader.read();assert.match(new TextDecoder().decode(signout.value),/event: change/);
 controller.abort();await reader.cancel().catch(()=>{});
}));
test('a public registration appears in admin records and sends a live update',()=>server(config,async(req,base)=>{
 const admin=await login(req);
 const created=await(await req('/api/admin/events',{method:'POST',cookie:admin,body:event})).json();
 const controller=new AbortController();
 const stream=await fetch(base+'/api/stream',{signal:controller.signal});
 const reader=stream.body.getReader();await reader.read();
 const registration=await req(`/api/events/${created.id}/register`,{method:'POST',body:{name:'Guest Member',email:'guest@example.com',branch:'Computer Science',year:'1st Year'}});
 assert.equal(registration.status,201);
 assert.match(new TextDecoder().decode((await reader.read()).value),/event: change/);
 const records=await(await req('/api/admin/registrations',{cookie:admin})).json();
 assert.equal(records.length,1);assert.equal(records[0].title,event.title);assert.equal(records[0].name,'Guest Member');
 controller.abort();await reader.cancel().catch(()=>{});
}));
test('ten supplied badges start locked, are event-specific and correct with attendance',()=>server(config,async req=>{
 const admin=await login(req), student=await login(req,'student');
 const before=await(await req('/api/me/badges',{cookie:student})).json();
 assert.equal(before.totalCount,10);assert.equal(before.earnedCount,0);
 const first=await(await req('/api/admin/events',{method:'POST',cookie:admin,body:event})).json();assert.equal(first.badgeId,'event-badge-01');
 const second=await(await req('/api/admin/events',{method:'POST',cookie:admin,body:{...event,title:'Second',badgeId:'event-badge-02'}})).json();
 assert.equal((await req('/api/admin/events',{method:'POST',cookie:admin,body:{...event,badgeId:'event-badge-02'}})).status,409);
 const reg=await(await req(`/api/events/${second.id}/register`,{method:'POST',cookie:student,body:{}})).json();
 assert.equal((await req('/api/admin/registrations/'+reg.registrationId,{method:'PUT',cookie:admin,body:{attended:true}})).status,409);
 await req('/api/admin/events/'+second.id,{method:'PUT',cookie:admin,body:{...event,title:'Second',date:'2020-01-01T10:00:00Z',status:'past',badgeId:'event-badge-02'}});
 for(let i=0;i<2;i++)assert.equal((await req('/api/admin/registrations/'+reg.registrationId,{method:'PUT',cookie:admin,body:{attended:true}})).status,200);
 const earned=await(await req('/api/me/badges',{cookie:student})).json();
 assert.equal(earned.earnedCount,1);assert.equal(earned.completedEvents,1);
 assert.equal((await req('/api/admin/badges/summary',{cookie:student})).status,403);
 const summary=await(await req('/api/admin/badges/summary',{cookie:admin})).json();
 assert.equal(summary['event-badge-01'],0);assert.equal(summary['event-badge-02'],1);
 assert.equal(earned.badges[0].earned,false);assert.equal(earned.badges[1].earned,true);assert.equal(earned.badges[1].eventId,second.id);assert.equal(earned.badges[1].eventTitle,'Second');
 assert.equal((await req('/api/admin/badges/assign',{method:'POST',cookie:admin,body:{badgeId:'event-badge-01',studentId:'local-student'}})).status,409);
 assert.equal((await req('/api/admin/registrations/'+reg.registrationId,{method:'PUT',cookie:student,body:{attended:true}})).status,403);
 await req('/api/admin/registrations/'+reg.registrationId,{method:'PUT',cookie:admin,body:{attended:false}});
 const corrected=await(await req('/api/me/badges',{cookie:student})).json();assert.equal(corrected.earnedCount,0);assert.equal(corrected.completedEvents,0);
}));
test('member project stays private until admin approval and can be unpublished',()=>server(config,async req=>{
 const admin=await login(req),student=await login(req,'student');
 const data={name:'Member App',description:'An app for our club',url:'https://example.com',imageUrl:'data:image/webp;base64,AAAA'};
 assert.equal((await req('/api/me/projects',{method:'POST',body:data})).status,401);
 const response=await req('/api/me/projects',{method:'POST',cookie:student,body:data});assert.equal(response.status,201);const project=await response.json();
 assert.equal(project.status,'pending');assert.equal((await(await req('/api/app-logos')).json()).length,0);
 assert.equal((await req('/api/admin/projects/'+project.id,{method:'PUT',cookie:student,body:{status:'approved'}})).status,403);
 assert.equal((await req('/api/admin/projects/'+project.id,{method:'PUT',cookie:admin,body:{status:'approved'}})).status,200);
 assert.equal((await(await req('/api/app-logos')).json())[0].description,data.description);
 await req('/api/admin/app-logos/'+project.id,{method:'DELETE',cookie:admin});
 assert.equal((await(await req('/api/app-logos')).json()).length,0);
 assert.equal((await(await req('/api/me/projects',{cookie:student})).json())[0].status,'rejected');
}));
