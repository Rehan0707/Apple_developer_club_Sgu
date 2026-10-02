import {api,escapeHTML as esc,message,submit,live,requireRole,parseEntryCode,isFirebaseHosted} from './client.js';
const el = id => document.getElementById(id);
const value = id => el(id)?.value || '';
const date = d => new Date(d).toLocaleString();
let events=[], resources=[], badges=[], students=[], badgeCounts={}, registrationRows=[], feedbackRows=[], checkinId=null, cameraStream=null, cameraTimer=null, scanBusy=false, editId=null, badgeId=null, bannerPreviewUrl=null;
function previewBanner(url){const preview=el('eventBannerPreview');if(!preview)return;preview.hidden=!url;if(url)preview.src=url;else preview.removeAttribute('src');}
const path = location.pathname;
if (/\/admin\/login(?:\.html)?\/?$/.test(path)) {
  if(isFirebaseHosted){el('username').value='developerclubapple@gmail.com';}
  else {el('username').type='text';el('username').placeholder='e.g. soham@dev';document.querySelector('label[for="username"]').textContent='Username';el('reset-password').hidden=true;}
  el('admin-login-form').addEventListener('submit', event=>submit(event,async()=>{
    try {if(isFirebaseHosted){const {signInAdminEmail}=await import('./firebase-backend.js');await signInAdminEmail(value('username'),value('password'));}else await api('/api/auth/admin',{method:'POST',body:JSON.stringify({username:value('username'),password:value('password')})});location.href='/admin/';}
    catch(error){el('error-msg').textContent=error.code==='auth/invalid-credential'?'Incorrect password. Use “Set or reset password” if this is your first password sign-in.':error.message;el('error-msg').style.display='block';}
  }));
  el('reset-password').addEventListener('click',async()=>{try{const {resetAdminPassword}=await import('./firebase-backend.js');await resetAdminPassword(value('username'));el('error-msg').textContent='Password setup email sent. Open it, set your password, then sign in here.';el('error-msg').style.color='#1d1d1f';el('error-msg').style.display='block';}catch(error){el('error-msg').textContent=error.message;el('error-msg').style.display='block';}});
} else if (await requireRole('admin')) {
  document.querySelectorAll('header span').forEach(node=>{if(node.textContent.trim()==='Alex Chen')node.textContent='Administrator';});
  const signout=document.createElement('button');signout.textContent='Sign out';signout.className='text-primary text-sm';signout.onclick=async()=>{try{await api('/api/auth/signout',{method:'POST'});location.href='/admin/login.html';}catch(e){message(e);}};document.querySelector('header')?.append(signout);
  live(load,{role:'admin',intervalMs:60000});
}
async function load() {
  if(el('eventsTable')) {
    let registrations;[events,students,badges,registrations]=await Promise.all([api('/api/admin/events'),api('/api/admin/students'),api('/api/badges'),api('/api/admin/registrations')]);
    renderBadgeSelect();
    document.querySelector('#eventsTable tbody').innerHTML=events.length?events.map(e=>`<tr><td class="p-space-md"><span class="font-medium">${esc(e.title)}</span><br><small>${esc(e.category)} · ${esc(e.status)}</small></td><td class="p-space-md">${esc(date(e.date))}</td><td class="p-space-md">${esc(e.location)}</td><td class="p-space-md text-right"><button class="text-primary" data-edit-event="${e.id}">Edit</button> <button class="text-error" data-delete-event="${e.id}">Delete</button></td></tr>`).join(''):'<tr><td colspan="4" class="p-space-md">No events yet. Add an event to open registration.</td></tr>';
    document.querySelectorAll('.font-display-lg:not(#registration-total)').forEach((node,i)=>node.textContent=[students.length,events.filter(e=>e.status==='upcoming'&&Date.parse(e.date)>Date.now()).length,badges.length][i]);
    el('registration-total').textContent=registrations.filter(r=>!r.cancelledAt).length;
  }
  if(el('resourcesTableBody')) {
    resources=await api('/api/resources');
    el('resourcesTableBody').innerHTML=resources.length?resources.map(r=>`<tr><td class="p-space-md"><a class="text-primary" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a></td><td class="p-space-md">${esc(r.category||'General')}</td><td class="p-space-md text-right"><button class="text-primary mr-3" data-edit-resource="${r.id}">Edit</button><button class="text-error" data-delete-resource="${r.id}">Delete</button></td></tr>`).join(''):'<tr><td colspan="3" class="p-space-md">No resources added yet.</td></tr>';
  }
  if(el('badgesGrid')) {
    [badges,students,events,badgeCounts]=await Promise.all([api('/api/badges'),api('/api/admin/students'),api('/api/admin/events'),api('/api/admin/badges/summary')]);
    renderBadges();
    const stats=await api('/api/admin/stats');
    document.querySelectorAll('.font-display-lg').forEach((node,i)=>node.textContent=[stats.awards,stats.badges][i]);
    if(el('badgeDetailsModal').open) await showBadge(badgeId,false);
  }
  if(el('registrations-list')) {
    const [rows,feedback]=await Promise.all([api('/api/admin/registrations'),api('/api/admin/feedback')]);
    registrationRows=rows;
    feedbackRows=feedback;
    const filter=el('feedback-event-filter'),selected=filter.value;
    const feedbackEvents=[...new Map(feedback.map(f=>[f.eventId,f.eventTitle])).entries()];
    filter.innerHTML='<option value="all">All events</option>'+feedbackEvents.map(([id,title])=>`<option value="${esc(id)}">${esc(title)}</option>`).join('');
    filter.value=feedbackEvents.some(([id])=>id===selected)?selected:'all';
    renderFeedback();
    el('registration-count').textContent=`· ${rows.filter(r=>!r.cancelledAt).length} active`;
    el('registrations-list').innerHTML=rows.length?`<div class="overflow-x-auto"><table class="w-full text-left"><thead><tr><th class="p-3">Event</th><th class="p-3">Student</th><th class="p-3">Department / Year</th><th class="p-3">Attendance</th><th class="p-3">Entry</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="p-3">${esc(r.title)}</td><td class="p-3">${esc(r.name)}<br><small>${esc(r.email)}</small></td><td class="p-3">${esc(r.branch)} ${esc(r.year)}</td><td class="p-3">${r.cancelledAt?'Cancelled':`<input type="checkbox" aria-label="Attendance for ${esc(r.name)}" data-attendance="${r.id}" ${r.attended?'checked':''}>`}</td><td class="p-3">${r.cancelledAt?'—':`<button type="button" class="text-primary font-semibold" data-checkin-id="${r.id}">Check in</button>`}</td></tr>`).join('')}</tbody></table></div>`:'No registrations found yet.';
    if(checkinId)renderCheckin();
  }
}
function renderFeedback(){
 const filter=el('feedback-event-filter');if(!filter)return;
 const visible=feedbackRows.filter(f=>filter.value==='all'||f.eventId===filter.value);
 const average=visible.length?(visible.reduce((sum,f)=>sum+f.rating,0)/visible.length).toFixed(1):null;
 el('feedback-count').textContent=visible.length?`${visible.length} response${visible.length===1?'':'s'} · ${average} / 5 average`:'No responses for this event yet.';
 el('feedback-results').innerHTML=visible.length?visible.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(f=>`<article class="feedback-review"><div class="flex flex-wrap justify-between gap-2"><strong>${esc(f.eventTitle)} · ${esc(f.memberName)}</strong><span>${'★'.repeat(f.rating)}${'☆'.repeat(5-f.rating)}</span></div>${f.liked?`<p><strong>Worked well:</strong> ${esc(f.liked)}</p>`:''}${f.improve?`<p><strong>Could improve:</strong> ${esc(f.improve)}</p>`:''}<small>${esc(date(f.updatedAt))}</small></article>`).join(''):'No feedback has been submitted for this event.';
}
el('feedback-event-filter')?.addEventListener('change',renderFeedback);
function renderCheckin(){
 const row=registrationRows.find(r=>r.id===checkinId);
 const result=el('checkin-result');if(!result)return;
 result.hidden=!row;if(!row)return;
 el('checkin-name').textContent=row.name;
 el('checkin-event').textContent=`${row.title} · ${row.eventDate?date(row.eventDate):'Date unavailable'} · ${row.eventLocation}`;
 el('checkin-email').textContent=`${row.email} · ${row.branch||'Department not provided'} ${row.year||''}`;
 const ready=!row.cancelledAt&&!row.attended&&!['draft','cancelled','deleted'].includes(row.eventStatus)&&Date.parse(row.eventDate)<=Date.now();
 el('checkin-state').textContent=row.cancelledAt?'This registration was cancelled.':row.attended?'Already checked in':ready?'Registration found. Confirm the attendee’s name before entry.':'Check-in opens when this event starts.';
 el('checkin-confirm').disabled=!ready;
}
function lookupCheckin(raw){
 const id=parseEntryCode(raw);
 const status=el('checkin-status');
 if(!id){checkinId=null;el('checkin-result').hidden=true;status.textContent='Enter a valid SGU entry code or registration ID.';return;}
 const row=registrationRows.find(r=>r.id===id);
 if(!row){checkinId=null;el('checkin-result').hidden=true;status.textContent='No registration matches that code.';return;}
 checkinId=id;el('checkin-code').value=`SGU-ENTRY:${id}`;status.textContent='Registration found. Check the attendee details below.';renderCheckin();
 el('checkin-result').scrollIntoView({block:'nearest',behavior:'smooth'});
}
function stopCamera(){
 if(cameraTimer)clearInterval(cameraTimer);cameraTimer=null;
 cameraStream?.getTracks().forEach(track=>track.stop());cameraStream=null;
 const video=el('checkin-video');if(video){video.pause();video.srcObject=null;video.hidden=true;}
 if(el('checkin-camera'))el('checkin-camera').textContent='Scan with camera';
}
async function toggleCamera(){
 if(cameraStream){stopCamera();el('checkin-status').textContent='Camera stopped. You can enter a code manually.';return;}
 if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia){el('checkin-status').textContent='Camera QR scanning is unavailable in this browser. Enter the code manually.';return;}
 try{
  const formats=await BarcodeDetector.getSupportedFormats();
  if(!formats.includes('qr_code'))throw new Error('QR scanning is unavailable in this browser.');
  const detector=new BarcodeDetector({formats:['qr_code']});
  cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
  const video=el('checkin-video');video.srcObject=cameraStream;video.hidden=false;await video.play();
  el('checkin-camera').textContent='Stop camera';el('checkin-status').textContent='Point the camera at an SGU entry QR code.';
  cameraTimer=setInterval(async()=>{if(scanBusy||video.readyState<2)return;scanBusy=true;try{const codes=await detector.detect(video);const code=codes.map(item=>item.rawValue).find(value=>parseEntryCode(value));if(code){stopCamera();lookupCheckin(code);}}catch(error){el('checkin-status').textContent='Could not scan this frame. Try again or enter the code manually.';}finally{scanBusy=false;}},300);
 }catch(error){stopCamera();el('checkin-status').textContent=error.message||'Camera unavailable. Enter the code manually.';}
}
el('checkin-form')?.addEventListener('submit',event=>{event.preventDefault();stopCamera();lookupCheckin(value('checkin-code'));});
el('checkin-camera')?.addEventListener('click',toggleCamera);
el('checkin-confirm')?.addEventListener('click',async()=>{if(!checkinId)return;const button=el('checkin-confirm');button.disabled=true;try{await api('/api/admin/registrations/'+checkinId,{method:'PUT',body:JSON.stringify({attended:true})});await load();const row=registrationRows.find(r=>r.id===checkinId);el('checkin-status').textContent=row?.memberId?'Entry confirmed. Attendance and badge updated.':'Entry confirmed. The badge will appear when this guest links a member account.';}catch(error){message(error);renderCheckin();}});
window.addEventListener('pagehide',stopCamera,{once:true});
document.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  try {
    if(b.dataset.editEvent){const e=events.find(e=>e.id===b.dataset.editEvent);editId=e.id;el('eventName').value=e.title;el('eventCat').value=e.category;el('eventDescription').value=e.description||'';el('eventStatus').value=e.status;el('eventLoc').value=e.location;el('eventCap').value=e.capacity||'';previewBanner(e.bannerUrl);renderBadgeSelect(e.badgeId||'');el('eventDate').value=new Date(Date.parse(e.date)-new Date(e.date).getTimezoneOffset()*60000).toISOString().slice(0,16);el('addEventModal').showModal();}
    if(b.dataset.deleteEvent&&confirm('Delete this event? Existing registrations will remain in your records.')){await api('/api/admin/events/'+b.dataset.deleteEvent,{method:'DELETE'});await load();}
    if(b.dataset.editResource){const r=resources.find(r=>r.id===b.dataset.editResource);el('resId').value=r.id;el('resTitle').value=r.title;el('resUrl').value=r.url;el('resDesc').value=r.desc||'';el('resCategory').value=r.category||'General';el('resourceModalTitle').textContent='Edit Resource';el('addResourceModal').showModal();}
    if(b.dataset.deleteResource&&confirm('Delete this resource?')){await api('/api/admin/resources/'+b.dataset.deleteResource,{method:'DELETE'});await load();}
    if(b.dataset.badge)await showBadge(b.dataset.badge);
    if(b.dataset.checkinId)lookupCheckin(b.dataset.checkinId);
  }catch(error){message(error);}
});
document.addEventListener('change',async event=>{if(event.target.dataset.attendance){try{await api('/api/admin/registrations/'+event.target.dataset.attendance,{method:'PUT',body:JSON.stringify({attended:event.target.checked})});}catch(e){event.target.checked=!event.target.checked;message(e);}}});
window.handleEventSubmit=event=>submit(event,async()=>{const file=el('eventBanner').files[0];if(file&&file.size>5*1024*1024)throw new Error('Banner image must be 5 MB or smaller.');let bannerUrl=editId?events.find(e=>e.id===editId)?.bannerUrl||'':'';if(file){const upload=await api('/api/admin/event-banner',{method:'POST',headers:{'Content-Type':file.type},body:file});bannerUrl=upload.url;}await api('/api/admin/events'+(editId?'/'+editId:''),{method:editId?'PUT':'POST',body:JSON.stringify({title:value('eventName'),category:value('eventCat'),description:value('eventDescription'),date:new Date(value('eventDate')).toISOString(),location:value('eventLoc'),capacity:value('eventCap'),badgeId:value('eventBadge'),status:value('eventStatus'),bannerUrl})});el('addEventModal').close();await load();message('Event saved.');});
window.handleResourceSubmit=event=>submit(event,async()=>{const id=value('resId');await api('/api/admin/resources'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify({title:value('resTitle'),url:value('resUrl'),category:value('resCategory'),desc:value('resDesc')})});el('addResourceModal').close();await load();message('Resource saved.');});
window.updatePreview=()=>{el('badgePreviewIcon').textContent=value('badgeIcon')||'star';el('badgePreview').style.color=({primary:'#0071e3',secondary:'#34c759',tertiary:'#af52de',error:'#d70015'})[value('badgeColor')];};
window.handleBadgeSubmit=event=>submit(event,async()=>{await api('/api/admin/badges',{method:'POST',body:JSON.stringify({name:value('badgeName'),desc:value('badgeDesc'),icon:value('badgeIcon')||'star',color:value('badgeColor')})});el('addBadgeModal').close();await load();message('Badge saved.');});
async function showBadge(id,show=true){badgeId=id;const badge=badges.find(b=>b.id===id);if(!badge)return;const assigned=events.find(e=>e.badgeId===id);el('detailBadgeName').textContent=badge.name;el('detailBadgeImage').src=badge.imageUrl;el('detailBadgeEvent').textContent=badge.type==='event'?(assigned?'Event: '+assigned.title:'No event assigned yet'):'Custom badge';el('detailBadgeCount').textContent=(badgeCounts[id]||0)+' member'+(badgeCounts[id]===1?'':'s')+' earned this badge';const assignButton=el('badgeDetailsModal').querySelector('[onclick="openAssignModal()"]');assignButton.hidden=badge.type==='event';let note=el('badge-assignment-note');if(!note){note=document.createElement('p');note.id='badge-assignment-note';note.className='p-space-md text-sm text-on-surface-variant';el('badgeStudentsList').before(note);}note.textContent=badge.type==='event'?(assigned?'Awarded after confirmed attendance.':'Assign this badge in the event editor.'):'';const rows=await api('/api/admin/badges/'+id+'/students');el('badgeStudentsList').innerHTML=rows.length?rows.map(s=>`<li class="py-2 border-b">${esc(s.name)} (${esc(s.email)})</li>`).join(''):'<li>No students have this badge yet.</li>';if(show)el('badgeDetailsModal').showModal();}
window.openAssignModal=()=>{el('assignStudentSelect').innerHTML='<option value="">Select a student...</option>'+students.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} (${esc(s.email)})</option>`).join('');el('assignBadgeModal').showModal();};
window.handleAssignSubmit=event=>submit(event,async()=>{await api('/api/admin/badges/assign',{method:'POST',body:JSON.stringify({badgeId,studentId:value('assignStudentSelect')})});el('assignBadgeModal').close();await showBadge(badgeId,false);message('Badge assigned.');});
el('eventBanner')?.addEventListener('change',()=>{if(bannerPreviewUrl)URL.revokeObjectURL(bannerPreviewUrl);const file=el('eventBanner').files[0];bannerPreviewUrl=file?URL.createObjectURL(file):null;previewBanner(bannerPreviewUrl||(editId?events.find(e=>e.id===editId)?.bannerUrl:''));});
for(const modal of document.querySelectorAll('dialog'))modal.addEventListener('close',()=>{modal.querySelector('form')?.reset();if(modal.id==='addEventModal'){editId=null;previewBanner(null);if(bannerPreviewUrl)URL.revokeObjectURL(bannerPreviewUrl);bannerPreviewUrl=null;}if(el('resId'))el('resId').value='';if(el('resourceModalTitle'))el('resourceModalTitle').textContent='Add Resource';});

