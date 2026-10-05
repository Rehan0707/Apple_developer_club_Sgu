# Website test report — 5 October 2026

Tested the deployed Apple Developer Club SGU site at
https://appledeveloperacademysgu.web.app and the current source with isolated
Firebase Auth/Firestore emulators. No production registrations, members, projects,
attendance, or badges were created or changed by the audit.

## Passed

- 34 automated tests: authentication, session durability, capacity and concurrent
  registration limits, duplicate registration prevention, cancellation,
  attendance, badge assignment, feedback, project approval/unpublishing, URL
  validation, snapshot caching, and calendar formatting.
- Firestore emulator rules: private member records, cross-member denial,
  registration ownership, cancellation/re-registration, attendance, feedback,
  member project ownership, blocked self-approval, and admin publication.
- Production route checks: landing, events, join, student shell, admin login
  aliases, and public Firestore events/resources/badges return successfully.
- Browser checks of landing/events/resources/team/guide/join/admin login at
  desktop 1440 px and mobile 390 px; no uncaught JavaScript errors in that scan.
- Isolated browser checks of all four admin pages at both viewport sizes.
- Isolated browser navigation through dashboard/events/badges/profile/resources
  at both viewport sizes, retaining member identity and earned badge.
- Real app calls in the emulator: event creation, member registration, cancellation,
  re-registration, early check-in rejection, attendance confirmation, event-specific
  New Horizons badge, first feedback submission, feedback edit, admin feedback read.
- QR pass renders at 300 px with the correct title and entry code. Calendar button
  downloads an ICS file with the correct UTC event time and a 30-minute alarm.
- Admin form uploads a 1600 × 800 image and saves it as 1024 × 1024 with metadata.
- Member project form submits a wide logo; admin approval publishes it, and
  rejection removes the corresponding public app logo.
- Member sign-out denies subsequent member API reads while admin remains signed in.

## Bugs fixed and published

1. First feedback submission previously failed with a Firestore permission error
   when reading an absent feedback document. It now searches only the member's
   authorized feedback query before creating a response. Both first save and edit
   were retested successfully, including admin visibility.
2. Invisible desktop navigation flyouts widened mobile pages to approximately
   509 px. Closed flyouts no longer participate in the mobile layout; landing,
   events, and join were retested at 390 px without overflow.

## Limits and unresolved configuration

- `https://adcsgu.web.app` returned HTTP 404 on all checked pages. Local hosting
  configuration points to that site; normal deployment with that site previously
  failed. The existing working site received this audit's fixes using a temporary
  explicit hosting configuration. Domain-migration changes were preserved.
- Apple sign-in remains unavailable in the deployed Firebase provider setup.
- Google sign-in was exercised through the Auth emulator, not a real production
  Google account. Password reset email delivery, physical camera QR scanning,
  and full browser-process restart with a persistent production profile require
  a live account/device rehearsal.
- Calendar alarms depend on the importing calendar application. Email and push
  reminder delivery is not implemented by this calendar feature.
- This audit does not claim exhaustive coverage of every device/browser or
  production load. The checks above describe the evidence actually obtained.
