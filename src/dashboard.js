import QRCode from 'qrcode';
import {api,escapeHTML as esc,live,requireRole,message,entryCode} from './client.js';
const el=id=>document.getElementById(id);
let me, next;
function bind(key,value){document.querySelectorAll(`[data-bind="${key}"]`).forEach(n=>n.textContent=value);}
const stamp=d=>new Date(d).toLocaleString();
if(await requireRole('student'))live(async()=>{
  const data=await Promise.all([api('/api/me/dashboard'),api('/api/badges'),api('/api/resources')]);me=data[0];
  next=me.registeredEvents.filter(e=>e.status==='upcoming'&&Date.parse(e.date)>Date.now()).sort((a,b)=>a.date.localeCompare(b.date))[0];
  bind('name',me.name);bind('memberId',me.memberId);bind('uid',`uid: ${me.memberId}`);
  const past=me.registeredEvents.filter(e=>Date.parse(e.date)<Date.now());const percentage=past.length?Math.round(past.filter(e=>e.attended).length/past.length*100):0;
  bind('attendance',percentage+'%');document.querySelector('[stroke-dashoffset]')?.setAttribute('stroke-dashoffset',119.38*(1-percentage/100));
  bind('eventTitle',next?.title||'No upcoming registration');bind('eventDescription',next?.description||(next?'Your registration is saved. View your pass and event details below.':'Register for an upcoming club event to access your registration details.'));
  bind('eventDate',next?stamp(next.date):'—');bind('eventLocation',next?.location||'—');bind('registrationId',next?'Registration ID: '+next.registrationId:'Registration ID: —');bind('registrationState',next?'Registration saved':'No registration yet');bind('seat',next?'General admission':'—');
  el('open-pass-btn').disabled=!next;
  document.querySelectorAll('[data-action="calendar"],[data-action="directions"],[data-action="save"]').forEach(b=>b.disabled=!next);
  if(next){const qr=await QRCode.toDataURL(entryCode(next.registrationId),{width:160,margin:1});document.querySelectorAll('[data-qr]').forEach(img=>img.src=qr);}
  el('dashboard-events').innerHTML=me.registeredEvents.length?me.registeredEvents.map(e=>`<div class="p-space-md rounded-2xl bg-white border border-[#e5e5ea] shadow-sm flex flex-col gap-space-md"><span class="text-[#0071e3]">${esc(e.status)}</span><h4 class="font-title-md font-semibold">${esc(e.title)}</h4><p>${esc(stamp(e.date))}</p><p>${esc(e.location)}</p><small>${e.attended?'Attended':'Registration saved'}</small></div>`).join(''):'<p>No registrations yet. <a class="text-primary" href="/events/">Explore events →</a></p>';
  const heading=el('dash-section-2').firstElementChild.lastElementChild;heading.textContent=me.registeredEvents.length+' Events Recorded';
  el('dashboard-badges').innerHTML=data[1].length?data[1].map(b=>{const award=me.badges.find(a=>a.id===b.id);return `<div class="flex flex-col items-center text-center gap-space-xs p-space-md rounded-xl bg-[#fbfbfd] border border-[#e5e5ea] ${award?'':'opacity-75'}"><img src="${esc(b.imageUrl)}" alt="" class="w-20 h-20 object-contain"><span class="font-semibold">${esc(b.name)}</span><small>${award?'Earned '+esc(stamp(award.awardedAt)):'Not earned yet'}</small><p>${esc(b.desc)}</p></div>`;}).join(''):'<p>No badges published yet.</p>';
  const counts=el('dash-section-3').firstElementChild.lastElementChild.children;counts[0].textContent=me.badges.length+' UNLOCKED';counts[1].textContent='/ '+(data[1].length-me.badges.length)+' LOCKED';
  const activity=[...me.registeredEvents.map(e=>({text:'Registered for '+e.title,date:e.timestamp})),...me.badges.map(b=>({text:'Badge awarded: '+b.name,date:b.awardedAt}))].sort((a,b)=>b.date.localeCompare(a.date));
  el('dashboard-activity').innerHTML=activity.length?activity.slice(0,8).map(a=>`<div class="relative pl-7"><p class="font-semibold">${esc(a.text)}</p><small>${esc(stamp(a.date))}</small></div>`).join(''):'<p>No activity yet.</p>';
  el('dashboard-resources').innerHTML=data[2].length?data[2].map(r=>`<a class="p-space-sm rounded-xl bg-[#fbfbfd] border border-[#e5e5ea]" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)} ↗</a>`).join(''):'<p>No resources published yet.</p>';
  updateCountdown();
},{role:'student',intervalMs:60000});
function updateCountdown(){const minutes=next?Math.max(0,Math.floor((Date.parse(next.date)-Date.now())/60000)):null;el('countdown-val').textContent=minutes===null?'—':`${Math.floor(minutes/60)}h ${minutes%60}m`;}
const timer=setInterval(updateCountdown,30000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
const modal=el('wallet-modal');el('open-pass-btn').onclick=()=>{if(next){modal.querySelectorAll('.font-headline-lg').forEach(n=>n.textContent=next.title);modal.querySelectorAll('.font-body-md[class~="text-white/70"]').forEach(n=>n.textContent=next.location);modal.showModal();}};
for(const id of ['close-modal-btn','close-modal-footer'])el(id).onclick=()=>modal.close();
modal.addEventListener('click',e=>{if(e.target===modal)modal.close();});
function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const ics=value=>String(value).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\r/g,'');
const iso=date=>new Date(date).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
document.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
 if(action==='admin')location.href='/admin/';if(action==='student')location.href='/student/';if(action==='activity')el('dash-section-4').scrollIntoView({behavior:'smooth'});if(action==='challenge')window.open('https://developer.apple.com/swift-student-challenge/','_blank','noopener');
 if(!next)return;
 if(action==='directions')window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(next.location),'_blank','noopener');
 if(action==='save')download(`Apple Developer Club SGU\n${next.title}\n${stamp(next.date)}\n${next.location}\nAttendee: ${me.name}\nRegistration: ${next.registrationId}\n`,'text/plain','club-registration.txt');
 if(action==='calendar')download(['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SGU//Club Events//EN','BEGIN:VEVENT','UID:'+next.eventId+'@sgu-club','DTSTAMP:'+iso(Date.now()),'DTSTART:'+iso(next.date),'SUMMARY:'+ics(next.title),'LOCATION:'+ics(next.location),'END:VEVENT','END:VCALENDAR',''].join('\r\n'),'text/calendar','club-event.ics');
});
