import {escapeHTML as esc} from './client.js';
const when=value=>new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
export function badgeCard(badge) {
  return `<button type="button" class="flex flex-col items-center text-center gap-2 min-w-0" data-badge-details="${esc(badge.id)}" aria-label="${esc(badge.name)} — ${badge.earned?'earned':'locked'}">
    <img src="${esc(badge.imageUrl)}" alt="" loading="lazy" class="w-28 h-28 object-contain" width="112" height="112">
    <span class="font-bold text-sm leading-tight max-w-[120px]">${esc(badge.name)}</span>
    <span class="text-xs text-on-surface-variant max-w-[120px]">${esc(badge.eventTitle||badge.desc)}</span>
  </button>`;
}
export function setupBadgeDetails(getBadges) {
  const dialog=document.createElement('dialog');dialog.className='badge-detail';dialog.setAttribute('aria-labelledby','badge-detail-name');
  dialog.innerHTML='<button type="button" class="badge-detail-close" aria-label="Close badge details">×</button><img id="badge-detail-image" alt=""><p id="badge-detail-state" class="badge-state"></p><h2 id="badge-detail-name"></h2><p id="badge-detail-desc"></p><div class="badge-detail-event"><span>EVENT</span><p id="badge-detail-event"></p><p id="badge-detail-date"></p></div><p id="badge-detail-rule"></p><a id="badge-detail-action" class="badge-detail-action"></a>';
  document.body.append(dialog);let selected;
  function update(){
    const b=getBadges().find(b=>b.id===selected);if(!b)return;
    const img=dialog.querySelector('img');img.src=b.imageUrl;img.alt=b.name+' badge';
    dialog.querySelector('#badge-detail-name').textContent=b.name;
    dialog.querySelector('#badge-detail-desc').textContent=b.desc;
    dialog.querySelector('#badge-detail-state').textContent=b.earned?'Earned · '+when(b.awardedAt):'Not earned yet';
    dialog.querySelector('#badge-detail-event').textContent=b.eventTitle||'Event to be announced';
    dialog.querySelector('#badge-detail-date').textContent=b.eventDate?when(b.eventDate):'Watch the events page for updates.';
    dialog.querySelector('#badge-detail-rule').textContent=b.earned?'Your attendance has been confirmed by the club.':b.type==='event'?'Attend this badge’s event. It will appear in your collection when an admin confirms your attendance.':'This badge is awarded by a club administrator.';
    const action=dialog.querySelector('#badge-detail-action');action.textContent=b.earned?'Download badge':'Explore events';action.href=b.earned?b.imageUrl:'/events/';if(b.earned)action.setAttribute('download',b.name+'.png');else action.removeAttribute('download');
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-badge-details]');if(!button)return;selected=button.dataset.badgeDetails;update();dialog.showModal();});
  dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  return ()=>{if(dialog.open)update();};
}
