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

