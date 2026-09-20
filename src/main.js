import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

// ── Ultra-smooth Linear Scrolling (Apple-grade fluid physics) ──
const lenis = new Lenis({
  lerp: 0.09, // Linear interpolation damping for silky smooth scroll
  wheelMultiplier: 0.95,
  touchMultiplier: 1.5,
  smoothWheel: true,
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
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation');
  navigation.classList.remove('is-open');
}
menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  navigation.classList.toggle('is-open', isOpen);
});
navigation.addEventListener('click', (event) => { if (event.target.closest('a:not(#contact-menu-btn)')) closeMenu(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') { closeMenu(); menuButton.focus(); } });
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

document.querySelector('#year').textContent = new Date().getFullYear();
const navLinks = [...navigation.querySelectorAll('a')];
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(link => { if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
    }
  });
}, { rootMargin: '-15% 0px -55% 0px' });
['about', 'resources', 'faq'].forEach(id => document.getElementById(id) && observer.observe(document.getElementById(id)));

if (location.pathname.startsWith('/events')) navigation.querySelector('a[href="/events/"]').setAttribute('aria-current', 'page');
if (location.pathname.startsWith('/join')) navigation.querySelector('a[href="/join/"]').setAttribute('aria-current', 'page');
const authStatus = document.getElementById('auth-status');
if (authStatus) {
  const messages = { error: 'Sign-in could not be completed. Please try again.', cancelled: 'Sign-in was cancelled. You can try again whenever you’re ready.' };
  const signIn = document.getElementById('apple-signin');
  const signOut = document.getElementById('signout');
  async function loadAuth() {
    try {
      const response = await fetch('/api/auth/status');
      if (!response.ok) throw new Error();
      const status = await response.json();
      signIn.hidden = !status.available || status.authenticated;
      signOut.hidden = !status.authenticated;
      authStatus.textContent = status.authenticated ? 'You’re signed in with Apple. Online membership registration is not open yet. Contact the club on Instagram for the next step.' : !status.available ? 'Apple sign-in is not available yet. Please check back soon, or contact the club on Instagram to express your interest.' : messages[new URLSearchParams(location.search).get('auth')] || 'Continue securely with Apple to verify your account.';
    } catch {
      signIn.hidden = true;
      authStatus.textContent = 'Sign-in is temporarily unavailable. Please try again later or contact the club on Instagram.';
    }
  }
  signOut.addEventListener('click', async () => {
    signOut.disabled = true;
    try { const response = await fetch('/api/auth/signout', { method: 'POST' }); if (!response.ok) throw new Error(); await loadAuth(); }
    catch { authStatus.textContent = 'Could not sign out. Please try again.'; }
    finally { signOut.disabled = false; }
  });
  loadAuth();
}

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

  function openEventModal(eventName) {
    if (eventName && eventSelect) {
      const matchOption = [...eventSelect.options].find(opt => opt.value === eventName || opt.text.includes(eventName));
      if (matchOption) eventSelect.value = matchOption.value;
    }
    modalForm.hidden = false;
    modalSuccess.hidden = true;
    if (errorMsg) errorMsg.hidden = true;

    if (typeof eventModal.showModal === 'function') {
      try { eventModal.showModal(); } catch { eventModal.setAttribute('open', ''); }
    } else {
      eventModal.setAttribute('open', '');
    }
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('reg-name')?.focus(), 50);
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

  document.querySelectorAll('[data-open-event-modal="true"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      activeTriggerBtn = btn;
      const eventName = btn.getAttribute('data-event-name');
      openEventModal(eventName);
    });
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

  modalForm?.addEventListener('submit', (e) => {
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

    if (successEventName) successEventName.textContent = selectedEvent;
    if (successEmail) successEmail.textContent = email;

    modalForm.hidden = true;
    modalSuccess.hidden = false;
    modalForm.reset();
  });
}

