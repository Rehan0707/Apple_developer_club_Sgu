const $ = (selector, root = document) => root.querySelector(selector);
const page = document.body.dataset.page;
const dialogIds = ['eventDialog', 'memberDialog', 'badgeDialog', 'badgeDetailsDialog', 'resourceDialog'];
let events = [], members = [], badges = [], resources = [], registrations = [], currentBadgeId = null;

function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) location.replace('/admin/login.html');
    throw new Error(data?.error || `Request failed (${response.status}).`);
  }
  return data;
}

function setBanner(message, tone = '') {
  const banner = $('#pageStatus');
  if (!banner) return;
  banner.textContent = message;
  banner.hidden = !message;
  if (tone) banner.dataset.tone = tone;
  else delete banner.dataset.tone;
}

function setFormError(id, message = '') { const node = document.getElementById(id); if (node) node.textContent = message; }
function fillForm(form, data = {}) {
  form.reset();
  for (const [key, value] of Object.entries(data)) {
    const input = form.elements.namedItem(key);
    if (input) input.value = value ?? '';
  }
}
function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
function formatDate(value, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat(undefined, options).format(date);
}
function localDateInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function pill(value) { return el('span', `pill ${value || ''}`, value || '—'); }
function action(label, callback, danger = false) {
  const button = el('button', `inline-action${danger ? ' danger' : ''}`, label);
  button.type = 'button'; button.addEventListener('click', callback); return button;
}
function emptyRow(body, columns, title, detail, buttonLabel, callback) {
  const tr = el('tr'), td = el('td', 'empty-state'); td.colSpan = columns;
  const strong = el('strong', '', title); td.append(strong, el('span', '', detail));
  if (buttonLabel && callback) { const btn = el('button', 'button small', buttonLabel); btn.type = 'button'; btn.addEventListener('click', callback); td.append(btn); }
  tr.append(td); body.replaceChildren(tr);
}

async function start() {
  let auth;
  try { auth = await api('/api/auth/status'); }
  catch { location.replace('/admin/login.html'); return; }
  if (!auth?.authenticated || auth.role !== 'admin') { location.replace('/admin/login.html'); return; }
  $('#signout')?.addEventListener('click', async () => {
    const button = $('#signout'); button.disabled = true;
    try { await api('/api/auth/signout', { method: 'POST' }); location.replace('/admin/login.html'); }
    catch (error) { setBanner(error.message, 'error'); button.disabled = false; }
  });
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));
  for (const id of dialogIds) {
    const dialog = document.getElementById(id);
    dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  }
  if (page === 'events') await loadEventsPage();
  if (page === 'members') await loadMembersPage();
  if (page === 'badges') await loadBadgesPage();
  if (page === 'resources') await loadResourcesPage();
  if (page === 'registrations') await loadRegistrationsPage();
}

async function loadOverview() {
  const summary = await api('/api/admin/overview');
  $('#countMembers').textContent = summary.counts.members;
  $('#countEvents').textContent = summary.counts.upcomingEvents;
  $('#countBadges').textContent = summary.counts.activeBadges;
  $('#countRegistrations').textContent = summary.counts.registrations;
  const state = summary.storage.googleSheets;
  if (state?.connected) setBanner('Google Sheets is reachable. Website changes are mirrored server-side.', 'good');
  else if (state?.configured) setBanner('Google Sheets credentials are configured, but the workbook is not reachable. Check the service-account key and workbook sharing.', 'error');
  else setBanner('Local database is active. Google Sheets is not connected yet; visitor submissions are saved locally until the server-side workbook credentials are set up.', '');
}