function renderBadges(){
 const grid=el('badgesGrid');if(!grid)return;
 const query=el('badgeSearch').value.trim().toLowerCase(),filter=el('badgeFilter').value;
 const visible=badges.filter(b=>{const assigned=events.find(e=>e.badgeId===b.id);return (b.name+' '+b.desc+' '+(assigned?.title||'')).toLowerCase().includes(query) && (filter==='all'||filter==='assigned'&&assigned||filter==='unassigned'&&!assigned||filter==='earned'&&(badgeCounts[b.id]||0)>0);});
 el('visibleBadgeCount').textContent=`· ${visible.length} of ${badges.length}`;
 grid.innerHTML=visible.length?visible.map(b=>{const assigned=events.find(e=>e.badgeId===b.id),count=badgeCounts[b.id]||0;return `<button type="button" data-badge="${esc(b.id)}" class="badge-admin-card bg-white rounded-2xl border border-outline-variant shadow-sm flex flex-col items-center p-space-lg text-center hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/40"><img src="${esc(b.imageUrl)}" alt="" class="w-28 h-28 mb-space-md object-contain"><h3 class="font-title-md font-bold mb-1">${esc(b.name)}</h3><p class="badge-admin-desc font-caption-sm text-on-surface-variant mb-space-md">${esc(b.desc)}</p><div class="mt-auto w-full border-t border-outline-variant pt-space-md"><p class="font-caption-sm font-medium text-on-surface">${esc(assigned?.title|| (b.type==='event'?'No event assigned':'Custom badge'))}</p><p class="font-caption-sm text-on-surface-variant mt-1">${count} member${count===1?'':'s'} earned</p><span class="inline-block mt-space-md px-space-md py-1.5 border border-outline-variant rounded-lg font-caption-sm font-semibold">View Details</span></div></button>`;}).join(''):'<p class="text-on-surface-variant col-span-full">No badges match your search.</p>';
}
el('badgeSearch')?.addEventListener('input',renderBadges);
el('badgeFilter')?.addEventListener('change',renderBadges);

function renderBadgeSelect(selected) {
 const select=el('eventBadge');if(!select)return;
 const current=selected ?? (select.closest('dialog').open?select.value:(!events.length?'event-badge-01':''));
 select.innerHTML='<option value="">No badge assigned</option>'+badges.filter(b=>b.type==='event').map(b=>{
  const assigned=events.find(e=>e.badgeId===b.id&&e.id!==editId);
  return `<option value="${esc(b.id)}" ${assigned?'disabled':''}>${esc(b.name)}${assigned?' — '+esc(assigned.title):''}</option>`;
 }).join('');select.value=current;
}
