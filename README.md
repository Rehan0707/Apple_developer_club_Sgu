# Apple Developer Club SGU

Responsive club website built with Vite, plain HTML/CSS/JavaScript, and an Express server for Sign in with Apple.

## Run locally

Requires Node.js 22.9+.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to the server at port 3001.

```sh
npm run build
npm test
npm start
```

The production build is served on http://127.0.0.1:3001. No external deployment has been performed.

## Pages and content

- `/`: club introduction, current published events, resources entry point, and FAQ.
- `/resources/`: a focused library linking to the official Apple Developer video channel, documentation, Human Interface Guidelines, and Swift Playgrounds.
- `/events/`: published future events loaded from the server-side store.
- `/register/?event=<event-id>`: a validated registration form for the selected event; confirmed records are saved to local JSON and mirrored to Sheets when configured.
- `/join/`: Apple authentication availability and club contact link. No mock sign-in path exists.
- `/admin/` and `/student/`: authenticated event, member, badge, resource, registration, and profile views.
- `public/images/`: the two original user-supplied logos, copied without image modifications.
- `src/style.css`: shared dark visual system based on the supplied Apple screenshots, with CSS-framed original club branding.

Event listings and registration details are no longer hard-coded: public pages read the published event records and show an explicit empty state when none are available. The home page no longer presents unsupported success stories or member claims. Event images are optional and are only shown when an admin adds a local image path. Original logos are preserved.

The club's Instagram could not be publicly fetched. Copy uses only the confirmed club name and link; no team members, participation figures, or past events are invented.

## Admin Portal sign-in

The admin login is verified by Express, not by browser code. Configure `ADMIN_USERNAME` and a scrypt-encoded `ADMIN_PASSWORD_HASH` in the ignored local `.env` file or the deployment's server-side secret settings. Never put a raw password in HTML, JavaScript, or a `VITE_` variable. The local admin account is not committed or automatically deployed; production must receive its own server-side settings.

The hash format is `scrypt$<32 hex characters of salt>$<128 hex characters of derived key>`. The login route issues an HttpOnly, Secure, SameSite=Lax session cookie and rate-limits repeated failures.

## Website data and Google Sheets

Events, registrations, members, badges, and resources use the server-side JSON store at `data/db.json` for the local preview. Public event registration validates on the server and is visible in the protected Admin → Registrations page. When Google Sheets is configured, the server mirrors these records into the `Events`, `Registrations`, `Members`, `Resources`, `Badges`, and `BadgeAwards` tabs; browser code never receives Google credentials. The Admin Dashboard reports whether the spreadsheet connection is actually reachable.

The HeyClicky Sheets provider is an agent-side connector and is not available to unauthenticated website visitors or this runtime. For automatic website submissions, configure a website-owned Google service account: create/select the workbook, enable the Google Sheets API, create a service-account JSON key, and share the workbook with that service account as an Editor. Put the spreadsheet ID and the key file path in the ignored local `.env` as `GOOGLE_SPREADSHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`, then restart the server. Never commit the key file or paste it into frontend code. The server creates missing tabs and appends missing schema headers without replacing existing columns.

## Enable Sign in with Apple

Follow [Apple's web configuration guide](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/).

The club needs an Apple Developer account with access to configure:

1. A primary App ID enabled for Sign in with Apple.
2. A Services ID associated with that App ID; use it as `APPLE_CLIENT_ID`.
3. Its Developer Team ID (`APPLE_TEAM_ID`).
4. A Sign in with Apple key, its Key ID (`APPLE_KEY_ID`), and the downloaded `.p8` private key.
5. A registered HTTPS domain and exact return URL: `https://YOUR-DOMAIN/api/auth/apple/callback`.

Copy `.env.example` to `.env` locally and configure these server-only values. `PUBLIC_ORIGIN` is the HTTPS origin without a path. `APPLE_PRIVATE_KEY_PATH` points to the protected `.p8` file outside public assets. Do not paste private keys into chat or put them in client-side variables. `.env` and `.p8` files are ignored by git.

The implementation uses Apple's authorization endpoint, a one-time state bound to a secure HttpOnly browser cookie, nonce verification, server-side code exchange, and issuer/audience/signature/expiry validation against Apple's public keys. Sign-in redirects to Apple; this site never asks for Apple passwords.

Without configuration the page reports sign-in unavailable. Live Apple authentication cannot be tested on this unconfigured localhost preview. Tests cover unavailable and invalid requests, state/cookie binding, cancellation, replay rejection, and sign-out origin protection; they do not substitute for an end-to-end Apple test.

This Apple-authentication path remains an identity scaffold, not confirmation of club membership. Verified sessions expire after one hour and are in memory; restarting the server clears them. Public event registration is separate and is persisted by the event API. Before using Apple sign-in as a membership intake, add the club's approved membership process, durable session storage, privacy and deletion handling, and production hosting with HTTPS. Keep the API and frontend on the same origin, and avoid logging callback bodies or tokens.
# Apple_developer_club_Sgu