// Stories Carousel Scroll Control
import Matter from 'matter-js';

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
function initGravityPhysicsBucket() {
  const container = document.getElementById('gravity-bucket-box');
  const worldCanvas = document.getElementById('physics-world-canvas');
  if (!container || !worldCanvas) return;

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
  let ceiling = Bodies.rectangle(width / 2, -wallThickness / 2 - 300, width * 2, wallThickness, { isStatic: true });

  Composite.add(engine.world, [ground, leftWall, rightWall, ceiling]);

  // App icons to spawn in the physics bucket
  const iconData = [
    { type: 'img', src: '/images/app-icon-showcase.png', alt: 'Nature App' },
    { type: 'badge', emoji: '🍎', label: 'Swift', bg: 'linear-gradient(135deg, #ff5e3a, #ff2a68)' },
    { type: 'badge', emoji: '🛠️', label: 'Xcode', bg: 'linear-gradient(135deg, #1d72b8, #00c6ff)' },
    { type: 'badge', emoji: '🎨', label: 'HIG Lab', bg: 'linear-gradient(135deg, #8e44ad, #f39c12)' },
    { type: 'badge', emoji: '🪪', label: 'SGU Pass', bg: 'linear-gradient(135deg, #0071e3, #42a5f5)' },
    { type: 'badge', emoji: '⚡', label: 'Playroom', bg: 'linear-gradient(135deg, #11998e, #38ef7d)' },
    { type: 'badge', emoji: '🧭', label: 'ARKit', bg: 'linear-gradient(135deg, #fc4a1a, #f7b731)' },
    { type: 'badge', emoji: '💡', label: 'App Idea', bg: 'linear-gradient(135deg, #f093fb, #f5576c)' }
  ];

  const bodyElements = [];
  const iconSize = 76;

  // Drop icons in from top opening
  let hasDropped = false;
  function dropIcons() {
    if (hasDropped) return;
    hasDropped = true;

    iconData.forEach((item, index) => {
      setTimeout(() => {
        // Random horizontal drop position
        const spawnX = Math.random() * (width - 180) + 90;
        const spawnY = -60 - index * 20;

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
        Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.2);
        Body.setVelocity(body, { x: (Math.random() - 0.5) * 4, y: Math.random() * 2 });

        bodyElements.push({ body, el });
      }, index * 120);
    });
  }

  // Mouse & Touch Drag Interaction Physics Constraint
  const mouse = Mouse.create(container);
  const mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: {
      stiffness: 0.2,
      render: { visible: false }
    }
  });

  // Prevent wheel scroll locking
  if (mouseConstraint.mouse.element) {
    mouseConstraint.mouse.element.removeEventListener('mousewheel', mouseConstraint.mouse.mousewheel);
    mouseConstraint.mouse.element.removeEventListener('DOMMouseScroll', mouseConstraint.mouse.mousewheel);
  }

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
  Runner.run(runner, engine);

  // Intersection Observer to drop icons when user scrolls to section
  const dropObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        dropIcons();
      }
    });
  }, { threshold: 0.2 });

  dropObserver.observe(container);

  // Device Orientation (Gyroscope Gravity for Mobile Phones!)
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (event) => {
      const gamma = event.gamma; // Left-to-right tilt [-90 to 90]
      const beta = event.beta;   // Front-to-back tilt [-180 to 180]

      if (gamma !== null && beta !== null) {
        // Dynamically update physics gravity vector based on phone orientation
        const gx = Math.max(-2, Math.min(2, gamma / 15));
        const gy = Math.max(-2, Math.min(2, (beta - 30) / 15));

        engine.gravity.x = gx;
        engine.gravity.y = gy;
      }
    }, true);
  }

  // Handle Container Resize
  window.addEventListener('resize', () => {
    width = container.clientWidth;
    height = container.clientHeight;

    Body.setPosition(ground, { x: width / 2, y: height + wallThickness / 2 - 4 });
    Body.setPosition(rightWall, { x: width + wallThickness / 2 - 4, y: height / 2 });
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
