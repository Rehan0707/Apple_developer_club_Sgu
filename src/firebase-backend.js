import {projectDetails} from '../lib/project-data.js';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, linkWithPopup, signInAnonymously, signInWithEmailAndPassword, sendPasswordResetEmail, reload, signOut, setPersistence, browserLocalPersistence, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, runTransaction, onSnapshot, connectFirestoreEmulator } from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';
import { publicResourceSeeds } from '../lib/public-resource-seeds.js';
import { eventBadges } from '../lib/badges.js';
import { CollectionCache } from './collection-cache.js';

// Keep club administration signed in independently from member and guest flows.
// Firebase Auth otherwise shares one account across all tabs on this origin.
const useEmulators = Boolean(import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS === 'true');
const appConfig = useEmulators ? {...firebaseConfig, projectId:'demo-sgu-club', authDomain:'demo-sgu-club.firebaseapp.com'} : firebaseConfig;
const app = /^\/admin(?:\/|$)/.test(location.pathname) ? initializeApp(appConfig, 'club-admin') : initializeApp(appConfig);
const auth = getAuth(app);
const db = getFirestore(app);
if(useEmulators){
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true});
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
}
const adminEmail = 'developerclubapple@gmail.com';
let adminPasswordSession = false;
const authReady = auth.authStateReady().then(async () => {
  const user = auth.currentUser;
  adminPasswordSession = Boolean(user && (await user.getIdTokenResult()).claims.firebase?.sign_in_provider === 'password');
}).catch(() => { adminPasswordSession = false; });
const now = () => new Date().toISOString();
const ref = (kind, id) => doc(db, kind, id);
const fail = (text, status = 400) => { throw Object.assign(new Error(text), { status }); };
const bodyOf = options => options?.body && typeof options.body === 'string' ? JSON.parse(options.body) : {};
const clean = (value, label, max = 200, required = true) => {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || required && !value.trim()) fail(`Please enter a valid ${label}.`);
  return value.trim();
};
const isAdmin = user => Boolean(user && adminPasswordSession && !user.isAnonymous && user.emailVerified && user.email?.toLowerCase() === adminEmail);
const row = snapshot => snapshot.exists() ? { ...snapshot.data(), id: snapshot.data().id || snapshot.id } : null;
const liveData = new CollectionCache();
const all = kind => liveData.read(kind, async () => (await getDocs(collection(db, kind))).docs.map(row));
const owned = (kind, field, uid) => liveData.read(`${kind}:${field}:${uid}`, async () => (await getDocs(query(collection(db, kind), where(field, '==', uid)))).docs.map(row));
const byId = async (kind, id) => row(await getDoc(ref(kind, id)));
const sortedEvents = rows => rows.filter(e => e.status !== 'deleted').sort((a, b) => a.date.localeCompare(b.date));
const open = event => event?.status === 'upcoming' && Date.parse(event.date) > Date.now();
const publicEvents = rows => sortedEvents(rows).filter(e => e.status !== 'draft').map(({ lastRegistrationKey, ...e }) => ({ ...e, registrationOpen: open(e), registeredCount: e.registeredCount || 0 }));
const member = async user => user?.isAnonymous ? null : await byId('members', user.uid);
const ownedRegistrations = user => owned('registrations', 'ownerUid', user.uid);
const requireUser = async (anonymous = false) => {
  await authReady;
  if (!auth.currentUser && anonymous) await signInAnonymously(auth);
  if (!auth.currentUser) fail('Please sign in to continue.', 401);
  return auth.currentUser;
};
const requireAdmin = async () => { const user = await requireUser(); if (!isAdmin(user)) fail('Administrator access is required.', 403); return user; };
const requireMember = async () => { const user = await requireUser(); if (user.isAnonymous) fail('Please sign in with Google to open your member portal.', 401); return user; };
const badgeCatalog = async () => [...eventBadges, ...await all('badges')].sort((a, b) => (a.order || 1000) - (b.order || 1000));

