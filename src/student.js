import {badgeCard,setupBadgeDetails} from './badge-ui.js';
import {api,escapeHTML as esc,message,live,requireRole,youtubeVideoId,entryCode} from './client.js';
import QRCode from 'qrcode';
const el=id=>document.getElementById(id);
const tabs=['dashboard','events','badges','resources'];
window.switchTab=(id,push=true)=>{
  if(!tabs.includes(id))id='dashboard';
  document.querySelectorAll('.tab-content').forEach(n=>n.classList.toggle('active',n.id==='tab-'+id));
  document.querySelectorAll('.nav-btn').forEach(n=>{const active=n.id==='nav-'+id;n.classList.toggle('bg-primary/10',active);n.classList.toggle('text-primary',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
  document.title=(id==='badges'?'My Badges':'Member Portal')+' — Apple Developer Club SGU';
  if(push&&location.hash!=='#'+id)history.pushState(null,'','#'+id);
};
window.addEventListener('popstate',()=>switchTab(location.hash.slice(1),false));
switchTab(location.hash.slice(1)||'dashboard',false);
let collection=[],registrations=[];
const refreshBadgeDetails=setupBadgeDetails(()=>collection);
const badge=b=>`<div class="flex flex-col items-center text-center gap-2"><img src="${esc(b.imageUrl)}" alt="" class="w-28 h-28 object-contain"><h3 class="font-bold text-sm">${esc(b.name)}</h3><p class="text-xs text-on-surface-variant">${esc(b.desc)}</p></div>`;
const eventDate=value=>value&&!Number.isNaN(Date.parse(value))?new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date(value)):'Date to be announced';
const eventTime=value=>value&&!Number.isNaN(Date.parse(value))?new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value)):'Time to be announced';
const eventNotice=row=>row.changedAt&&row.timestamp&&Date.parse(row.changedAt)>=Date.parse(row.timestamp)?`<p class="member-event-notice" role="status">Event ${esc(row.changeSummary||'details')} updated. Please review the current information.</p>`:'';
function syncPassState(row){
  const checked=Boolean(row.attended);
  el('entry-pass-title').textContent=row.title||'Event entry pass';
  el('entry-pass-purpose').textContent=row.description||'Your place is reserved for this club event.';
  el('entry-pass-date').textContent=eventDate(row.date);
  el('entry-pass-time').textContent=eventTime(row.date);
  el('entry-pass-location').textContent=row.location||'To be announced';
  el('entry-pass-state').textContent=checked?'✓ Checked in — attendance confirmed':'Registration confirmed';
  el('entry-pass-state').classList.toggle('is-checked-in',checked);
  el('entry-pass-image').hidden=checked;
  el('entry-pass-code').hidden=checked;
  el('entry-pass-download').hidden=checked;
  el('entry-pass-badges').hidden=!checked;
  document.querySelector('.entry-pass-qr-wrap').hidden=checked;
  document.querySelector('.entry-pass-instruction').textContent=checked?'Your entry has been confirmed. Your event badge is available in your collection if one was assigned.':'Show this pass at the event entrance. The team will verify your registration and confirm check-in.';
}
const icsText=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
const icsDate=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
function downloadCalendar(row){
  const content=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Apple Developer Club SGU//Events//EN','BEGIN:VEVENT',`UID:${row.registrationId}@sgu-club`,`DTSTAMP:${icsDate(Date.now())}`,`DTSTART:${icsDate(row.date)}`,`SUMMARY:${icsText(row.title)}`,`DESCRIPTION:${icsText(row.description||'Apple Developer Club SGU event')}`,`LOCATION:${icsText(row.location)}`,'END:VEVENT','END:VCALENDAR',''].join('\r\n');
  const url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='sgu-club-event.ics';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
let refresh;
if(await requireRole('student')){
  const signout=document.createElement('button');signout.textContent='Sign out';signout.className='text-primary text-sm';signout.onclick=async()=>{try{await api('/api/auth/signout',{method:'POST'});location.href='/join/';}catch(e){message(e);}};document.querySelector('header')?.append(signout);
  refresh=live(async()=>{
    const [me,badges,resources,events]=await Promise.all([api('/api/me/dashboard'),api('/api/badges'),api('/api/resources'),api('/api/events')]);
    registrations=me.registeredEvents;
    if(el('entry-pass-dialog')?.open){const openId=el('entry-pass-dialog').dataset.registrationId;const current=registrations.find(r=>r.registrationId===openId);if(current)syncPassState(current);else el('entry-pass-dialog').close();}
    document.querySelector('#tab-dashboard h1').textContent=`Welcome back, ${me.name}!`;
    document.querySelectorAll('header span').forEach(n=>{if(n.textContent.trim()==='Alex Chen'||n.dataset.memberName){n.dataset.memberName='true';n.textContent=me.name;}});
    const progress=me.badgeProgress;
    if(!progress){location.replace('/admin/');return;}
    collection=progress.badges;
    const owned=collection.filter(b=>b.earned),locked=collection.filter(b=>!b.earned);
    el('owned-badges-grid').innerHTML=owned.length?owned.map(badgeCard).join(''):'<p class="text-on-surface-variant text-sm col-span-full">No badges earned yet.</p>';
    el('locked-badges-grid').innerHTML=locked.length?locked.map(badgeCard).join(''):'<p class="text-on-surface-variant text-sm col-span-full">You have earned all available badges!</p>';
    el('badge-event-count').textContent=progress.completedEvents;
    el('earned-badge-total').textContent='· '+progress.earnedCount+' of '+progress.totalCount;el('locked-badge-total').textContent='· '+locked.length;
    refreshBadgeDetails();
    const resourceGroups=new Map();for(const resource of resources){const category=resource.category||'General';if(!resourceGroups.has(category))resourceGroups.set(category,[]);resourceGroups.get(category).push(resource);}
    el('resources-list').innerHTML=resources.length?[...resourceGroups].map(([category,items])=>`<section><h3 class="font-bold text-lg mb-4">${esc(category)}</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-4">${items.map(r=>{const videoId=youtubeVideoId(r.url);return `<a class="flex items-center gap-4 p-4 bg-white rounded-xl border border-outline-variant" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${videoId?`<img src="https://i.ytimg.com/vi/${videoId}/hqdefault.jpg" alt="" loading="lazy" class="w-24 h-16 object-cover rounded-lg flex-shrink-0">`:''}<div class="min-w-0"><span class="font-semibold">${esc(r.title)}</span><p class="text-xs text-on-surface-variant">${esc(r.desc||'Apple Developer video')}</p></div><span class="material-symbols-outlined ml-auto">${videoId?'play_circle':'open_in_new'}</span></a>`;}).join('')}</div></section>`).join(''):'<p>No resources available.</p>';
    const eventCard=(e,registered=false)=>`<article class="member-event-card bg-white rounded-xl border border-outline-variant"><div class="member-event-copy"><span class="member-event-kicker">${esc(e.category||'CLUB EVENT')}</span><h3>${esc(e.title||'Removed event')}</h3><p class="member-event-purpose">${esc(e.description||'Event details will be shared by the club team.')}</p>${registered?eventNotice(e):''}<div class="member-event-facts"><span><span class="material-symbols-outlined" aria-hidden="true">calendar_today</span>${esc(eventDate(e.date))}</span><span><span class="material-symbols-outlined" aria-hidden="true">schedule</span>${esc(eventTime(e.date))}</span><span><span class="material-symbols-outlined" aria-hidden="true">location_on</span>${esc(e.location||'Location to be announced')}</span></div></div><div class="member-event-actions">${registered?`<span class="member-event-status">${esc(e.status==='deleted'?'Removed':e.status==='cancelled'?'Cancelled':e.attended?'Checked in':'Registered')}</span>${e.status!=='deleted'&&e.status!=='cancelled'?`<button type="button" data-entry-pass="${esc(e.registrationId)}" class="px-4 py-2 bg-primary/10 text-primary font-semibold rounded-lg text-sm">View QR pass</button><button type="button" data-calendar="${esc(e.registrationId)}" class="member-event-secondary">Add to calendar</button>${e.attended?`<button type="button" data-feedback="${esc(e.registrationId)}" class="member-event-secondary">${e.feedback?'Edit feedback':'Give feedback'}</button>`:''}${!e.attended&&Date.parse(e.date)>Date.now()&&e.status==='upcoming'?`<button type="button" data-cancel-registration="${esc(e.registrationId)}" class="member-event-cancel">Cancel place</button>`:''}`:''}`:`<button data-register="${esc(e.id)}" class="px-4 py-2 bg-primary/10 text-primary font-semibold rounded-lg text-sm" ${me.registeredEvents.some(r=>r.eventId===e.id)||e.capacity&&e.registeredCount>=e.capacity?'disabled':''}>${me.registeredEvents.some(r=>r.eventId===e.id)?'Registered':e.capacity&&e.registeredCount>=e.capacity?'Full':'Register'}</button>`}</div></article>`;
    const upcoming=events.filter(e=>e.registrationOpen);
    el('upcoming-events-list').innerHTML=upcoming.length?upcoming.map(e=>eventCard(e)).join(''):'<p>No upcoming events.</p>';
    el('registered-events-list').innerHTML=me.registeredEvents.length?me.registeredEvents.map(e=>eventCard(e,true)).join(''):'<p>You are not registered for any events yet.</p>';
    const next=me.registeredEvents.filter(e=>Date.parse(e.date)>Date.now()&&e.status==='upcoming').sort((a,b)=>a.date.localeCompare(b.date))[0];
    el('dash-next-event').innerHTML=next?`<div class="next-event-detail"><h4>${esc(next.title)}</h4><p>${esc(next.description||'Details will be shared by the club team.')}</p>${eventNotice(next)}<div class="member-event-facts"><span><span class="material-symbols-outlined" aria-hidden="true">calendar_today</span>${esc(eventDate(next.date))}</span><span><span class="material-symbols-outlined" aria-hidden="true">schedule</span>${esc(eventTime(next.date))}</span><span><span class="material-symbols-outlined" aria-hidden="true">location_on</span>${esc(next.location||'Location to be announced')}</span></div><div class="next-event-actions"><button type="button" data-entry-pass="${esc(next.registrationId)}" class="px-4 py-2 bg-primary/10 text-primary font-semibold rounded-lg text-sm">Open QR pass</button><button type="button" data-calendar="${esc(next.registrationId)}" class="member-event-secondary">Add to calendar</button></div></div>`:'<p>No upcoming registrations. <a href="/events/" class="text-primary">Explore events →</a></p>';
    el('dash-latest-badge').innerHTML=me.badges.length?badge(me.badges.at(-1)):'<p>No badges yet.</p>';
  },{role:'student',intervalMs:60000});
}
el('entry-pass-close')?.addEventListener('click',()=>el('entry-pass-dialog').close());
el('feedback-close')?.addEventListener('click',()=>el('feedback-dialog').close());
el('feedback-form')?.addEventListener('submit',async event=>{event.preventDefault();const dialog=el('feedback-dialog'),id=dialog.dataset.registrationId;const selected=dialog.querySelector('input[name=rating]:checked');if(!selected)return;const button=dialog.querySelector('[type=submit]');button.disabled=true;try{await api('/api/me/registrations/'+encodeURIComponent(id)+'/feedback',{method:'PUT',body:JSON.stringify({rating:Number(selected.value),liked:el('feedback-liked').value,improve:el('feedback-improve').value})});dialog.close();await refresh();message('Thank you — your feedback was saved.');}catch(error){message(error);}finally{button.disabled=false;}});
el('entry-pass-badges')?.addEventListener('click',event=>{event.preventDefault();el('entry-pass-dialog').close();switchTab('badges');});
document.addEventListener('click',async event=>{
  const feedbackButton=event.target.closest('[data-feedback]');if(feedbackButton){const row=registrations.find(r=>r.registrationId===feedbackButton.dataset.feedback);if(!row)return;const dialog=el('feedback-dialog');dialog.dataset.registrationId=row.registrationId;el('feedback-event-name').textContent=row.title;el('feedback-liked').value=row.feedback?.liked||'';el('feedback-improve').value=row.feedback?.improve||'';dialog.querySelectorAll('input[name=rating]').forEach(input=>input.checked=Number(input.value)===row.feedback?.rating);dialog.showModal();return;}
  const calendar=event.target.closest('[data-calendar]');if(calendar){const row=registrations.find(r=>r.registrationId===calendar.dataset.calendar);if(row)downloadCalendar(row);return;}
  const cancel=event.target.closest('[data-cancel-registration]');if(cancel){const row=registrations.find(r=>r.registrationId===cancel.dataset.cancelRegistration);if(!row)return;if(!confirm(`Cancel your place for ${row.title}? Your QR pass will stop working and the seat will become available.`))return;cancel.disabled=true;try{await api('/api/me/registrations/'+encodeURIComponent(row.registrationId),{method:'DELETE'});await refresh();message('Your place was cancelled and the seat is available again.');}catch(error){message(error);cancel.disabled=false;}return;}
  const pass=event.target.closest('[data-entry-pass]');
  if(pass){const row=registrations.find(r=>r.registrationId===pass.dataset.entryPass);if(!row)return;try{const code=entryCode(row.registrationId),data=await QRCode.toDataURL(code,{width:300,margin:3,color:{dark:'#1d1d1f',light:'#ffffff'}});el('entry-pass-title').textContent=row.title||'Event entry pass';el('entry-pass-purpose').textContent=row.description||'Your place is reserved for this club event.';el('entry-pass-date').textContent=eventDate(row.date);el('entry-pass-time').textContent=eventTime(row.date);el('entry-pass-location').textContent=row.location||'To be announced';el('entry-pass-image').src=data;el('entry-pass-code').textContent=code;el('entry-pass-download').href=data;el('entry-pass-download').download=`sgu-entry-${row.registrationId}.png`;el('entry-pass-dialog').dataset.registrationId=row.registrationId;syncPassState(row);el('entry-pass-dialog').showModal();}catch(error){message(error);}return;}
  const b=event.target.closest('[data-register]');if(!b)return;b.disabled=true;try{await api('/api/events/'+b.dataset.register+'/register',{method:'POST',body:'{}'});await refresh();message('Registration saved.');}catch(e){message(e);b.disabled=false;}
});
