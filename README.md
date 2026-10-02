# Apple Developer Club SGU

The existing website design now connects to a local Express application with a durable SQLite database. No hosting or deployment is required.

## Start locally

Use Node.js 22.13+ (Node 24 LTS recommended).

```sh
npm install
npm run setup:local
npm run build
npm start
```

Open **http://127.0.0.1:3001**. The server binds to loopback by default.

- Admin portal: http://127.0.0.1:3001/admin/login.html
- Local admin username/password: `.local-access.txt`, created by `setup:local`, excluded from git, and readable only by the current user.
- Student preview: `/join/` → **Preview locally**. This is an explicitly labelled local test account, separate from Apple and Google sign-in.
- Development: `npm run dev` serves Vite on http://127.0.0.1:5173 and proxies API calls to port 3001. Stop `npm start` first to free the API port.
- `setup:local` never overwrites an existing `.env`.

## Working flows

- Admin password verification runs on the server using a salted scrypt hash. There is no mock-admin endpoint or password embedded in browser code.
- Add, edit, and delete events; publish dates, locations, capacity and an optional banner image. New admin events open registration automatically when their date is in the future.
- Visitors can submit the existing registration form. The server validates it, saves it, rejects duplicates and enforces capacity atomically. The confirmation means **saved**, not an email sent.
- Students can register from their dashboard and see their own registrations and badges. The next-event card opens the QR pass and downloads a calendar file. Before an event starts, a signed-in member can cancel their place; the seat reopens immediately, the old pass becomes invalid, and admins retain a cancelled record. Unauthenticated visitor registrations do not create verified accounts. After Apple or Google verifies a mailbox, its unlinked guest registrations are attached to that member; registrations already owned by another account are never transferred.
- Admins can view registrations, confirm attendance, review and filter post-event feedback, select the completion badge for each event, create and manually assign additional custom badges, and add/edit/delete resources.
- The alternate `/dashboard/` shows actual member activity, the same QR entry code used by the member portal, a downloadable text pass, calendar export, and location search. It does not claim to issue signed Apple Wallet or NFC passes.
- Server-sent events refresh open pages after changes and on reconnection. Registered members see a notice when an event's name, details, time, location, or status changes, and their QR pass changes to a checked-in state when attendance is confirmed. SSE contains only a change signal; private records still require authentication.
- Public resource pages and homepage resource lists share the same database.
- All public, admin and student pages are included in the production build. Portal CSS is compiled locally, preserving the existing Tailwind theme values.

Events, registrations and awards start empty; the 10 supplied badge images are included as a locked collection. Event illustrations remain explicitly labelled previews until events are published. Core Team roles appear on the Team page as labelled placeholders until confirmed leadership details are supplied. The old `data/db.json` and `lib/sheets.js` are retained as legacy source material and are not the active database. No sample member identities are imported.

## Storage and configuration

`data/club.sqlite` is the active database. Events, registrations, resources, members, badges, awards and one-hour sessions survive server restarts. Uploaded event banners are stored in `data/uploads/` by default; back up that folder with the database. PNG, JPEG and WebP uploads are limited to 5 MB. Keep the SQLite database and its WAL files on a persistent local disk. This implementation targets **one application process**. Stop the server before copying database files for backup, or use SQLite's backup facilities.

See `.env.example`. `DATABASE_PATH` can point to a different database. `.env`, private Apple keys, databases, local credentials and browser artifacts are ignored by git. Do not put server secrets into `VITE_` variables.

To change the local admin password, generate a new salt/hash with Node's `scryptSync(password, salt, 64)`, set `ADMIN_PASSWORD_HASH` to `salt:hexHash`, and restart the server. No plaintext password is used by the server.

## Event badges

Open `/student/#badges` to see earned totals, completed events, locked artwork, and each badge’s event and award date. All 10 supplied images are preserved; their source mapping is in `public/images/badges/README.md`.

1. In Admin → Events, add an event and select its **Completion Badge**. The first event defaults to **First Spark**. Each badge belongs to one event; this is not a total-attendance milestone system.
2. Members register for the event. Registration alone does not award a badge. The registration confirmation shows a QR entry pass and a PNG download; signed-in members can reopen their pass under `/student/#events`. Visitors should save their pass at registration because email delivery is not configured.
3. Once the event has started, scan the pass or enter its code in Admin → Registrations. Check the attendee and event shown, then confirm check-in. The corresponding badge appears immediately in the member’s open collection and can be downloaded. A guest registration earns its badge after the attendee signs in with a verified matching email address.
4. Correcting attendance removes that automatic award. Repeated confirmations do not create duplicates. Additional custom badges can still be assigned manually.

