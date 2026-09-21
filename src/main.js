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
['about', 'faq'].forEach(id => document.getElementById(id) && observer.observe(document.getElementById(id)));

if (location.pathname.startsWith('/events')) navigation.querySelector('a[href="/events/"]').setAttribute('aria-current', 'page');
if (location.pathname.startsWith('/join')) navigation.querySelector('a[href="/join/"]').setAttribute('aria-current', 'page');
if (location.pathname.startsWith('/resources')) navigation.querySelector('a[href="/resources/"]').setAttribute('aria-current', 'page');
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
  const authHint = document.getElementById('registration-auth-hint');
  const successEventName = document.getElementById('success-event-name');
  const successEmail = document.getElementById('success-email');
  const submitButton = modalForm?.querySelector('button[type="submit"]');
  const submitLabel = submitButton?.querySelector('span');
  const modalBox = eventModal.querySelector('.modal-box');
  let activeTriggerBtn = null;

  function openEventModal(eventName) {
    if (eventName && eventSelect) {
      const matchOption = [...eventSelect.options].find(opt => opt.value === eventName || opt.text.includes(eventName));
      if (matchOption) eventSelect.value = matchOption.value;
    }
    modalForm.hidden = false;
    modalSuccess.hidden = true;
    if (errorMsg) errorMsg.hidden = true;
    if (authHint) authHint.hidden = true;

    if (typeof eventModal.showModal === 'function') {
      try { eventModal.showModal(); } catch { eventModal.setAttribute('open', ''); }
    } else {
      eventModal.setAttribute('open', '');
    }
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      if (modalBox) modalBox.scrollTop = 0;
      document.getElementById('reg-name')?.focus();
    });
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

  modalForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorMsg) errorMsg.hidden = true;
    if (authHint) authHint.hidden = true;

    const name = document.getElementById('reg-name')?.value.trim();
    const email = document.getElementById('reg-email')?.value.trim();
    const branch = document.getElementById('reg-branch')?.value;
    const year = document.getElementById('reg-year')?.value;
    const selectedEvent = eventSelect?.value;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!name || !email || !emailRegex.test(email) || !branch || !year || !selectedEvent) {
      if (errorMsg) errorMsg.hidden = false;
      document.querySelector('.form-input:invalid')?.focus();
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute('aria-busy', 'true');
    }
    if (submitLabel) submitLabel.textContent = 'Checking Apple sign-in…';

    try {
      const response = await fetch('/api/auth/status');
      const status = response.ok ? await response.json() : { authenticated: false, available: false };
      if (!status.authenticated) {
        if (errorMsg) {
          errorMsg.textContent = status.available ? 'Sign in with Apple first, then return here to reserve your spot.' : 'Apple sign-in is being connected. Your form is ready, but registration is not open yet.';
          errorMsg.hidden = false;
        }
        if (authHint) authHint.hidden = false;
        return;
      }

      if (successEventName) successEventName.textContent = eventSelect?.selectedOptions?.[0]?.textContent || selectedEvent;
      if (successEmail) successEmail.textContent = email;
      modalForm.hidden = true;
      modalSuccess.hidden = false;
      if (modalBox) modalBox.scrollTop = 0;
      modalForm.reset();
    } catch {
      if (errorMsg) {
        errorMsg.textContent = 'We could not check your Apple sign-in. Please try again.';
        errorMsg.hidden = false;
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.removeAttribute('aria-busy');
      }
      if (submitLabel) submitLabel.textContent = 'Reserve my spot';
    }
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

// Interactive build workbench
function initAppWorkbench() {
  const container = document.getElementById('gravity-bucket-box');
  if (!container) return;
  const placeholder = document.getElementById('app-lab-placeholder');
  const windowCard = document.getElementById('app-lab-window');
  const closeButton = document.getElementById('app-window-close');
  const icons = [...container.querySelectorAll('[data-app-icon]')];
  const fields = { icon: document.getElementById('app-window-icon'), title: document.getElementById('app-window-title'), meta: document.getElementById('app-window-meta'), copy: document.getElementById('app-window-copy'), progress: document.getElementById('app-window-progress-bar'), progressLabel: document.getElementById('app-window-progress-label') };
  const closeWindow = () => { windowCard.hidden = true; placeholder.hidden = false; icons.forEach(icon => icon.classList.remove('is-selected')); };
  icons.forEach(icon => icon.addEventListener('click', () => {
    fields.icon.textContent = icon.dataset.appIcon;
    fields.title.textContent = icon.dataset.appTitle;
    fields.meta.textContent = icon.dataset.appMeta;
    fields.copy.textContent = icon.dataset.appCopy;
    fields.progress.style.width = `${icon.dataset.appProgress}%`;
    fields.progressLabel.textContent = `${icon.dataset.appProgress}% shaped so far`;
    placeholder.hidden = true;
    windowCard.hidden = false;
    icons.forEach(item => item.classList.toggle('is-selected', item === icon));
  }));
  closeButton?.addEventListener('click', closeWindow);
}

initAppWorkbench();

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
