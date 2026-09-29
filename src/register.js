const form = document.getElementById('registrationForm');
const eventPanel = document.getElementById('selectedEvent');
const message = document.getElementById('registrationMessage');
const submit = document.getElementById('registrationSubmit');
const query = new URLSearchParams(location.search);
const eventId = query.get('event');
let selectedEvent = null;

function showMessage(text, tone = '') {
  message.textContent = text;
  if (tone) message.dataset.tone = tone;
  else delete message.dataset.tone;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Date to be confirmed' : new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(date);
}

async function loadEvent() {
  if (!eventId) throw new Error('Choose an event from the events page before registering.');
  const response = await fetch('/api/events', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Events are temporarily unavailable. Please return to the events page and try again.');
  const events = await response.json();
  selectedEvent = events.find(item => item.id === eventId);
  if (!selectedEvent) throw new Error('This event is no longer open. Please choose a current event.');

  const title = document.createElement('h2');
  title.textContent = selectedEvent.title;
  const date = document.createElement('p');
  date.textContent = formatDate(selectedEvent.date);
  const location = document.createElement('p');
  location.textContent = selectedEvent.location;
  eventPanel.replaceChildren(title, date, location);
  submit.disabled = false;
  submit.textContent = 'Submit registration';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  showMessage('');
  if (!selectedEvent || !form.reportValidity()) return;
  submit.disabled = true;
  submit.setAttribute('aria-busy', 'true');
  submit.textContent = 'Saving…';
  const formData = new FormData(form);
  const body = Object.fromEntries(formData.entries());
  try {
    const response = await fetch(`/api/events/${encodeURIComponent(selectedEvent.id)}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Registration could not be saved. Please try again.');
    const syncMessage = result.sheetSync === 'synced'
      ? ' Google Sheets is up to date.'
      : result.sheetSync === 'pending'
        ? ' It is saved locally; Google Sheets sync is pending and needs setup or access.'
        : ' It is saved locally; Google Sheets is not configured on this website yet.';
    eventPanel.querySelectorAll('p').forEach(item => item.remove());
    const confirmation = document.createElement('p');
    confirmation.textContent = `Registration confirmed for ${result.eventTitle || selectedEvent.title}.`;
    eventPanel.append(confirmation);
    form.reset();
    showMessage(`Your registration is saved.${syncMessage}`, 'good');
    submit.textContent = 'Saved';
  } catch (error) {
    showMessage(error.message);
    submit.disabled = false;
    submit.textContent = 'Submit registration';
  } finally {
    submit.removeAttribute('aria-busy');
  }
});

loadEvent().catch(error => {
  eventPanel.replaceChildren(Object.assign(document.createElement('p'), { className: 'registration-empty', textContent: error.message }));
  form.hidden = true;
  showMessage('No registration was submitted.');
  submit.textContent = 'Event unavailable';
});
