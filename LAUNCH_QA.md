# Launch flow verification — 4 October 2026

The browser checks below used the real website UI against Firebase Auth and
Firestore emulators (`demo-sgu-club`). They did not create production members or
change live events. Google provider login was simulated by the Auth emulator.

## Passed browser checks

- Administrator email/password login and event creation with First Spark assigned.
- Two separate Google member accounts signed in and registered for the same event.
- Both registrations appeared in the administrator portal.
- Member one received a rendered QR pass with event name, purpose, time, location,
  and an entry code that resolved to the correct administrator attendee record.
- Future-event check-in was blocked. Moving the test event into the past enabled
  confirmation.
- Confirming member one's entry updated attendance and awarded First Spark.
  Member two still had zero badges until their own entry was confirmed.
- Member two's badge updated in their open portal without a manual reload.
- A confirmed pass showed checked-in status and prevented repeat confirmation.
- Administrator and member sessions coexisted in the same browser without
  replacing each other's identity. Administrator navigation and reload retained
  sign-in and both confirmed attendance records. Member navigation retained
  sign-in and their earned badge.

## Automated validation

- `npm test`: 29 passed.
- `npm run test:rules`: passed ownership, registration, cancellation, attendance,
  feedback, and cross-member denial checks against the Firestore emulator.
- `npm run build`: passed. Emulator mode is gated by development mode; the
  production bundle sets its enable flag to false.

## Remaining live rehearsal

Use the deployed site with two real Google accounts and the club administrator.
Repeat registration and check-in on a designated test event. Verify Google popup
authorization, scan a displayed QR with a physical phone camera, and reopen the
browser to check persistent sign-in. These external-provider, hardware, and full
browser-restart checks were not established by the emulator run.

Before the first event, assign a team member to handle sign-in/reset problems and
keep manual entry-code lookup available if a camera cannot scan a pass.

## Repeat the isolated browser check

Start Firebase with Java 21 available:

```sh
firebase emulators:start --only auth,firestore --project demo-sgu-club --config firebase.emulator.json
```

In another terminal:

```sh
VITE_FIREBASE_EMULATORS=true npx vite --host 127.0.0.1 --port 5175
```

Use only disposable emulator accounts. Create a verified email/password account
for the configured administrator email in the Auth emulator, and use its Google
login widget to create test members. Never run the rules test while preserving an
active browser test dataset: the rules test resets emulator Firestore data.
