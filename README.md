# Apple Developer Club SGU

Live site: https://appledeveloperacademysgu.web.app

The public website, member portal, and admin portal use Firebase Hosting, Authentication, and Cloud Firestore. The original UI and fonts are retained. Firestore listeners update open pages when event, registration, attendance, badge, and resource data changes.

## Live setup

- Admin: open `/admin/login` and sign in with the verified `developerclubapple@gmail.com` email and its Firebase password. Use **Set or reset password** to receive a setup link at that address. Firestore rules restrict admin writes to a verified password session for this email. The admin Google sign-in button has been removed.
- Members: open `/join/` and sign in with Google. A visitor can also register for an upcoming event without signing in; Firebase creates an anonymous identity for that registration. Signing in later with a verified matching Google email links an unclaimed guest registration to the member account.
- An event registration is saved in Firestore, updates the admin portal and event capacity, and shows a downloadable QR pass. The pass is an entry code, not an Apple Wallet pass. No email is sent; visitors should save it when registering.
- Admins create events, choose an event's completion badge, manage resources, review registrations and feedback, and confirm attendance. Attendance, not registration, awards an event badge. The 10 supplied badge images start locked. Events and registrations start empty.
- Event banners are compressed and stored with event documents. Because the current Firebase project uses the no-card Spark plan, this is limited to a small image; larger media needs a storage service or billing-enabled Cloud Storage.

Google sign-in is enabled. Apple web sign-in still needs an Apple Developer service ID, domain verification, and provider configuration; the hosted UI does not offer an inactive Apple button. Real club leadership details have not been supplied, so the Team page retains labelled placeholders. No sample registrations or event dates are published.

## Build and deploy

Use Node.js 22.13 or newer.

```sh
npm install
npm test
npm run build
firebase deploy --only firestore:rules,hosting --project adc-sgu-portal-2026 --config firebase.deploy.json
npm run check:deployment -- https://appledeveloperacademysgu.web.app
```

The Firebase web app identifiers in `src/firebase-config.js` are public identifiers; access control is in `firestore.rules`. The Firebase CLI must be authenticated to the project before deployment. To test the Firestore rules locally, start the Firestore and Auth emulators with `firebase emulators:start --only firestore,auth --config firebase.emulator.json`, then run `npm run test:rules`. Java is required for the Firestore emulator.

The old Express/SQLite implementation remains available for local development and as an optional separately hosted backend. Run `npm run setup:local && npm run build && npm start` and open `http://127.0.0.1:3001`. Local admin credentials are written to ignored `.local-access.txt`. Hosted `*.web.app` and `*.firebaseapp.com` pages use Firestore directly; localhost uses Express/SQLite. `render.yaml` is retained as an optional paid Render deployment path and is not used by the live site.

## Privacy and limits

Firestore rules protect member records and admin writes. Guest registrations use Firebase anonymous accounts; members can read their own registrations and feedback. The site does not send email or issue signed Wallet/NFC passes. Firebase Spark quotas apply; monitor usage before a large event. Back up Firestore data and establish the club's retention and privacy policy before broad public launch.