async function loadEventsPage() {
  try {
    [events] = await Promise.all([api('/api/admin/events'), loadOverview()]);
    renderEvents();
    $('#newEvent').addEventListener('click', () => openEvent());
    $('#eventForm').addEventListener('submit', saveEvent);
  } catch (error) { setBanner(error.message, 'error'); }
}
function renderEvents() {
  const body = $('#eventsTableBody');
  if (!events.length) return emptyRow(body, 6, 'No events saved yet', 'Create a published event when its details are confirmed; the public pages will update automatically.', 'Create an event', () => openEvent());
  const rows = events.map(event => {
    const tr = el('tr');
    const titleCell = el('td'); titleCell.append(el('span', 'table-title', event.title), el('span', 'table-subtitle', event.category || 'Event'));
    const date = el('td', '', formatDate(event.date)); const location = el('td', '', event.location || '—');
    const registered = el('td', '', String(event.registrationCount ?? 0));
    const status = el('td'); status.append(pill(event.status));
    const actions = el('td'), group = el('div', 'table-actions');
    group.append(action('Edit', () => openEvent(event)), action('Archive', () => archiveEvent(event), true)); actions.append(group);
    tr.append(titleCell, date, location, registered, status, actions); return tr;
  });
  body.replaceChildren(...rows);
}
function openEvent(event = {}) {
  const form = $('#eventForm');
  fillForm(form, { ...event, date: event.date ? localDateInput(event.date) : '', capacity: event.capacity ?? '' });
  $('#eventDialogTitle').textContent = event.id ? 'Edit event' : 'New event';
  setFormError('eventFormError'); $('#eventDialog').showModal();
}
async function saveEvent(event) {
  event.preventDefault();
  const form = event.currentTarget, values = formData(form), id = values.id;
  const data = { ...values, capacity: values.capacity || null };
  const button = form.querySelector('[type="submit"]'); button.disabled = true; setFormError('eventFormError');
  try {
    const saved = await api(id ? `/api/admin/events/${encodeURIComponent(id)}` : '/api/admin/events', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
    events = id ? events.map(row => row.id === id ? saved : row) : [...events, saved];
    $('#eventDialog').close(); renderEvents(); await loadOverview();
    setBanner(saved.sheetSync === 'pending' ? 'Event saved locally; Google Sheets sync needs attention.' : 'Event saved. Public event pages now use this record.', saved.sheetSync === 'pending' ? 'error' : saved.sheetSync === 'synced' ? 'good' : '');
  } catch (error) { setFormError('eventFormError', error.message); }
  finally { button.disabled = false; }
}
async function archiveEvent(event) {
  if (!confirm(`Archive “${event.title}”? Past registrations will be kept.`)) return;
  try { await api(`/api/admin/events/${encodeURIComponent(event.id)}`, { method: 'DELETE' }); events = events.filter(row => row.id !== event.id); renderEvents(); await loadOverview(); }
  catch (error) { setBanner(error.message, 'error'); }
}

async function loadMembersPage() {
  try { members = await api('/api/admin/members'); renderMembers(); $('#newMember').addEventListener('click', () => openMember()); $('#memberForm').addEventListener('submit', saveMember); }
  catch (error) { setBanner(error.message, 'error'); }
}
function renderMembers() {
  const body = $('#membersTableBody'); $('#memberCount').textContent = `${members.length} saved ${members.length === 1 ? 'member' : 'members'}`;
  if (!members.length) return emptyRow(body, 5, 'No member records yet', 'Add a real club member or let a verified member complete their profile.', 'Add a member', () => openMember());
  body.replaceChildren(...members.map(member => {
    const tr = el('tr'), person = el('td'); person.append(el('span', 'table-title', member.name || 'Profile incomplete'), el('span', 'table-subtitle', member.email || 'No email on file'));
    const dept = el('td', '', member.department || '—'), year = el('td', '', member.year || '—'), status = el('td'); status.append(pill(member.status));
    const actions = el('td'), group = el('div', 'table-actions'); group.append(action('Edit', () => openMember(member)), action('Archive', () => archiveMember(member), true)); actions.append(group);
    tr.append(person, dept, year, status, actions); return tr;
  }));
}
function openMember(member = {}) {
  fillForm($('#memberForm'), member); $('#memberDialogTitle').textContent = member.id ? 'Edit member' : 'Add member';
  setFormError('memberFormError'); $('#memberDialog').showModal();
}
async function saveMember(event) {
  event.preventDefault(); const form = event.currentTarget, values = formData(form), id = values.id;
  const button = form.querySelector('[type="submit"]'); button.disabled = true; setFormError('memberFormError');
  try {
    const saved = await api(id ? `/api/admin/members/${encodeURIComponent(id)}` : '/api/admin/members', { method: id ? 'PUT' : 'POST', body: JSON.stringify(values) });
    members = id ? members.map(row => row.id === id ? saved : row) : [...members, saved]; $('#memberDialog').close(); renderMembers();
    if (saved.sheetSync === 'pending') setBanner('Member saved locally; Google Sheets sync needs attention.', 'error');
  } catch (error) { setFormError('memberFormError', error.message); }
  finally { button.disabled = false; }
}
async function archiveMember(member) {
  if (!confirm(`Archive ${member.name}? Existing registrations and awards will be retained.`)) return;
  try { await api(`/api/admin/members/${encodeURIComponent(member.id)}`, { method: 'DELETE' }); members = members.filter(row => row.id !== member.id); renderMembers(); }
  catch (error) { setBanner(error.message, 'error'); }
}

async function loadBadgesPage() {
  try { [badges, members] = await Promise.all([api('/api/badges'), api('/api/admin/members')]); renderBadges(); $('#newBadge').addEventListener('click', () => openBadge()); $('#badgeForm').addEventListener('submit', saveBadge); $('#assignBadge').addEventListener('click', assignBadge); }
  catch (error) { setBanner(error.message, 'error'); }
}
function badgeColor(value) { return ({ blue: '#0071e3', primary: '#0071e3', green: '#248a3d', secondary: '#248a3d', orange: '#c77700', red: '#d70015', error: '#d70015', purple: '#8e44ad', tertiary: '#8e44ad' })[value] || '#0071e3'; }
function renderBadges() {
  $('#badgeCount').textContent = `${badges.length} saved ${badges.length === 1 ? 'design' : 'designs'}`;
  const grid = $('#badgesGrid');
  if (!badges.length) {
    const empty = el('div', 'empty-state'); empty.append(el('strong', '', 'No badge designs saved'), el('span', '', 'Create an authentic club badge when its name and award criteria are confirmed.'));
    const button = el('button', 'button small', 'Create a badge'); button.type = 'button'; button.addEventListener('click', () => openBadge()); empty.append(button); grid.replaceChildren(empty); return;
  }
  grid.replaceChildren(...badges.map(badge => {
    const card = el('article', 'badge-card'), art = el('div', 'badge-art'); art.style.setProperty('--badge-color', badgeColor(badge.color));
    if (badge.imageUrl) { const image = el('img'); image.src = badge.imageUrl; image.alt = `${badge.name} badge artwork`; image.loading = 'lazy'; image.onerror = () => { image.remove(); art.append(el('span', 'material-symbols-outlined', badge.icon || 'verified')); }; art.append(image); }
    else art.append(el('span', 'material-symbols-outlined', badge.icon || 'verified'));
    card.append(art, el('h3', '', badge.name), el('p', '', badge.desc));
    if (badge.status === 'archived') card.append(el('span', 'badge-meta', 'Archived'));
    const actions = el('div', 'table-actions'); actions.append(action('View details', () => openBadgeDetails(badge)), action('Edit', () => openBadge(badge)), action('Archive', () => archiveBadge(badge), true));
    card.append(actions); return card;
  }));
}
function openBadge(badge = {}) { const form = $('#badgeForm'); fillForm(form, badge); $('#badgeDialogTitle').textContent = badge.id ? 'Edit badge' : 'New badge'; setFormError('badgeFormError'); $('#badgeDialog').showModal(); }
async function saveBadge(event) {
  event.preventDefault(); const form = event.currentTarget, values = formData(form), id = values.id;
  const button = form.querySelector('[type="submit"]'); button.disabled = true; setFormError('badgeFormError');
  try { const saved = await api(id ? `/api/admin/badges/${encodeURIComponent(id)}` : '/api/admin/badges', { method: id ? 'PUT' : 'POST', body: JSON.stringify(values) }); badges = id ? badges.map(row => row.id === id ? saved : row) : [...badges, saved]; $('#badgeDialog').close(); renderBadges(); if (saved.sheetSync === 'pending') setBanner('Badge saved locally; Google Sheets sync needs attention.', 'error'); }
  catch (error) { setFormError('badgeFormError', error.message); }
  finally { button.disabled = false; }
}
async function archiveBadge(badge) {
  if (!confirm(`Archive “${badge.name}”? Member award history will be retained.`)) return;
  try { await api(`/api/admin/badges/${encodeURIComponent(badge.id)}`, { method: 'DELETE' }); badges = badges.filter(row => row.id !== badge.id); renderBadges(); }
  catch (error) { setBanner(error.message, 'error'); }
}
async function openBadgeDetails(badge) {
  currentBadgeId = badge.id; $('#badgeDetailsTitle').textContent = badge.name; $('#badgeDetailsDescription').textContent = badge.desc;
  setFormError('awardError');
  const select = $('#assignMemberSelect'); select.replaceChildren(new Option('Select a saved member', ''), ...members.map(member => new Option(`${member.name} — ${member.email}`, member.id)));
  const list = $('#badgeMembersList');
  try {
    const awarded = await api(`/api/admin/badges/${encodeURIComponent(badge.id)}/members`);
    if (!awarded.length) list.replaceChildren(el('li', '', 'No member has this badge yet.'));
    else list.replaceChildren(...awarded.map(member => { const item = el('li'); item.append(el('span', '', member.name), el('small', '', member.email)); return item; }));
  } catch (error) { list.replaceChildren(el('li', '', error.message)); }
  $('#assignBadge').disabled = members.length === 0; $('#badgeDetailsDialog').showModal();
}
async function assignBadge() {
  const memberId = $('#assignMemberSelect').value;
  if (!currentBadgeId || !memberId) return setFormError('awardError', 'Choose a saved member first.');
  const button = $('#assignBadge'); button.disabled = true; setFormError('awardError');
  try { await api('/api/admin/badges/assign', { method: 'POST', body: JSON.stringify({ badgeId: currentBadgeId, memberId }) }); await openBadgeDetails(badges.find(row => row.id === currentBadgeId)); setBanner('Badge awarded to the selected member.', 'good'); }
  catch (error) { setFormError('awardError', error.message); }
  finally { button.disabled = members.length === 0; }
}

async function loadResourcesPage() {
  try { resources = await api('/api/resources'); renderResources(); $('#newResource').addEventListener('click', () => openResource()); $('#resourceForm').addEventListener('submit', saveResource); }
  catch (error) { setBanner(error.message, 'error'); }
}
function renderResources() {
  $('#resourceCount').textContent = `${resources.length} saved ${resources.length === 1 ? 'resource' : 'resources'}`;
  const body = $('#resourcesTableBody');
  if (!resources.length) return emptyRow(body, 4, 'No resources saved yet', 'Add a verified link. The public and member resource lists use these records.', 'Add a resource', () => openResource());
  body.replaceChildren(...resources.map(resource => {
    const tr = el('tr'), title = el('td'); title.append(el('span', 'table-title', resource.title));
    const category = el('td', '', resource.category || 'General'), linkCell = el('td'), link = el('a', 'inline-action', 'Open ↗'); link.href = resource.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; linkCell.append(link);
    const actions = el('td'), group = el('div', 'table-actions'); group.append(action('Edit', () => openResource(resource)), action('Remove', () => removeResource(resource), true)); actions.append(group);
    tr.append(title, category, linkCell, actions); return tr;
  }));
}
function openResource(resource = {}) { fillForm($('#resourceForm'), resource); $('#resourceDialogTitle').textContent = resource.id ? 'Edit resource' : 'Add resource'; setFormError('resourceFormError'); $('#resourceDialog').showModal(); }
async function saveResource(event) {
  event.preventDefault(); const form = event.currentTarget, values = formData(form), id = values.id;
  const button = form.querySelector('[type="submit"]'); button.disabled = true; setFormError('resourceFormError');
  try { const saved = await api(id ? `/api/admin/resources/${encodeURIComponent(id)}` : '/api/admin/resources', { method: id ? 'PUT' : 'POST', body: JSON.stringify(values) }); resources = id ? resources.map(row => row.id === id ? saved : row) : [...resources, saved]; $('#resourceDialog').close(); renderResources(); if (saved.sheetSync === 'pending') setBanner('Resource saved locally; Google Sheets sync needs attention.', 'error'); }
  catch (error) { setFormError('resourceFormError', error.message); }
  finally { button.disabled = false; }
}
async function removeResource(resource) {
  if (!confirm(`Remove “${resource.title}” from the public resource library?`)) return;
  try { await api(`/api/admin/resources/${encodeURIComponent(resource.id)}`, { method: 'DELETE' }); resources = resources.filter(row => row.id !== resource.id); renderResources(); }
  catch (error) { setBanner(error.message, 'error'); }
}

async function loadRegistrationsPage() {
  try {
    [registrations, events] = await Promise.all([api('/api/admin/registrations'), api('/api/admin/events')]);
    const filter = $('#registrationEventFilter');
    filter.replaceChildren(new Option('All events', ''), ...events.map(event => new Option(event.title, event.id)));
    filter.addEventListener('change', renderRegistrations);
    renderRegistrations();
  } catch (error) { setBanner(error.message, 'error'); }
}
function renderRegistrations() {
  const filter = $('#registrationEventFilter').value;
  const rows = registrations.filter(row => !filter || row.eventId === filter);
  $('#registrationCount').textContent = `${rows.length} saved ${rows.length === 1 ? 'registration' : 'registrations'}`;
  const body = $('#registrationsTableBody');
  if (!rows.length) return emptyRow(body, 5, 'No registrations saved yet', filter ? 'No one has registered for this event yet.' : 'Public event submissions will appear here after the server saves them.', null, null);
  body.replaceChildren(...rows.map(registration => {
    const tr = el('tr'), person = el('td'); person.append(el('span', 'table-title', registration.name), el('span', 'table-subtitle', registration.email));
    const event = el('td', '', registration.eventTitle || events.find(item => item.id === registration.eventId)?.title || 'Event');
    const course = el('td'); course.append(el('span', '', registration.department || '—'), el('span', 'table-subtitle', registration.year || ''));
    const date = el('td', '', formatDate(registration.createdAt));
    const statusCell = el('td'), select = el('select', 'filter-select'); select.setAttribute('aria-label', `Registration status for ${registration.name}`); select.style.minWidth = '140px';
    for (const state of ['registered', 'attended', 'cancelled']) select.add(new Option(state[0].toUpperCase() + state.slice(1), state));
    select.value = registration.status; select.addEventListener('change', async () => {
      select.disabled = true;
      try { const updated = await api(`/api/admin/registrations/${encodeURIComponent(registration.id)}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) }); registrations = registrations.map(row => row.id === updated.id ? updated : row); }
      catch (error) { setBanner(error.message, 'error'); select.value = registration.status; }
      finally { select.disabled = false; }
    });
    statusCell.append(select); tr.append(person, event, course, date, statusCell); return tr;
  }));
}

start();
