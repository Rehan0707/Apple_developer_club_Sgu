import './auth-ui.js';
import { api, live, escapeHTML as esc, entryCode, isFirebaseHosted } from './client.js';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

// ── Ultra-smooth Linear Scrolling (Apple-grade fluid physics) ──
const lenis = new Lenis({
  lerp: 0.09, // Linear interpolation damping for silky smooth scroll
  wheelMultiplier: 0.95,
  touchMultiplier: 1.5,
  smoothWheel: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  infinite: false,
});

function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

window.lenis = lenis;

// Linear smooth scrolling for in-page anchor links
document.querySelectorAll('a[href*="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (!href || href === '#' || href === '/#') return;
    if (anchor.id === 'contact-menu-btn' || anchor.closest('#nav-contact-item')) return;
    
    try {
      const url = new URL(href, window.location.href);
      if (url.pathname === window.location.pathname && url.hash && url.hash.length > 1) {
        const target = document.querySelector(url.hash);
        if (target) {
          e.preventDefault();
          lenis.scrollTo(target, {
            offset: -85,
            duration: 1.1,
            easing: (t) => t, // Linear easing
          });
          history.pushState(null, '', url.hash);
        }
      }
    } catch {
      // Fallback
    }
  });
});

const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
function closeMenu() {
  menuButton?.setAttribute('aria-expanded', 'false');
  menuButton?.setAttribute('aria-label', 'Open navigation');
  navigation?.classList.remove('is-open');
}
menuButton?.addEventListener('click', () => {
  const isOpen = menuButton?.getAttribute('aria-expanded') !== 'true';
  menuButton?.setAttribute('aria-expanded', String(isOpen));
  menuButton?.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  navigation?.classList.toggle('is-open', isOpen);
});
navigation?.addEventListener('click', (event) => { if (event.target.closest('a:not(#contact-menu-btn)')) closeMenu(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') { closeMenu(); menuButton.focus(); } });
document.addEventListener('click', (event) => { if (!event.target.closest('.local-inner') && !event.target.closest('.nav-flyout-drawer')) closeMenu(); });
window.matchMedia('(min-width: 701px)').addEventListener('change', closeMenu);

// ── Apple Navigation Mega Flyout Controller ──
const contactItem = document.getElementById('nav-contact-item');
const contactTrigger = document.getElementById('contact-menu-btn');
const contactFlyout = document.getElementById('contact-flyout');
const flyoutBackdrop = document.getElementById('nav-flyout-backdrop');
const siteHeader = document.getElementById('site-header');

let flyoutTimeout = null;

function openFlyout() {
  if (flyoutTimeout) {
    clearTimeout(flyoutTimeout);
    flyoutTimeout = null;
  }
  if (contactFlyout && contactItem) {
    contactItem.classList.add('is-active');
    contactTrigger?.setAttribute('aria-expanded', 'true');
    contactFlyout.classList.add('is-open');
    contactFlyout.setAttribute('aria-hidden', 'false');
    flyoutBackdrop?.classList.add('is-active');
    siteHeader?.classList.add('has-flyout-open');
  }
}

function closeFlyout() {
  if (contactFlyout && contactItem) {
    contactItem.classList.remove('is-active');
    contactTrigger?.setAttribute('aria-expanded', 'false');
    contactFlyout.classList.remove('is-open');
    contactFlyout.setAttribute('aria-hidden', 'true');
    flyoutBackdrop?.classList.remove('is-active');
    siteHeader?.classList.remove('has-flyout-open');
  }
}

function scheduleCloseFlyout(delay = 180) {
  if (flyoutTimeout) clearTimeout(flyoutTimeout);
  flyoutTimeout = setTimeout(() => {
    closeFlyout();
  }, delay);
}

if (contactItem && contactFlyout) {
  // Desktop Hover Handlers
  contactItem.addEventListener('mouseenter', () => {
    if (window.innerWidth > 700) openFlyout();
  });
  contactItem.addEventListener('mouseleave', () => {
    if (window.innerWidth > 700) scheduleCloseFlyout(200);
  });

  contactFlyout.addEventListener('mouseenter', () => {
    if (window.innerWidth > 700) {
      if (flyoutTimeout) clearTimeout(flyoutTimeout);
    }
  });
  contactFlyout.addEventListener('mouseleave', () => {
    if (window.innerWidth > 700) scheduleCloseFlyout(200);
  });

  // Click Trigger (for mobile or click toggle)
  contactTrigger?.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.innerWidth <= 700) {
      contactItem.classList.toggle('mobile-expanded');
    } else {
      if (contactFlyout.classList.contains('is-open')) {
        closeFlyout();
      } else {
        openFlyout();
      }
    }
  });

  // Close when clicking on backdrop
  flyoutBackdrop?.addEventListener('click', closeFlyout);

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && contactFlyout.classList.contains('is-open')) {
      closeFlyout();
      contactTrigger?.focus();
    }
  });

  // Keyboard accessibility
  contactItem.addEventListener('focusin', openFlyout);
  document.addEventListener('focusin', (e) => {
    if (!contactItem.contains(e.target) && !contactFlyout.contains(e.target)) {
      closeFlyout();
    }
  });
}

