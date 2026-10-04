import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const env = await initializeTestEnvironment({ projectId: 'demo-sgu-club', firestore: { host: '127.0.0.1', port: 8085, rules: readFileSync('firestore.rules', 'utf8') } });
const eventId = 'event-test';
const event = { id:eventId,eventId,title:'Test event',location:'Test',date:new Date(Date.now()+86400000).toISOString(),dateMs:Date.now()+86400000,status:'upcoming',capacity:2,badgeId:'event-badge-01',bannerUrl:'',category:'',description:'',registeredCount:0,lastRegistrationKey:null };
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => context.firestore().doc(`events/${eventId}`).set(event));
  const publicDb = env.unauthenticatedContext().firestore();
  assert((await publicDb.collection('events').get()).docs.length === 1);
  await assert.rejects(publicDb.collection('registrations').get());
  const guest = env.authenticatedContext('guest-1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const key = `${eventId}_guest-1`;
  const id = '11111111-1111-4111-8111-111111111111';
  const registration = {id,registrationId:id,key,eventId,ownerUid:'guest-1',memberId:null,name:'Test Guest',email:'test@example.com',branch:'Test',year:'1',notes:'',timestamp:new Date().toISOString(),attended:false,cancelledAt:null};
  try {
    await guest.runTransaction(async tx => {
      const eventRef=guest.doc(`events/${eventId}`), regRef=guest.doc(`registrations/${key}`);
      const e=await tx.get(eventRef);await tx.get(regRef);
      tx.set(regRef,registration);
      tx.update(eventRef,{registeredCount:e.data().registeredCount+1,lastRegistrationKey:key});
    });
    console.log('Anonymous registration transaction allowed.');
  } catch (error) {
    console.error('Registration denied:',error.message);
    throw error;
  }
  const saved = await guest.doc(`registrations/${key}`).get();
  assert.equal(saved.data().id,id);
  await assert.rejects(env.authenticatedContext('other').firestore().doc(`registrations/${key}`).get());
  console.log('Private registration read denied to another member.');
  await guest.runTransaction(async tx => {
    const eventRef=guest.doc(`events/${eventId}`), regRef=guest.doc(`registrations/${key}`);
    const e=await tx.get(eventRef);await tx.get(regRef);
    tx.update(regRef,{cancelledAt:new Date().toISOString()});
    tx.update(eventRef,{registeredCount:e.data().registeredCount-1,lastRegistrationKey:key});
  });
  assert.equal((await guest.doc(`events/${eventId}`).get()).data().registeredCount,0);
  await guest.runTransaction(async tx => {
    const eventRef=guest.doc(`events/${eventId}`), regRef=guest.doc(`registrations/${key}`);
    const e=await tx.get(eventRef);await tx.get(regRef);
    tx.set(regRef,{...registration,id:'22222222-2222-4222-8222-222222222222',registrationId:'22222222-2222-4222-8222-222222222222'});
    tx.update(eventRef,{registeredCount:e.data().registeredCount+1,lastRegistrationKey:key});
  });
  const memberDb=env.authenticatedContext('member-1',{email:'test@example.com',email_verified:true}).firestore();
  assert.equal((await memberDb.collection('registrations').where('email','==','test@example.com').get()).size,1);
  await memberDb.doc(`registrations/${key}`).update({ownerUid:'member-1',memberId:'member-1'});
  await assert.rejects(guest.doc(`registrations/${key}`).get());
  const oldGoogleAdmin=env.authenticatedContext('admin-google',{email:'developerclubapple@gmail.com',email_verified:true,firebase:{sign_in_provider:'google.com'}}).firestore();
  await assert.rejects(oldGoogleAdmin.doc(`registrations/${key}`).update({attended:true}));
  const adminDb=env.authenticatedContext('admin-1',{email:'developerclubapple@gmail.com',email_verified:true,firebase:{sign_in_provider:'password'}}).firestore();
  const logo={id:'club-app',name:'Club App',imageUrl:'data:image/webp;base64,UklGRg==',createdAt:new Date().toISOString()};
  await assert.rejects(memberDb.doc('appLogos/club-app').set(logo));
  await assert.rejects(oldGoogleAdmin.doc('appLogos/club-app').set(logo));
  await adminDb.doc('appLogos/club-app').set(logo);
  assert.equal((await publicDb.doc('appLogos/club-app').get()).data().name,'Club App');
  await adminDb.doc('appLogos/club-app').delete();
  await adminDb.doc(`registrations/${key}`).update({attended:true,completedAt:new Date().toISOString()});
  await memberDb.doc('members/member-1').set({id:'member-1',name:'Test Member',email:'test@example.com',joinedDate:new Date().toISOString()});
  assert.equal((await memberDb.collection('awards').where('memberId','==','member-1').get()).size,0);
  await memberDb.doc('feedback/22222222-2222-4222-8222-222222222222').set({id:'22222222-2222-4222-8222-222222222222',registrationId:'22222222-2222-4222-8222-222222222222',registrationKey:key,eventId,memberId:'member-1',rating:5,liked:'Useful',improve:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  await assert.rejects(env.authenticatedContext('other').firestore().collection('feedback').get());
  console.log('Cancellation, re-registration, verified ownership, attendance and feedback allowed; cross-member access denied.');
} finally { await env.cleanup(); }