async function progressFor(user, registrations, events, catalog, awards) {
  const completed = registrations.filter(r => r.attended && !r.cancelledAt).sort((a,b) => (a.completedAt || a.timestamp).localeCompare(b.completedAt || b.timestamp));
  const seen = new Set();
  const unique = completed.filter(r => { if (seen.has(r.eventId)) return false; seen.add(r.eventId); return true; });
  const badges = catalog.map(badge => {
    const event = events.find(e => e.badgeId === badge.id);
    const registration = unique.find(r => r.eventId === event?.id);
    const award = awards.find(a => a.memberId === user.uid && a.badgeId === badge.id);
    const earned = Boolean(registration || award);
    return { ...badge, earned, awardedAt: registration?.completedAt || award?.date || null, eventId: event?.id || null, eventTitle: event?.title || null, eventDate: event?.date || null, eventStatus: event?.status || null, progress: earned ? 1 : 0, remaining: earned ? 0 : 1 };
  });
  return { badges, completedEvents: unique.length, earnedCount: badges.filter(b => b.earned).length, totalCount: catalog.length, earnedEventBadges: badges.filter(b => b.type === 'event' && b.earned).length, nextBadge: badges.find(b => b.type === 'event' && !b.earned && b.eventStatus === 'upcoming') || badges.find(b => b.type === 'event' && !b.earned) || null };
}

async function seedResources() {
  if (!isAdmin(auth.currentUser)) return;
  const existing = await all('resources');
  if (existing.length) return;
  for (const resource of publicResourceSeeds) await setDoc(ref('resources', resource.id), resource);
}

export async function signInGoogle() {
  await authReady;
  const provider = new GoogleAuthProvider();
  let result;
  if (auth.currentUser?.isAnonymous) {
    try { result = await linkWithPopup(auth.currentUser, provider); }
    catch (error) {
      if (error.code !== 'auth/credential-already-in-use' && error.code !== 'auth/email-already-in-use') throw error;
      result = await signInWithPopup(auth, provider);
    }
  } else result = await signInWithPopup(auth, provider);
  const user = result.user;
  adminPasswordSession = false;
  if (!user.emailVerified) fail('Sign in with a verified Google email.');
  if (!isAdmin(user)) {
    await setDoc(ref('members', user.uid), { id: user.uid, name: user.displayName || user.email.split('@')[0], email: user.email.toLowerCase(), joinedDate: now() }, { merge: true });
    // A verified email can reclaim a guest registration made with that address.
    const matches = await getDocs(query(collection(db, 'registrations'), where('email', '==', user.email.toLowerCase())));
    for (const item of matches.docs) if (!item.data().memberId) await updateDoc(item.ref, { ownerUid: user.uid, memberId: user.uid });
  } else await seedResources();
  return { role: isAdmin(user) ? 'admin' : 'student' };
}

export async function signInAdminEmail(email, password) {
  await authReady;
  if (String(email).trim().toLowerCase() !== adminEmail) fail('This email does not have administrator access.', 403);
  await setPersistence(auth, browserLocalPersistence);
  const result = await signInWithEmailAndPassword(auth, adminEmail, password);
  await reload(result.user);
  adminPasswordSession = (await result.user.getIdTokenResult(true)).claims.firebase?.sign_in_provider === 'password';
  if (!isAdmin(result.user)) {
    await signOut(auth);
    adminPasswordSession = false;
    fail('Verify the admin email address before signing in.', 403);
  }
  await seedResources();
  return { role: 'admin' };
}

export async function resetAdminPassword(email) {
  if (String(email).trim().toLowerCase() !== adminEmail) fail('Enter the club administrator email address.', 400);
  await sendPasswordResetEmail(auth, adminEmail);
  return { success: true };
}

function eventData(value, current, events) {
  const title = clean(value.title, 'title');
  const location = clean(value.location, 'location');
  const date = clean(value.date, 'date');
  if (!Number.isFinite(Date.parse(date))) fail('Please enter a valid date.');
  const status = value.status || 'upcoming';
  if (!['draft','upcoming','past','cancelled'].includes(status)) fail('Invalid event status.');
  const capacity = value.capacity === '' || value.capacity == null ? null : Number(value.capacity);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000)) fail('Capacity must be a positive whole number.');
  const badgeId = value.badgeId === undefined ? current?.badgeId || (events.length ? null : eventBadges[0].id) : value.badgeId || null;
  if (badgeId && !eventBadges.some(b => b.id === badgeId)) fail('Select a club event badge.');
  if (badgeId && events.some(e => e.id !== current?.id && e.badgeId === badgeId && e.status !== 'deleted')) fail('This badge is already assigned to another event.', 409);
  const bannerUrl = value.bannerUrl === undefined ? current?.bannerUrl || '' : value.bannerUrl || '';
  if (bannerUrl && (!bannerUrl.startsWith('data:image/jpeg;base64,') || bannerUrl.length > 700000)) fail('Please choose a smaller banner image.');
  return { title, location, date: new Date(date).toISOString(), dateMs: Date.parse(date), status, capacity, badgeId, bannerUrl, category: clean(value.category, 'category', 80, false), description: clean(value.description, 'description', 2000, false) };
}

