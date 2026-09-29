const $ = selector => document.querySelector(selector);

function node(tag, className = '', text = '') {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text) item.textContent = text;
  return item;
}

function showMessage(message, tone = '') {
  const banner = $('#memberStatus');
  if (!banner) return;
  banner.hidden = !message;
  banner.textContent = message;
  if (tone) banner.dataset.tone = tone;
  else delete banner.dataset.tone;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      location.replace('/join/');
      return;
    }
    throw new Error(data?.error || 'The request could not be completed.');
  }
  return data;
}

function prettyDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Date to be confirmed'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function renderUpcomingEvents(target, events, registrations, onRegister) {
  if (!events.length) {
    target.replaceChildren(node('p', 'empty-state', 'No upcoming events scheduled right now. Check back soon!'));
    return;
  }

  const registeredEventIds = new Set(
    (registrations || []).filter(r => r.status !== 'cancelled').map(r => r.eventId)
  );

  target.replaceChildren(...events.map(event => {
    const item = node('article', 'member-item');
    const isRegistered = registeredEventIds.has(event.id);

    const info = node('div', 'member-item-info');
    const title = node('strong', '', event.title);
    const meta = node('small', '', `${prettyDate(event.date)} · ${event.location || 'Campus Center'}`);
    info.append(title, meta);

    const action = node('div', 'member-item-action');
    if (isRegistered) {
      const tag = node('span', 'registered-tag', '✓ Registered');
      action.append(tag);
    } else {
      const rsvpBtn = node('button', 'btn-rsvp', '1-Click RSVP');
      rsvpBtn.type = 'button';
      rsvpBtn.addEventListener('click', async () => {
        rsvpBtn.disabled = true;
        rsvpBtn.textContent = 'Registering…';
        try {
          await onRegister(event.id, event.title);
        } catch (err) {
          rsvpBtn.disabled = false;
          rsvpBtn.textContent = '1-Click RSVP';
          showMessage(err.message, 'error');
        }
      });
      action.append(rsvpBtn);
    }

    item.append(info, action);
    return item;
  }));
}

function renderRegistrations(target, registrations, onCancel) {
  if (!registrations.length) {
    target.replaceChildren(node('p', 'empty-state', 'No registrations found. Register for an upcoming event above!'));
    return;
  }

  target.replaceChildren(...registrations.map(reg => {
    const item = node('article', 'member-item');

    const info = node('div', 'member-item-info');
    const title = node('strong', '', reg.eventTitle || 'Club event');
    const meta = node('small', '', `${prettyDate(reg.createdAt)} · Status: ${reg.status || 'registered'}`);
    info.append(title, meta);

    const action = node('div', 'member-item-action');
    const statusPill = node('span', `pill ${reg.status || 'registered'}`, reg.status || 'registered');
    action.append(statusPill);

    if (reg.status === 'registered') {
      const cancelBtn = node('button', 'btn-cancel', 'Cancel RSVP');
      cancelBtn.type = 'button';
      cancelBtn.title = 'Cancel your registration for this event';
      cancelBtn.addEventListener('click', async () => {
        if (!confirm(`Are you sure you want to cancel your registration for "${reg.eventTitle}"?`)) return;
        cancelBtn.disabled = true;
        cancelBtn.textContent = 'Cancelling…';
        try {
          await onCancel(reg.id, reg.eventTitle);
        } catch (err) {
          cancelBtn.disabled = false;
          cancelBtn.textContent = 'Cancel RSVP';
          showMessage(err.message, 'error');
        }
      });
      action.append(cancelBtn);
    }

    item.append(info, action);
    return item;
  }));
}

function renderBadges(target, badges) {
  if (!badges.length) {
    target.replaceChildren(node('p', 'empty-state', 'No badges have been awarded to your account yet. Participate in club events and workshops to earn badges!'));
    return;
  }

  target.replaceChildren(...badges.map(badge => {
    const card = node('article', 'badge-card-item');

    const iconBox = node('div', `badge-icon-box ${badge.color || 'blue'}`);
    iconBox.textContent = badge.color === 'orange' ? '⚡' : badge.color === 'purple' ? '✦' : badge.color === 'green' ? '★' : '';

    const details = node('div', 'badge-details');
    const title = node('h3', '', badge.name);
    const desc = node('p', '', badge.desc || 'Recognized achievement with Apple Developer Club SGU.');
    details.append(title, desc);

    card.append(iconBox, details);
    return card;
  }));
}

async function loadMember() {
  try {
    const data = await api('/api/me/dashboard');
    if (!data) return;

    const profile = data.profile || data.member || {};
    const friendlyName = profile.name || 'Member';
    $('#welcomeName').textContent = `Welcome${profile.name ? `, ${friendlyName}` : ''}`;
    $('#memberHeaderName').textContent = friendlyName;

    const initial = (profile.name ? profile.name.charAt(0) : 'M').toUpperCase();
    const dot = $('#memberDot');
    if (dot) dot.textContent = initial;

    const isAdmin = data.role === 'admin';
    const rolePill = $('#memberRolePill');
    if (rolePill) {
      rolePill.textContent = isAdmin ? 'Administrator' : (profile.status ? `${profile.status.toUpperCase()} Member` : 'Active Member');
      rolePill.className = `pill ${isAdmin ? 'admin' : (profile.status || 'active')}`;
    }

    if (isAdmin) {
      $('#memberStatusText').textContent = 'Administrator View: You are previewing how members experience the club.';
      const navLink = document.getElementById('adminPortalNav');
      if (navLink) navLink.style.display = 'flex';
      const headerBtn = document.getElementById('adminHeaderBtn');
      if (headerBtn) headerBtn.style.display = 'inline-flex';
    } else {
      $('#memberStatusText').textContent = 'Your verified student membership record with Apple Developer Club SGU.';
    }

    $('#profileName').value = profile.name || '';
    $('#profileEmail').value = profile.email || '';
    $('#profileDepartment').value = profile.department || '';
    $('#profileYear').value = profile.year || '';

    // Render Upcoming Events with 1-Click RSVP
    const upcomingEvents = data.upcomingEvents || data.events || [];
    const registrations = data.registeredEvents || data.registrations || [];

    renderUpcomingEvents($('#upcomingEventsList'), upcomingEvents, registrations, async (eventId, eventTitle) => {
      await api('/api/me/register', {
        method: 'POST',
        body: JSON.stringify({ eventId })
      });
      showMessage(`You have successfully registered for "${eventTitle}"!`, 'good');
      await loadMember();
    });

    // Render Registrations
    renderRegistrations($('#registeredEvents'), registrations, async (regId, eventTitle) => {
      await api(`/api/me/registrations/${regId}/cancel`, { method: 'POST' });
      showMessage(`Cancelled registration for "${eventTitle}".`, 'good');
      await loadMember();
    });

    // Render Badges
    renderBadges($('#earnedBadges'), data.badges || []);

  } catch (error) {
    showMessage(error.message, 'error');
  }
}

$('#memberProfileForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#saveProfile');
  button.disabled = true;
  $('#profileError').textContent = '';

  const values = Object.fromEntries(new FormData(form).entries());
  try {
    await api('/api/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(values)
    });
    showMessage('Your profile details were saved successfully.', 'good');
    await loadMember();
  } catch (error) {
    $('#profileError').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#memberSignout')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api('/api/auth/signout', { method: 'POST' });
    location.replace('/join/');
  } catch (error) {
    showMessage(error.message, 'error');
    button.disabled = false;
  }
});

loadMember();
