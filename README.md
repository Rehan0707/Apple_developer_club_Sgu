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

- `/`: centered club introduction, Join button, club mission, event previews, and FAQ.
- `/resources/`: a focused library linking to the official Apple Developer video channel, documentation, Human Interface Guidelines, and Swift Playgrounds.
- `/events/`: two clearly labeled layout previews. The user confirmed these are examples, not scheduled events; no dates or registration claims are published.
- `/join/`: Apple authentication availability and club contact link.
- `public/images/`: the two original user-supplied logos, copied without image modifications.
- `src/style.css`: shared dark visual system based on the supplied Apple screenshots, with CSS-framed original club branding.

The user subsequently authorized demo imagery. The homepage uses an explicitly labeled AI-generated workspace image, while event cards use CSS illustrations of a coding workspace and a concept app. Replace these with real club photography when available. Original logos are preserved; CSS frames their central artwork for readable navigation and footer placement. Event previews appear in both the homepage and event page; update both when confirmed details are supplied.

The club's Instagram could not be publicly fetched. Copy uses only the confirmed club name and link; no team members, participation figures, or past events are invented.

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

This is an authentication scaffold, not a membership database. Verified sessions expire after one hour and are in memory; restarting the server clears them. No persistent account, email record, or club membership is created. Before opening registration, add the club's approved membership process, durable data/session storage, privacy and deletion handling, and production hosting with HTTPS. Keep the API and frontend on the same origin, and avoid logging callback bodies or tokens.
# Apple_developer_club_Sgu