async function compressBanner(file) {
  if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type)) fail('Choose a PNG, JPEG, or WebP image.');
  if (file.size > 5 * 1024 * 1024) fail('Banner image must be 5 MB or smaller.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / bitmap.width, 800 / bitmap.height);
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  for (const quality of [.78, .65, .5, .35]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= 650000) return { url };
  }
  fail('This banner is too large after compression. Choose a smaller image.');
}

export async function firebaseApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const value = bodyOf(options);
  const route = path.split('?')[0].split('/').filter(Boolean).slice(1).map(decodeURIComponent);
  if (route[0] === 'health') return { status: 'ok' };
  if (route[0] === 'auth') {
    if (route[1] === 'status') { await authReady; const user = auth.currentUser; return { authenticated: Boolean(user && !user.isAnonymous), role: isAdmin(user) ? 'admin' : user && !user.isAnonymous ? 'student' : null, providers: { google: true, apple: false }, googleMode: 'firebase', firebaseConfig, localPreview: false }; }
    if (route[1] === 'signout') { await signOut(auth); adminPasswordSession = false; return { success: true }; }
    if (route[1] === 'local-student') fail('Local preview is available only on localhost.', 404);
    fail('Use Google sign-in for this account.', 400);
  }
  if (route[0] === 'admin' && route[1] === 'event-banner' && method === 'POST') { await requireAdmin(); return compressBanner(options.body); }
  if(route[0]==='me' && route[1]==='projects') {
    const user=await requireMember();
    if(method==='GET') return owned('projects','memberId',user.uid);
    if(method==='POST') {
      const details=projectDetails(value), imageUrl=clean(value.imageUrl,'app logo',700000);
      if(!/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(imageUrl)) fail('Choose a valid app logo.');
      const profile=await member(user),id=crypto.randomUUID();
      const project={...details,id,imageUrl,memberId:user.uid,creator:profile?.name||user.displayName||'Club member',status:'pending',createdAt:now()};
      await setDoc(ref('projects',id),project);return project;
    }
  }
  if(route[0]==='admin' && route[1]==='projects') {
    await requireAdmin();
    if(method==='GET') return all('projects');
    if(method==='PUT' && route[2]) {
      const status=value.status;if(!['approved','rejected'].includes(status)) fail('Choose an approval status.');
      await runTransaction(db,async tx=>{
        const snapshot=await tx.get(ref('projects',route[2]));if(!snapshot.exists())fail('Project not found.',404);
        const project=row(snapshot);tx.update(ref('projects',route[2]),{status,reviewedAt:now()});
        if(status==='approved')tx.set(ref('appLogos',project.id),{id:project.id,name:project.name,description:project.description,url:project.url,imageUrl:project.imageUrl,creator:project.creator,memberId:project.memberId,createdAt:project.createdAt});
        else tx.delete(ref('appLogos',project.id));
      });return {status};
    }
  }
  if (route[0] === 'app-logos' && method === 'GET') return (await all('appLogos')).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  if (route[0] === 'admin' && route[1] === 'app-logos') {
    await requireAdmin();
    if (route.length === 2 && method === 'POST') {
      const name = clean(value.name, 'app name', 80);
      const imageUrl = clean(value.imageUrl, 'app logo', 700000);
      if (!/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(imageUrl)) fail('Choose a valid app logo image.');
      const id = crypto.randomUUID();
      const logo = { id, name, imageUrl, description:clean(value.description,'description',1000,false),url:value.url?projectDetails({name,description:value.description||name,url:value.url}).url:'',creator:clean(value.creator,'creator',100,false),createdAt: now() };
      await setDoc(ref('appLogos', id), logo);
      return logo;
    }
    if(route.length===3 && method==='PUT') {
      const logo=await byId('appLogos',route[2]);if(!logo)fail('App logo not found.',404);
      const details=projectDetails(value);await updateDoc(ref('appLogos',route[2]),{...details,creator:clean(value.creator,'creator',100,false)});return {...logo,...details};
    }
    if (route.length === 3 && method === 'DELETE') {
      if (!await byId('appLogos', route[2])) fail('App logo not found.', 404);
      await runTransaction(db,async tx=>{const project=await tx.get(ref('projects',route[2]));tx.delete(ref('appLogos',route[2]));if(project.exists())tx.update(ref('projects',route[2]),{status:'rejected',reviewedAt:now()});});
      return null;
    }
  }
  if (route[0] === 'events' && route.length === 1 && method === 'GET') return publicEvents(await all('events'));
  if (route[0] === 'events' && route[2] === 'my-registration' && method === 'GET') {
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) return null;
    const registration = await byId('registrations', `${route[1]}_${user.uid}`);
    if (!registration || registration.cancelledAt) return null;
    const event = await byId('events', route[1]);
    return { registrationId: registration.id, eventId: registration.eventId, title: event?.title || 'Club event', email: registration.email };
  }
  if (route[0] === 'events' && route[2] === 'register' && method === 'POST') {
    const user = await requireUser(true);
    const eventRef = ref('events', route[1]);
    const registrationKey = `${route[1]}_${user.uid}`;
    const registrationRef = ref('registrations', registrationKey);
    const profile = await member(user);
    const name = clean(value.name || profile?.name || user.displayName, 'name', 100);
    const email = clean(value.email || profile?.email || user.email, 'email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Please enter a valid email address.');
    const details = { name, email, branch: clean(value.branch, 'department', 100, !profile), year: clean(value.year, 'year', 40, !profile), notes: clean(value.notes, 'notes', 1000, false) };
    const id = crypto.randomUUID();
    const result = await runTransaction(db, async tx => {
      const eventSnapshot = await tx.get(eventRef), registrationSnapshot = await tx.get(registrationRef);
      const event = row(eventSnapshot);
      if (!open(event)) fail('Registration is not open for this event.', 409);
      if (registrationSnapshot.exists() && !registrationSnapshot.data().cancelledAt) fail('You are already registered for this event.', 409);
      if (event.capacity && (event.registeredCount || 0) >= event.capacity) fail('This event is full.', 409);
      const registration = { ...details, id, registrationId: id, key: registrationKey, eventId: event.id, ownerUid: user.uid, memberId: user.isAnonymous ? null : user.uid, timestamp: now(), attended: false, cancelledAt: null };
      tx.set(registrationRef, registration);
      tx.update(eventRef, { registeredCount: (event.registeredCount || 0) + 1, lastRegistrationKey: registrationKey });
      return { registrationId: id, eventId: event.id, title: event.title };
    });
    return result;
  }
  if (route[0] === 'admin' && route[1] === 'events') {
    await requireAdmin();
    if (route.length === 2 && method === 'GET') return sortedEvents(await all('events'));
    if (route.length === 2 && method === 'POST') { const events = await all('events'); const id = crypto.randomUUID(); const event = { ...eventData(value, null, events), id, eventId: id, registeredCount: 0, lastRegistrationKey: null }; await setDoc(ref('events', id), event); return event; }
    if (route[3] === 'registrations' && method === 'GET') return (await all('registrations')).filter(r => r.eventId === route[2]);
    const current = await byId('events', route[2]); if (!current) fail('Event not found.', 404);
    if (method === 'PUT') { const changes = eventData(value, current, await all('events')); const labels = [['title','name'],['description','details'],['date','time'],['location','location'],['status','status']].filter(([key]) => current[key] !== changes[key]).map(([,label]) => label); const updated = { ...current, ...changes, ...(labels.length ? { changedAt: now(), changeSummary: labels.join(', ') } : {}) }; await setDoc(ref('events', route[2]), updated); return updated; }
    if (method === 'DELETE') { await updateDoc(ref('events', route[2]), { status: 'deleted' }); return null; }
  }
  if (route[0] === 'resources') {
    const resources = await all('resources');
    return resources.length ? resources : publicResourceSeeds;
  }
  if (route[0] === 'admin' && route[1] === 'resources') {
    await requireAdmin();
    if (method === 'POST' || method === 'PUT') { const url = clean(value.url, 'Resource URL', 2048); if (!url.startsWith('https://')) fail('Resource URL must be an HTTPS URL.'); const id = method === 'PUT' ? route[2] : crypto.randomUUID(); const resource = { id, title: clean(value.title, 'title'), url, category: clean(value.category, 'category', 80, false), desc: clean(value.desc, 'description', 2000, false) }; await setDoc(ref('resources', id), resource); return resource; }
    if (method === 'DELETE') { await deleteDoc(ref('resources', route[2])); return null; }
  }
  if (route[0] === 'badges' && method === 'GET') return badgeCatalog();
  if (route[0] === 'admin' && route[1] === 'badges') {
    await requireAdmin();
    if (route[2] === 'summary') { const badges = await badgeCatalog(), registrations = await all('registrations'), events = await all('events'), awards = await all('awards'); const counts = Object.fromEntries(badges.map(b => [b.id, 0])); for (const registration of registrations) if (registration.attended && !registration.cancelledAt && registration.memberId) { const badgeId = events.find(e => e.id === registration.eventId)?.badgeId; if (badgeId) counts[badgeId]++; } for (const award of awards) if (counts[award.badgeId] !== undefined) counts[award.badgeId]++; return counts; }
    if ((route[2] === 'assign' || route[2] === 'award') && method === 'POST') { const badgeId = clean(value.badgeId, 'badge'), studentId = clean(value.studentId || value.memberId, 'member'); const badge = (await badgeCatalog()).find(b => b.id === badgeId); if (!badge || badge.type === 'event' || !await byId('members', studentId)) fail('Badge or member not found.', 404); const id = `${studentId}_${badgeId}`; await setDoc(ref('awards', id), { id, badgeId, memberId: studentId, date: now() }); return { success: true }; }
    if (route[3] === 'students') { const awards = await all('awards'), registrations = await all('registrations'), events = await all('events'); const ids = new Set(awards.filter(a => a.badgeId === route[2]).map(a => a.memberId)); for (const reg of registrations) if (reg.attended && events.find(e => e.id === reg.eventId)?.badgeId === route[2] && reg.memberId) ids.add(reg.memberId); return (await all('members')).filter(m => ids.has(m.id)); }
    if (method === 'POST') { const id = crypto.randomUUID(); const color = value.color || 'primary'; if (!['primary','secondary','tertiary','error'].includes(color)) fail('Invalid badge color.'); const badge = { id, name: clean(value.name, 'name'), desc: clean(value.desc, 'description', 2000, false), icon: clean(value.icon || 'star', 'icon', 50), color, imageUrl: value.imageUrl || ({ primary:'/images/badge_blue.webp', secondary:'/images/badge_green.webp', tertiary:'/images/badge_orange.webp', error:'/images/badge_red.webp' })[color] }; await setDoc(ref('badges', id), badge); return badge; }
  }
  if (route[0] === 'team' && method === 'GET') return all('team');
  if (route[0] === 'admin' && route[1] === 'students') { await requireAdmin(); return all('members'); }
  if (route[0] === 'admin' && route[1] === 'stats') { await requireAdmin(); const [members, badges, awards, registrations] = await Promise.all([all('members'), badgeCatalog(), all('awards'), all('registrations')]); return { members: members.length, badges: badges.length, awards: awards.length + registrations.filter(r => r.attended && r.memberId && !r.cancelledAt).length }; }
  if (route[0] === 'admin' && route[1] === 'registrations') {
    await requireAdmin();
    if (route.length === 2 && method === 'GET') { const events = await all('events'); return (await all('registrations')).map(r => { const event = events.find(e => e.id === r.eventId); return { ...r, title: event?.title || 'Removed event', eventDate: event?.date || null, eventStatus: event?.status || 'deleted', eventLocation: event?.location || '' }; }); }
    if (method === 'PUT') { const registrations = await all('registrations'); const registration = registrations.find(r => r.id === route[2]); if (!registration) fail('Registration not found.', 404); const event = await byId('events', registration.eventId); if (registration.cancelledAt) fail('This registration was cancelled.', 409); if (typeof value.attended !== 'boolean') fail('Attendance must be true or false.'); if (value.attended && (!event || ['draft','cancelled','deleted'].includes(event.status) || Date.parse(event.date) > Date.now())) fail('Attendance can be confirmed after the event starts.', 409); await updateDoc(ref('registrations', registration.key), { attended: value.attended, completedAt: value.attended ? registration.completedAt || now() : null }); if (!value.attended) await deleteDoc(ref('feedback', registration.id)).catch(() => {}); return { success: true }; }
  }
  if (route[0] === 'admin' && route[1] === 'feedback') { await requireAdmin(); const events = await all('events'), registrations = await all('registrations'); return (await all('feedback')).map(f => ({ ...f, eventTitle: events.find(e => e.id === f.eventId)?.title || 'Removed event', memberName: registrations.find(r => r.id === f.registrationId)?.name || 'Former member' })); }
  if (route[0] === 'me') {
    const user = await requireMember();
    const registrations = (await ownedRegistrations(user)).filter(r => !r.cancelledAt);
    const events = await all('events');
    if (route[1] === 'registrations' && method === 'DELETE') { const registration = registrations.find(r => r.id === route[2]); if (!registration) fail('Registration not found.', 404); const eventRef = ref('events', registration.eventId), regRef = ref('registrations', registration.key); await runTransaction(db, async tx => { const eventSnapshot = await tx.get(eventRef), registrationSnapshot = await tx.get(regRef); const event = row(eventSnapshot), reg = row(registrationSnapshot); if (!open(event) || reg.attended || reg.cancelledAt) fail('Cancellation is available before the event starts.', 409); tx.update(regRef, { cancelledAt: now() }); tx.update(eventRef, { registeredCount: Math.max(0, (event.registeredCount || 0) - 1), lastRegistrationKey: registration.key }); }); return { success: true }; }
    if (route[1] === 'registrations' && route[3] === 'feedback' && method === 'PUT') { const registration = registrations.find(r => r.id === route[2]); if (!registration || !registration.attended) fail('Feedback opens after you attend the event.', 409); const rating = Number(value.rating); if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail('Choose a rating from 1 to 5.'); const previous = await byId('feedback', registration.id); const feedback = { id: registration.id, registrationId: registration.id, registrationKey: registration.key, eventId: registration.eventId, memberId: user.uid, rating, liked: clean(value.liked, 'what worked well', 1000, false), improve: clean(value.improve, 'what could improve', 1000, false), createdAt: previous?.createdAt || now(), updatedAt: now() }; await setDoc(ref('feedback', registration.id), feedback); return feedback; }
    const catalog = await badgeCatalog();
    const awards = await owned('awards', 'memberId', user.uid);
    const progress = await progressFor(user, registrations, events, catalog, awards);
    if (route[1] === 'badges') return progress;
    if (route[1] === 'dashboard') { const profile = await member(user); const feedback = await owned('feedback', 'memberId', user.uid); const registeredEvents = registrations.map(r => ({ ...events.find(e => e.id === r.eventId), ...r, feedback: feedback.find(f => f.registrationId === r.id) || null })); const badges = progress.badges.filter(b => b.earned).sort((a, b) => a.awardedAt.localeCompare(b.awardedAt)); return { ...(profile || { name: user.displayName || user.email }), memberId: user.uid, registeredEvents, badges, badgeProgress: progress }; }
  }
  fail('This action is not available.', 404);
}

