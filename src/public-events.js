const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
});

function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function eventCard(event) {
  const card = element('article', 'apple-events-card');
  const banner = element('div', 'events-card-banner');
  if (event.imageUrl) {
    const image = element('img', 'events-card-img');
    image.src = event.imageUrl;
    image.alt = '';
    image.loading = 'lazy';
    banner.append(image);
  }

  const body = element('div', 'events-card-body');
  const meta = element('div', 'events-card-meta');
  if (event.category) meta.append(element('span', 'events-card-type', event.category));
  const date = new Date(event.date);
  if (!Number.isNaN(date.valueOf())) meta.append(element('time', 'events-card-date', dateFormatter.format(date)));
  const title = element('h3', 'events-card-title', event.title);
  const description = event.description ? element('p', 'events-card-desc', event.description) : null;
  const location = element('p', 'events-card-location', event.location);
  const action = element('a', 'event-action-link', 'Register');
  action.replaceChildren(
    element('span', 'action-text', 'Register'),
    Object.assign(element('span', 'action-badge', '›'), { ariaHidden: 'true' })
  );
  action.href = `/register/?event=${encodeURIComponent(event.id)}`;

  body.append(meta, title);
  if (description) body.append(description);
  body.append(location);
  if (event.remainingCapacity === 0) {
    const full = element('span', 'event-full-label', 'Full');
    body.append(full);
  } else {
    const actions = element('div', 'events-card-actions');
    actions.append(action);
    body.append(actions);
  }
  card.append(banner, body);
  return card;
}

async function loadEvents(grid) {
  grid.setAttribute('aria-busy', 'true');
  grid.replaceChildren(element('p', 'events-empty-state', 'Loading confirmed events…'));
  try {
    const response = await fetch('/api/events', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Could not load events.');
    const events = await response.json();
    if (!Array.isArray(events)) throw new Error('Unexpected event data.');
    if (!events.length) {
      grid.replaceChildren(element('p', 'events-empty-state', 'No upcoming events have been published yet. Please check back soon.'));
      return;
    }
    grid.replaceChildren(...events.map(eventCard));
  } catch {
    grid.replaceChildren(element('p', 'events-empty-state', 'Events are temporarily unavailable. Please refresh to try again.'));
  } finally {
    grid.removeAttribute('aria-busy');
  }
}

document.querySelectorAll('[data-live-events]').forEach(loadEvents);