if(document.querySelector('#year')) document.querySelector('#year').textContent = new Date().getFullYear();
const navLinks = [...(navigation?.querySelectorAll('a') || [])];
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(link => { if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
    }
  });
}, { rootMargin: '-15% 0px -55% 0px' });
['about', 'resources', 'faq'].forEach(id => document.getElementById(id) && observer.observe(document.getElementById(id)));

if (location.pathname.startsWith('/events')) navigation?.querySelector('a[href="/events/"]')?.setAttribute('aria-current', 'page');
if (location.pathname.startsWith('/join')) navigation?.querySelector('a[href="/join/"]')?.setAttribute('aria-current', 'page');
// Event Registration Modal
const eventModal = document.getElementById('event-registration-modal');
if (eventModal) {
  const modalForm = document.getElementById('event-registration-form');
  const modalSuccess = document.getElementById('modal-success');
  const eventSelect = document.getElementById('reg-event');
  const errorMsg = document.getElementById('form-error-msg');
  const successEventName = document.getElementById('success-event-name');
  const successEmail = document.getElementById('success-email');
  let activeTriggerBtn = null;

  async function showRegistrationPass(result, email, existing = false) {
    if(successEventName) successEventName.textContent=result.title;
    if(successEmail) successEmail.textContent=email;
    const code=entryCode(result.registrationId);
    const qrImage=document.getElementById('entry-qr-image');
    const qrDownload=document.getElementById('entry-qr-download');
    const qrData=await import('qrcode').then(({default:QRCode})=>QRCode.toDataURL(code,{width:260,margin:2})).catch(()=>null);
    if(qrImage){qrImage.hidden=!qrData;if(qrData)qrImage.src=qrData;}
    if(qrDownload){qrDownload.hidden=!qrData;if(qrData){qrDownload.href=qrData;qrDownload.download=`sgu-entry-${result.registrationId}.png`;}}
    const codeText=document.getElementById('entry-code-text');if(codeText)codeText.textContent=code;
    const details=modalSuccess.querySelector('.success-sub');
    if(details) details.textContent=existing?`Your spot is already reserved for ${email}. Show this pass at the event entrance.`:`Your registration has been saved for ${email}. Contact the club if you need to change your details.`;
    modalForm.hidden=true;modalSuccess.hidden=false;
    eventModal.classList.add('showing-success');
    eventModal.querySelector('.modal-box')?.scrollTo({top:0});
  }

  function openEventModal(eventName) {
    if (eventName && eventSelect) {
      const matchOption = [...eventSelect.options].find(opt => opt.value === eventName || opt.text === eventName);
      if (matchOption) eventSelect.value = matchOption.value;
    }
    modalForm.hidden = false;
    modalSuccess.hidden = true;
    eventModal.classList.remove('showing-success');
    if (errorMsg) errorMsg.hidden = true;

    if (typeof eventModal.showModal === 'function') {
      try { eventModal.showModal(); } catch { eventModal.setAttribute('open', ''); }
    } else {
      eventModal.setAttribute('open', '');
    }
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('reg-name')?.focus(), 50);
    if(isFirebaseHosted && eventSelect?.value) {
      const selectedEvent=eventSelect.value;
      api('/api/events/'+encodeURIComponent(selectedEvent)+'/my-registration').then(registration=>{
        if(registration && eventModal.hasAttribute('open') && eventSelect.value===selectedEvent) showRegistrationPass(registration,registration.email,true);
      }).catch(()=>{});
    }
  }

  function closeEventModal() {
    if (typeof eventModal.close === 'function') {
      try { eventModal.close(); } catch {}
    }
    eventModal.removeAttribute('open');
    document.body.style.overflow = '';
    if (activeTriggerBtn) {
      activeTriggerBtn.focus();
      activeTriggerBtn = null;
    }
  }

  document.addEventListener('click', (e) => {
      const btn=e.target.closest('[data-open-event-modal="true"]');if(!btn)return;
      e.preventDefault();
      activeTriggerBtn = btn;
      const eventName = btn.getAttribute('data-event-name');
      openEventModal(eventName);
  });

  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', closeEventModal);
  });

  eventModal.addEventListener('click', (e) => {
    if (e.target === eventModal || e.target.classList.contains('modal-overlay')) {
      closeEventModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (eventModal.hasAttribute('open') || eventModal.open)) {
      closeEventModal();
    }
  });

  modalForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorMsg) errorMsg.hidden = true;

    const name = document.getElementById('reg-name')?.value.trim();
    const email = document.getElementById('reg-email')?.value.trim();
    const branch = document.getElementById('reg-branch')?.value;
    const year = document.getElementById('reg-year')?.value;
    const selectedEvent = eventSelect?.value;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!name || !email || !emailRegex.test(email) || !branch || !year || !selectedEvent) {
      if (errorMsg) errorMsg.hidden = false;
      return;
    }

    const submit = modalForm.querySelector('[type="submit"]');
    if(submit.disabled) return; submit.disabled = true;
    try {
      const result = await api('/api/events/'+encodeURIComponent(selectedEvent)+'/register', {method:'POST',body:JSON.stringify({name,email,branch,year,notes:document.getElementById('reg-notes')?.value || ''})});
      await showRegistrationPass(result,email);
      modalForm.reset();
    } catch(error) {
      if(isFirebaseHosted && error.status===409 && selectedEvent) {
        const registration=await api('/api/events/'+encodeURIComponent(selectedEvent)+'/my-registration').catch(()=>null);
        if(registration) { await showRegistrationPass(registration,registration.email,true); return; }
      }
      if(errorMsg){errorMsg.textContent=error.message;errorMsg.hidden=false;}
    }
    finally {submit.disabled=false;}

  });
}