export async function firebaseLive(refresh, role, intervalMs, selectedCollections) {
  await auth.authStateReady();
  const collections = selectedCollections ?? (role === 'admin' ? ['events','resources','badges','registrations','feedback','members','awards','appLogos'] : role === 'student' ? ['events','resources','badges'] : ['events','resources','badges','team','appLogos']);
  let refreshTimer;
  const waiting = new Set(collections);
  const schedule = () => { if(waiting.size)return; clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 60); };
  const stops = collections.map(name => onSnapshot(collection(db, name), snapshot => {
    liveData.publish(name, snapshot.docs.map(row));
    waiting.delete(name);
    schedule();
  }, error => { liveData.forget(name); waiting.delete(name); console.error('Live update unavailable', error); schedule(); }));
  if (!collections.length) stops.push(onAuthStateChanged(auth, schedule));
  if (role === 'student' && auth.currentUser) {
    const uid = auth.currentUser.uid;
    for (const [name, field] of [['registrations','ownerUid'],['awards','memberId'],['feedback','memberId'],['projects','memberId']]) {
      const key = `${name}:${field}:${uid}`;
      waiting.add(key);
      const stop = onSnapshot(query(collection(db, name), where(field, '==', uid)), snapshot => {
        liveData.publish(key, snapshot.docs.map(row)); waiting.delete(key); schedule();
      }, error => { liveData.forget(key); waiting.delete(key); console.error('Live update unavailable', error); schedule(); });
      stops.push(() => { stop(); liveData.forget(key); });
    }
  }
  const timer = intervalMs ? setInterval(refresh, intervalMs) : null;
  window.addEventListener('focus', schedule);
  window.addEventListener('pagehide', event => {
    stops.forEach(stop => stop()); collections.forEach(name => liveData.forget(name));
    clearTimeout(refreshTimer); if (timer) clearInterval(timer);
    window.removeEventListener('focus', schedule);
    if (event.persisted) window.addEventListener('pageshow', restored => {
      if (restored.persisted) firebaseLive(refresh, role, intervalMs, selectedCollections);
    }, {once:true});
  }, { once: true });
}
