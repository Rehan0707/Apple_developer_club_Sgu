const names = ['First Spark', 'New Horizons', 'The Builder', 'Creative Flow', 'Beyond the Code', 'Orbit Explorer', 'Community Spirit', 'Steady Progress', 'Next Level', 'Limitless'];
export const eventBadges = names.map((name, i) => ({
  id: `event-badge-${String(i + 1).padStart(2, '0')}`,
  name, order: i + 1, type: 'event',
  desc: i === 0 ? 'The beginning of something great. Complete our first club event.' : 'A keepsake for completing its club event.',
  imageUrl: `/images/badges/event-${String(i + 1).padStart(2, '0')}-transparent.webp`
}));
export function completedRegistrations(store, memberId) {
  const seen = new Set();
  return store.all('registrations')
    .filter(r => r.memberId === memberId && r.attended === true)
    .sort((a,b) => (a.completedAt || a.timestamp).localeCompare(b.completedAt || b.timestamp) || a.id.localeCompare(b.id))
    .filter(r => { if (seen.has(r.eventId)) return false; seen.add(r.eventId); return true; });
}
// Runs in the attendance transaction. Correcting attendance updates automatic awards.
// Custom badges awarded directly by administrators are kept separately.
export function reconcileAttendanceBadges(store, memberId) {
  if (!memberId || !store.get('members', memberId)) return;
  const completed = completedRegistrations(store, memberId);
  const events = store.all('events');
  for (const badge of eventBadges) {
    const id = `${memberId}:${badge.id}`;
    const registration = completed.find(r => events.find(e=>e.id===r.eventId)?.badgeId===badge.id);
    if (!registration) { store.delete('awards', id); continue; }
    store.put('awards', {
      id, memberId, badgeId: badge.id, source: 'attendance', eventId: registration.eventId,
      eventTitle: store.get('events', registration.eventId).title,
      date: registration.completedAt || registration.timestamp
    });
  }
}
export function initializeBadges(store) {
  store.transaction(() => {
    for (const badge of eventBadges) store.put('badges', badge);
    for (const member of store.all('members')) reconcileAttendanceBadges(store, member.id);
  });
}
export function memberBadges(store, memberId) {
  const completed = completedRegistrations(store, memberId);
  const awards = store.all('awards').filter(a => a.memberId === memberId);
  const events = store.all('events');
  const catalog = store.all('badges').sort((a,b) => (a.order || 1000) - (b.order || 1000));
  const badges = catalog.map(badge => {
    const award = awards.find(a => a.badgeId === badge.id);
    const event = events.find(e=>e.badgeId===badge.id);
    return { ...badge, earned: Boolean(award), awardedAt: award?.date || null,
      eventId: award?.eventId || event?.id || null,
      eventTitle: award?.eventTitle || event?.title || null,
      eventDate: event?.date || null, eventStatus:event?.status || null,
      progress: award ? 1 : 0, remaining: award ? 0 : 1 };
  });
  return { badges, completedEvents: completed.length, earnedCount: badges.filter(b=>b.earned).length,
    totalCount: catalog.length, earnedEventBadges: badges.filter(b=>b.type==='event'&&b.earned).length,
    nextBadge: badges.find(b=>b.type==='event'&&!b.earned&&b.eventStatus==='upcoming') || badges.find(b=>b.type==='event'&&!b.earned) || null };
}
