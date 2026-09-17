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
navigation.addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') { closeMenu(); menuButton.focus(); } });
document.addEventListener('click', (event) => { if (!event.target.closest('.local-inner')) closeMenu(); });
window.matchMedia('(min-width: 701px)').addEventListener('change', closeMenu);
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

// Animated App Icon Drop & Mobile Physics / Mouse Gyroscope Movement
const appIcon = document.getElementById('animated-app-icon');
const connectSection = document.getElementById('connect');

if (appIcon && connectSection) {
  // 1. Intersection Observer for Drop-In Animation from top
  const dropObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !appIcon.classList.contains('dropped')) {
        appIcon.classList.add('dropped');
        setTimeout(() => {
          appIcon.classList.add('floating');
        }, 1150);
      }
    });
  }, { threshold: 0.15 });

  dropObserver.observe(connectSection);

  // 2. Physics Movement Variables for Tilt & Gyroscope
  let targetX = 0;
  let targetY = 0;
  let targetRot = 0;
  let currentX = 0;
  let currentY = 0;
  let currentRot = 0;
  let isInteracting = false;
  let animFrameId = null;

  function updatePhysics() {
    if (isInteracting) {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      currentRot += (targetRot - currentRot) * 0.12;

      appIcon.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) rotate(${currentRot}deg)`;
      animFrameId = requestAnimationFrame(updatePhysics);
    }
  }

  // Desktop Mouse Parallax Movement
  connectSection.addEventListener('mousemove', (e) => {
    const rect = connectSection.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    targetX = (e.clientX - centerX) * 0.15;
    targetY = (e.clientY - centerY) * 0.15;
    targetRot = targetX * 0.12;

    if (!isInteracting) {
      isInteracting = true;
      appIcon.classList.remove('floating');
      animFrameId = requestAnimationFrame(updatePhysics);
    }
  });

  connectSection.addEventListener('mouseleave', () => {
    targetX = 0;
    targetY = 0;
    targetRot = 0;
    setTimeout(() => {
      isInteracting = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      appIcon.classList.add('floating');
      appIcon.style.transform = '';
    }, 400);
  });

  // Mobile Phone Motion & Gyroscope Orientation Listener
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (event) => {
      const gamma = event.gamma; // Left-to-right tilt [-90 to 90]
      const beta = event.beta;   // Front-to-back tilt [-180 to 180]

      if (gamma !== null && beta !== null) {
        // Clamp tilt ranges for smooth phone movement response
        const tiltX = Math.max(-25, Math.min(25, gamma)) * 1.1;
        const tiltY = Math.max(-25, Math.min(25, beta - 45)) * 1.1;

        targetX = tiltX;
        targetY = tiltY;
        targetRot = tiltX * 0.15;

        if (!isInteracting) {
          isInteracting = true;
          appIcon.classList.remove('floating');
          animFrameId = requestAnimationFrame(updatePhysics);
        }
      }
    }, true);
  }
}