After confirmed attendance, the member can rate the event from 1–5 and optionally say what worked well and what to improve under `/student/#events`. They can edit their response. The form explains that their name and response are visible to administrators in Admin → Registrations. Correcting attendance removes the response.

No official event titles or dates have been invented. Until assigned, badge details say “Event to be announced.” Names for the supplied artwork can be changed in `lib/badges.js`.

## Apple and Google sign-in

The local site is connected to Firebase project `sgu-adc-member-portal-20261001` and its web app. Google sign-in is enabled in Firebase Authentication, with `127.0.0.1` and `localhost` authorized for local testing. Open the site at `http://127.0.0.1:3001/join/` and choose **Continue with Google**. The browser completes Firebase Google sign-in, then sends a Firebase ID token to the local Express server. The server verifies its signature, project, issuer, expiry, provider and verified email before creating a member session. Registration and badge records remain in the local SQLite database; no site or database was hosted.

The Firebase web configuration is stored in the ignored local `.env`; `.env.example` lists the required variable names. The local `firebase.json` contains the Google provider configuration and the account's support email, so it is ignored by git; `firebase.auth.example.json` is a shareable template. `.firebaserc` selects the new project. `firebase deploy --only auth` changes Authentication configuration only and does not publish the website. **Preview locally** remains a separate development account. Google sign-in has been verified up to Google's account selection page; a full live sign-in still needs a person to complete Google's account prompt. See [Firebase's Google sign-in guide](https://firebase.google.com/docs/auth/web/google-signin) and [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

The previous direct Google OAuth flow remains available if Firebase configuration is absent and `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` are supplied instead. Firebase takes precedence when both are configured.

For **Apple**, a registered HTTPS domain and Apple Developer configuration are required; plain localhost cannot complete Apple’s web flow. Set `PUBLIC_ORIGIN`, `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY_PATH`. Register `${PUBLIC_ORIGIN}/api/auth/apple/callback` as the return URL. See [Apple’s configuration guide](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/). The callback validates state, browser binding, nonce, issuer, audience, signature and token expiry.

Member identities and sessions persist locally. Apple and Google accounts remain separate even when they share an email address. Automated tests use signed test tokens and simulated token endpoints. `LOCAL_PREVIEW` is forcibly disabled under `NODE_ENV=production`; production session cookies require HTTPS.

The fully functional app currently remains local only; the Firebase Hosting copy serves static pages without the API. Open local pages receive event, registration, attendance, badge, resource, and sign-in changes through the local server's live event stream. Event availability also refreshes once a minute as start times pass. Keep the local server running for updates across tabs and browsers on this computer. Before a public release, configure and test real sign-in, supply confirmed club/team information, choose persistent hosting and backups, and provide the club’s privacy/retention process. Email delivery and signed Apple Wallet passes are not configured; the UI does not claim those actions occurred. Google Fonts and existing external photography/social links still require internet access.

## Full-site hosting preparation

`render.yaml` describes a single Node web service with a persistent disk for SQLite and uploaded banners. It serves both the pages and `/api/*` from one HTTPS origin, so member/admin session cookies and live updates keep the local behavior. The blueprint uses one paid service; do not use a free ephemeral filesystem for member data. In Render, set the prompted `ADMIN_PASSWORD_HASH` and Firebase web-app configuration before deployment. `PUBLIC_ORIGIN` is inferred from Render's `RENDER_EXTERNAL_URL`; `NODE_ENV=production` disables the local preview account. Add the final `onrender.com` domain to Firebase Authentication's authorized domains and perform a real Google sign-in test. A separate Apple Developer web setup remains necessary for Apple sign-in.

Do not redirect the Firebase Hosting URL until the Render URL passes `npm run check:deployment -- https://YOUR-SERVICE.onrender.com`, including its API endpoints and a real registration/check-in test. The current Firebase Hosting deployment serves static files only, so its `/api/*` requests return 404. Keep backups of the Render disk and uploaded banners; the included disk is persistent but is not a substitute for an independent backup.

## Verification

```sh
npm test
npm run build
npm audit
```

Tests cover OAuth and Firebase token verification, authorization, origin checks, durable sessions, event registration and concurrent capacity limits, duplicate prevention, attendance, badge assignment, resource validation and local-preview isolation. Browser checks cover login, event creation/editing, live updates to another session, registration, and desktop/mobile rendering. Browser screenshots live under `output/playwright/` (not committed).
