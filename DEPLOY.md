# Deploying Flickfolk

Preparation only. This pass creates/pushes GitHub source; it does not deploy.
Repository: https://github.com/kmanisk/flickfolk

## Local production check

Requires Node 22.12+ (24 recommended), npm, and a project-root terminal:

```bash
npm ci
cp .env.example .env
npm run lint
npm run typecheck
npm test
npm run build
NODE_ENV=production npm start
```

Open http://localhost:3001. Check `/healthz`. Open an invite in a second browser and
verify play/pause/seek, late join and host disconnect/reconnect. For containers:

```bash
docker compose up --build
```

The multi-stage image runs non-root, exposes 3001 and includes a health check.
`PORT` controls the process listener; Compose maps `${PORT:-3001}` to container 3001.
Docker has not been claimed tested if no local Docker engine is available; the CI
Docker job must pass before release. Never put `.env`, keys or tokens in Git.

## Render setup (when deployment is authorized)

1. Connect the public `kmanisk/flickfolk` repository in Render.
2. Create a Blueprint from `render.yaml`, or a single Node Web Service named `flickfolk`.
3. Root Directory: repository root. Build: `npm ci --include=dev && npm run build`.
4. Start: `npm start`; Node 24; health check: `/healthz`; exactly one instance.
5. Set `NODE_ENV=production`, `HOST=0.0.0.0`. Render supplies `PORT`; do not hardcode it.
6. Keep automatic deployment off until physical-device and release checks are complete.
7. Use the Render HTTPS URL for client and Socket.IO. The client uses the same origin.

The server supports HTTP polling/WebSocket upgrades behind a reverse proxy, serves
the built SPA and has bounded input/rate limits, Helmet CSP, structured logs and
SIGTERM cleanup. Hashed assets cache immutable for a year; HTML uses no-cache.
No auth/database exists. Rooms/chat are process memory: restarting deletes them.
Do not add replicas without a separate authoritative state/room-ownership design.
A Redis Socket.IO adapter alone does not share the room maps or persistence.

## Optional voice configuration

Voice remains peer-to-peer WebRTC audio, maximum eight voice participants; Socket.IO
is signaling/presence only. No camera or server audio transport has been added.
Mic starts off and only the first explicit click loads voice and requests capture.
Permission-denied or network failures show a toast, never a video/chat error screen.
Browsers need HTTPS or localhost for capture; a plain phone LAN-IP URL is insufficient.

Set optional comma-separated `STUN_URLS`, `TURN_URLS`, `TURN_USERNAME`, `TURN_PASSWORD`.
The default is public Google STUN. Blank STUN_URLS disables it. TURN credentials
are browser-visible by design: use restricted/rotatable or short-lived credentials.
No TURN account/service has been created. Test relay-only connectivity on physical
devices on different networks; synthetic Chromium RTP does not establish NAT coverage.

Remote voice uses conservative browser-native compression and unity gain. Check
actual speaking rings/overlays on both devices. Movie ducking defaults on, persists
locally, targets 60%, attacks in 100ms and restores over 380ms. Verify exact chosen
volume restoration, zero/mute, multiple speakers and YouTube API volume behavior.
Select the intended internal/virtual recording input; do not change system routing.

## Optional GIPHY integration

Set `GIPHY_API_KEY` only on the server, never under `VITE_`, and restart. Both local
npm launch paths load project-root `.env`. No-key mode hides the search button;
validated image Link fallback and all other room features stay available.
The UI additionally checks normalized trending success before exposing search.

The user-requested server API proxy and short media-URL cache require approval under
GIPHY's [current guidance](https://developers.giphy.com/docs/). Do not assume a key
alone authorizes public proxy/cache usage. Official attribution is included.
Verify real-key trending/search, 401/403, empty results, 429 and quota before release.
Tests mock upstream API behavior; no live key/account has been supplied in this pass.
`gif_provider_error` logs status and a bounded credential-redacted body; restrict
log access. The server does not fetch arbitrary user image links.

## Provider configuration and checks

No media-provider API key is required. Twitch uses the current browser hostname for
its `parent`; serve through the intended public hostname and HTTPS. The CSP allows
only required official SDK/frame hosts. Spotify's same-origin bridge has a separate
policy for its SDK/CDN and required eval; the main document never enables eval. Serve
`spotify-bridge.html` through Express so its scoped headers apply. Do not replace
these policies with wildcard script sources. Check real public sources after choosing
a deployment target; ads, region, browser policy and provider account restrictions
are outside Flickfolk's control. Test Twitch VOD/live separately, SoundCloud playlist
late joins, Spotify episodes versus limited music, Kick's local-only embed and audio
codec support. SDK mocks certify adapter behavior, not live provider availability.
Flickfolk itself stays signup-free: no Supabase keys, OAuth or database setup.

## Post-deploy verification

- `/healthz` returns 200 and the deployment reaches its healthy state.
- HTTP redirects to HTTPS at the edge; Socket.IO upgrades without mixed content.
- Home primary action is visible at 1366×768 and 390×844.
- Room fits 1366×768 and phone viewport without page scroll/hidden controls.
- Two tabs and phone/laptop synchronize play/pause/seek and late join.
- YouTube embeds under CSP; direct HTTPS media loads; unavailable media fails clearly.
- Guests cannot control host playback; host leave promotes someone; reconnect resyncs.
- Chat text/paste remain inert; GIF images are constrained; reactions stay out of history.
- Fullscreen retains controls/reactions/speakers; typing suppresses media shortcuts.
- Actual RMS, mute states and disconnect cleanup work; ducking restores exact volume.
- Fonts, favicon, title/OG description, asset cache headers and graceful shutdown work.
- Logs contain no application chat, names, invite codes, headers or credentials.

## Remaining before deployment

- Supply/reconcile the missing `design/refs/room.png`; no pixel-match claim is made.
- Add an approved 1200×630 `apps/client/public/og.png`; metadata currently references it.
- Validate Docker/CI and the physical-device/TURN checks above.
- Obtain GIPHY key/approval only if enabling optional search publicly.
- Render deployment is cancelled for the current polish pass. Do not provision or deploy services; choose a non-Render target in a future deployment task.