// Stories Carousel Scroll Control
const storiesTrack = document.getElementById('stories-track');
const storiesPrevBtn = document.getElementById('stories-prev-btn');
const storiesNextBtn = document.getElementById('stories-next-btn');

if (storiesTrack && storiesPrevBtn && storiesNextBtn) {
  storiesPrevBtn.addEventListener('click', () => {
    storiesTrack.scrollBy({ left: -440, behavior: 'smooth' });
  });
  storiesNextBtn.addEventListener('click', () => {
    storiesTrack.scrollBy({ left: 440, behavior: 'smooth' });
  });
}

// Matter.js 2D Gravity Physics Engine & Rolling Icons Bucket Box
async function initGravityPhysicsBucket() {
  const container = document.getElementById('gravity-bucket-box');
  const worldCanvas = document.getElementById('physics-world-canvas');
  if (!container || !worldCanvas) return;
  const {default:Matter} = await import('matter-js');

  const { Engine, Runner, Bodies, Composite, Body, Mouse, MouseConstraint, Events } = Matter;

  // Create Matter.js physics engine with gravity vector
  const engine = Engine.create({
    gravity: { x: 0, y: 1.2, scale: 0.001 }
  });

  let width = container.clientWidth;
  let height = container.clientHeight;

  // Boundaries (Floor, Left Wall, Right Wall, Ceiling)
  const wallThickness = 120;
  let ground = Bodies.rectangle(width / 2, height + wallThickness / 2 - 4, width * 2, wallThickness, { isStatic: true, friction: 0.5, restitution: 0.4 });
  let leftWall = Bodies.rectangle(-wallThickness / 2 + 4, height / 2, wallThickness, height * 3, { isStatic: true, friction: 0.5, restitution: 0.4 });
  let rightWall = Bodies.rectangle(width + wallThickness / 2 - 4, height / 2, wallThickness, height * 3, { isStatic: true, friction: 0.5, restitution: 0.4 });
  let ceiling = Bodies.rectangle(width / 2, -wallThickness / 2 + 4, width * 2, wallThickness, { isStatic: true, friction: 0.5, restitution: 0.4 });

  Composite.add(engine.world, [ground, leftWall, rightWall, ceiling]);

  // Only app logos published through the admin portal appear here.
  const iconData = [];

  const bodyElements = [];
  const iconSize = 76;

  function spawnFallingItems(items) {
    items.forEach((item, index) => {
      setTimeout(() => {
        if (item.id && !iconData.some(icon => icon.id === item.id)) return;
        // Random horizontal drop position spread dynamically across full container width
        const spawnX = Math.random() * Math.max(100, width - 160) + 80;
        const spawnY = iconSize / 2 + 16;

        // Chamfered rounded rectangle body for realistic physics rolling & tumbling
        const body = Bodies.rectangle(spawnX, spawnY, iconSize, iconSize, {
          chamfer: { radius: 18 },
          restitution: 0.6,  // Realistic bounce
          friction: 0.2,     // Rolling friction
          density: 0.002,
          angle: (Math.random() - 0.5) * 0.6
        });

        // DOM element corresponding to the physics body
        const el = document.createElement('div');
        el.className = 'physics-icon-item';
        el.style.width = `${iconSize}px`;
        el.style.height = `${iconSize}px`;

        if (item.type === 'img') {
          const img = document.createElement('img');
          img.src = item.src;
          img.alt = item.alt;
          img.className = 'physics-icon-img';
          el.appendChild(img);
        } else {
          el.style.background = item.bg;
          el.style.color = '#ffffff';
          const badge = document.createElement('span');
          badge.className = 'physics-icon-badge';
          badge.textContent = item.emoji;
          const label = document.createElement('span');
          label.className = 'physics-icon-label';
          label.textContent = item.label;
          label.style.color = '#ffffff';
          el.appendChild(badge);
          el.appendChild(label);
        }

        worldCanvas.appendChild(el);
        Composite.add(engine.world, body);

        // Apply slight initial angular velocity & downward force
        Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.25);
        Body.setVelocity(body, { x: (Math.random() - 0.5) * 5, y: Math.random() * 3 + 2 });

        bodyElements.push({ body, el, sourceId: item.id });
        // Keep repeated double taps from growing an unbounded physics world.
        if (bodyElements.length > 100) {
          const oldest = bodyElements.shift();
          Composite.remove(engine.world, oldest.body);
          oldest.el.remove();
        }
        updateRunner();
      }, index * 90);
    });
  }
  const spawnFallingBatch = () => spawnFallingItems(iconData);

  // Drop icons in on initial scroll
  let hasDropped = false;
  function dropIcons() {
    if (hasDropped) return;
    hasDropped = true;
    spawnFallingBatch();
  }

  // Trigger falling icons when user clicks twice (double click / double tap)
  const bucketWrapper = container.closest('.gravity-bucket-wrapper') || container;
  bucketWrapper.addEventListener('dblclick', () => {
    spawnFallingBatch();
  });

  // Handle double-tap gesture on mobile screens
  let lastTapTime = 0;
  bucketWrapper.addEventListener('touchstart', (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapTime;
    if (tapLength < 300 && tapLength > 0) {
      spawnFallingBatch();
    }
    lastTapTime = currentTime;
  }, { passive: true });

  // Mouse & Touch Drag Interaction Physics Constraint
  const mouse = Mouse.create(container);
  const mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: {
      stiffness: 0.2,
      render: { visible: false }
    }
  });

  // Remove Matter.js default scroll-blocking wheel & touch listeners
  if (mouseConstraint.mouse.element) {
    const el = mouseConstraint.mouse.element;
    el.removeEventListener('mousewheel', mouseConstraint.mouse.mousewheel);
    el.removeEventListener('DOMMouseScroll', mouseConstraint.mouse.mousewheel);
    el.removeEventListener('wheel', mouseConstraint.mouse.mousewheel);
    el.removeEventListener('touchstart', mouseConstraint.mouse.touchstart);
    el.removeEventListener('touchmove', mouseConstraint.mouse.touchmove);
    el.removeEventListener('touchend', mouseConstraint.mouse.touchend);
  }

  // Non-blocking touch & scroll delegation to preserve native page scrolling
  container.addEventListener('touchstart', (e) => {
    const isIconTouch = e.target.closest('.physics-icon-item');
    if (isIconTouch && mouseConstraint.mouse.touchstart) {
      mouseConstraint.mouse.touchstart(e);
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (mouseConstraint.body) {
      if (e.cancelable) e.preventDefault();
      if (mouseConstraint.mouse.touchmove) {
        mouseConstraint.mouse.touchmove(e);
      }
    }
  }, { passive: false });

  container.addEventListener('touchend', (e) => {
    if (mouseConstraint.mouse.touchend) {
      mouseConstraint.mouse.touchend(e);
    }
  }, { passive: true });

  Composite.add(engine.world, mouseConstraint);

  // Sync DOM elements with Matter body positions on each frame (60 FPS)
  Events.on(engine, 'afterUpdate', () => {
    bodyElements.forEach(({ body, el }) => {
      const x = body.position.x - iconSize / 2;
      const y = body.position.y - iconSize / 2;
      const angle = body.angle;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}rad)`;
    });
  });

  // Run runner & engine
  const runner = Runner.create();
  let bucketVisible = false, runnerActive = false;
  function updateRunner() {
    const needed = bucketVisible && !document.hidden && bodyElements.length > 0;
    if (needed === runnerActive) return;
    runnerActive = needed;
    if (needed) Runner.run(runner, engine);
    else Runner.stop(runner);
  }
  document.addEventListener('visibilitychange', updateRunner);

  // Intersection Observer to drop icons when user scrolls to section
  const dropObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      bucketVisible = entry.isIntersecting;
      if (entry.isIntersecting) {
        dropIcons();
      }
      updateRunner();
    });
  }, { threshold: 0.2 });

  dropObserver.observe(container);

  // Uploaded app logos use the same bodies, styling, and motion as the original icons.
  live(async () => {
    const logos = await api('/api/app-logos');
    const nextIds = new Set(logos.map(logo => logo.id));
    const existingIds = new Set(iconData.filter(icon => icon.id).map(icon => icon.id));
    for (let index = bodyElements.length - 1; index >= 0; index--) {
      const item = bodyElements[index];
      if (item.sourceId && !nextIds.has(item.sourceId)) {
        Composite.remove(engine.world, item.body);
        item.el.remove();
        bodyElements.splice(index, 1);
      }
    }
    const added = logos.filter(logo => !existingIds.has(logo.id)).map(logo => ({ type: 'img', id: logo.id, src: logo.imageUrl, alt: logo.name }));
    iconData.splice(0, iconData.length, ...logos.map(logo => ({ type: 'img', id: logo.id, src: logo.imageUrl, alt: logo.name })));
    if (hasDropped && added.length) spawnFallingItems(added);
    updateRunner();
  },{collections:['appLogos']});

  // Device Orientation (Gyroscope Gravity for Mobile Phones!)
  if ('ontouchstart' in window && window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (event) => {
      const gamma = event.gamma; // Left-to-right tilt [-90 to 90]
      const beta = event.beta;   // Front-to-back tilt [-180 to 180]

      if (gamma !== null && beta !== null) {
        // Dynamically update physics gravity vector based on phone orientation
        const gx = Math.max(-2, Math.min(2, gamma / 15));
        const gy = Math.max(0.4, Math.min(2, (beta - 10) / 15));

        engine.gravity.x = gx;
        engine.gravity.y = gy;
      }
    }, true);
  }

  // Dynamic Container Resize Handler
  window.addEventListener('resize', () => {
    width = container.clientWidth;
    height = container.clientHeight;

    // Reposition boundaries to adapt to dynamic window / container dimensions
    Body.setPosition(ground, { x: width / 2, y: height + wallThickness / 2 - 4 });
    Body.setPosition(rightWall, { x: width + wallThickness / 2 - 4, y: height / 2 });
    Body.setPosition(leftWall, { x: -wallThickness / 2 + 4, y: height / 2 });
    Body.setPosition(ceiling, { x: width / 2, y: -wallThickness / 2 + 4 });

    // Keep icons gracefully within boundaries when window width contracts
    bodyElements.forEach(({ body }) => {
      const clampedX = Math.max(iconSize / 2 + 10, Math.min(width - iconSize / 2 - 10, body.position.x));
      const clampedY = Math.max(iconSize / 2 + 10, Math.min(height - iconSize / 2 - 10, body.position.y));
      if (clampedX !== body.position.x || clampedY !== body.position.y) {
        Body.setPosition(body, { x: clampedX, y: clampedY });
      }
    });
  });
}

initGravityPhysicsBucket();

// ── Join Transition Loader ────────────────────────────────────────────
const joinOverlay = document.getElementById('join-loader-overlay');

if (joinOverlay) {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href="/join/"]');
    if (!link) return;

    e.preventDefault();
    const dest = link.href;

    // Show overlay — fade in over 300ms
    joinOverlay.removeAttribute('aria-hidden');
    joinOverlay.classList.add('is-active');
    document.body.style.overflow = 'hidden';

    // Navigate once overlay fully covers the screen (300ms fade + 120ms buffer)
    // The join page then animates in, creating a seamless crossfade
    setTimeout(() => {
      window.location.href = dest;
    }, 420);
  });
}

// Keep the existing card design while displaying published database records.
const eventGrid = document.querySelector('.apple-events-grid');
if(eventGrid) {
  const templates = [...eventGrid.querySelectorAll('.apple-events-card')].map(node=>node.cloneNode(true));
  eventGrid.replaceChildren();
  eventGrid.setAttribute('aria-busy','true');
  const eventLoading = document.createElement('p');
  eventLoading.setAttribute('role','status');
  eventLoading.textContent = 'Loading upcoming events…';
  eventGrid.before(eventLoading);
  live(async()=>{
    const events = await api('/api/events');
    eventLoading.remove();
    eventGrid.removeAttribute('aria-busy');
    const upcoming = events.filter(e=>e.registrationOpen);
    const select = document.getElementById('reg-event');
    const previous = select?.value;
    if(select){select.replaceChildren(...upcoming.map(e=>new Option(e.title,e.id)));if(upcoming.some(e=>e.id===previous))select.value=previous;}
    if(!upcoming.length){
      // Preserve illustrations as explicitly labelled previews; never accept fake reservations.
      eventGrid.replaceChildren(...templates.map(template=>{
        const card=template.cloneNode(true);
        card.querySelector('.events-card-date').textContent='Schedule to be announced';
        const button=card.querySelector('[data-open-event-modal]');button.disabled=true;button.removeAttribute('data-open-event-modal');button.querySelector('.action-text').textContent='Coming soon';
        return card;
      }));
      return;
    }
    eventGrid.replaceChildren(...upcoming.map((event,index)=>{
      const card=templates[index%templates.length].cloneNode(true);
      card.querySelector('.events-card-title').textContent=event.title;
      card.querySelector('.events-card-type').textContent=event.category||'Club event';
      card.querySelector('.events-card-date').textContent=new Date(event.date).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
      card.querySelector('.events-card-desc').textContent=event.description||event.location;
      const image=card.querySelector('.events-card-img');
      if(event.bannerUrl)image.src=event.bannerUrl;
      image.alt=event.title;
      const button=card.querySelector('[data-open-event-modal]');button.dataset.eventName=event.id;
      const full=event.capacity&&event.registeredCount>=event.capacity;
      button.disabled=Boolean(full);button.querySelector('.action-text').textContent=full?'Event full':'Register Now';
      return card;
    }));
  },{collections:['events'],intervalMs:60000});
}

const homeResources = document.querySelector('#resources #resources-container');
if(homeResources)live(async()=>{
 const rows=await api('/api/resources');
 homeResources.innerHTML=rows.length?rows.map(r=>`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" style="display:flex;justify-content:space-between;align-items:center;padding:20px;background:#fff;border:1px solid #e5e5ea;border-radius:12px;text-decoration:none;color:#1d1d1f"><div style="display:flex;flex-direction:column;gap:5px"><span style="font-weight:600;font-size:1.1rem">${esc(r.title)}</span><span style="font-size:.9rem;color:#86868b;background:#f5f5f7;padding:2px 8px;border-radius:4px;width:fit-content">${esc(r.category||'General')}</span></div><span style="color:#0071e3">↗</span></a>`).join(''):'<div style="color:#86868b;padding:20px;background:#f5f5f7;border-radius:12px;text-align:center">No resources available right now. Check back later!</div>';
},{collections:['resources']});
