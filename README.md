# Flickfolk

**Same movie. Same second.**

A shared watch room with synchronized YouTube/direct video playback, peer-to-peer
voice, live reactions and collaborative chat. The Warm Dusk interface uses local
Figtree/JetBrains Mono fonts, coral controls and deterministic initials avatars.
No accounts, camera, database or paid service are required for the core app.

[Source](https://github.com/kmanisk/flickfolk) · [Deployment guide](DEPLOY.md) · [Design](DESIGN.md)

## Run locally

Requires Node 22.12+ (24 recommended) and npm. Run from this project directory:

```bash
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**. The Vite server proxies the API and Socket.IO to
port 3001. Open a second browser/tab, create a room and paste its invite into the
other browser. Use different display names. Microphones start off.

For a production build served by Express:

```bash
npm run build
NODE_ENV=production npm start
```

Open **http://localhost:3001**. `PORT` and `HOST` are configurable. Both npm launch
paths load the project-root `.env`; restart after changing server configuration.

```bash
docker compose up --build
```

Docker runs as a non-root user and checks `/healthz`. This setup has one process,
in-memory rooms and no persistence: restarting loses rooms, messages and invites.

## What works

- Create/join by six-character code or invite URL, with debounced room lookup.
- Host-authoritative play, pause and seek for YouTube and direct `.mp4`/`.webm` URLs.
- Late joins, reconnect identity where Socket.IO recovery is available, host promotion.
- Audio-only WebRTC voice with actual RMS speaking rings and a fullscreen speaker overlay.
- Six ephemeral reactions; optimistic floats reconcile server echoes and cap at 30 nodes.
- Grouped text/GIF chat, large emoji-only messages, plain-text multiline composer and unread counts.
- Viewport-bound desktop rooms, mobile layouts, collapsible sidebar and stage fullscreen.
- Real sync/drift/RTT telemetry. No fake metrics, participants, movie metadata or queues.

GIF search is optional. With no configured working GIPHY integration its button is
hidden. Validated direct image/GIF links remain available under the emoji picker’s
**Link** action. Reactions are separate from messages and never enter chat history.

## Screenshots

<!-- Replace these captures when the visual reference is supplied or the UI changes. -->
![Flickfolk Home at 1366×768](docs/screenshots/home-1366.png)
![Flickfolk Room at 1366×768](docs/screenshots/room-1366.png)
![Flickfolk Room at 390×844](docs/screenshots/room-390.png)

The requested `design/refs/room.png` was absent during implementation. These renders
follow the written Warm Dusk brief; they do not claim a pixel match to an unseen image.

## Architecture

| Workspace | Responsibility |
| --- | --- |
| `apps/client` | React/Vite, native UI, lazy Room/voice/GIF chunks and provider adapters |
| `apps/server` | Express, Socket.IO, authoritative room state, validation, signaling and limits |
| `packages/shared` | Typed events, brand, validation, permissions, clock/correction math |

`packages/shared/src/brand.ts` is the product brand source. Existing `afterglow-*`
local-storage keys and `@watchparty/*` internal workspace names remain compatible.
The server serves the built client in production. Hashed assets have one-year
immutable caching; HTML is revalidated. Compression and Helmet CSP are enabled.
The UI uses Lucide individual imports and self-hosted Fontsource latin fonts.

### Sync algorithm

The server owns position, timestamp, playing state and revision; the wire protocol is preserved.
Five initial clock pings 200ms apart select the lowest-RTT sample.
Three every 30s refresh offset with a .3 EMA, rejecting samples above twice the best RTT.
Late join, foreground resume and reconnect align to the expected current timeline.
Visible playing clients measure drift at 1Hz, skipping buffering/seeking players.
Files nudge by 5% after two bad samples; active nudges stop below 50ms.
Normal file deadband is 120ms; drift above 2s seeks. YouTube seeks above 600ms, at most every 4s.
Programmatic actions have a 600ms echo guard; rate changes never emit commands.
Host commands are clamped and throttled, with final scrubs emitted on release.
Autoplay denial waits for a gesture, then realigns to the current timestamp.
Only playback is versioned: stale playback is dropped without discarding chat/presence.
Telemetry is an external store publishing at most 4Hz; playback labels use DOM refs.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the engine boundaries.

## Voice and privacy

Voice implementation loads after the first mic click. Browser microphone permission
is explicit; permission/network failure produces a dismissible toast and leaves
video/chat working. `echoCancellation`, `noiseSuppression` and `autoGainControl`
remain browser-managed. No camera is requested; local microphone audio is not played
back to its sender. Use the intended system recording device in browser settings.

Socket.IO carries offer/answer/ICE signaling and mic presence only. Audio travels
peer-to-peer in a mesh capped at eight voice participants; normal rooms allow 24.
Remote audio uses a conservative native compressor and unity gain. RMS meters sample
about 17Hz with hysteresis; CSS ring strength updates without React per-sample renders.

Remote speech ducks movie volume to 60% of the user's base volume, with 100ms attack
and 380ms release. It restores exactly, preserves mute/zero and can be disabled in
Settings. YouTube volume uses its iframe API, never a cross-origin Web Audio graph.

Set optional `STUN_URLS`, `TURN_URLS`, `TURN_USERNAME`, `TURN_PASSWORD` in `.env`.
Public Google STUN is the default; TURN is not provisioned. Restrictive networks
need a relay. Browser-delivered TURN credentials are not secrets from that browser:
use restricted, rotatable or provider-issued short-lived credentials in production.
Physical-device, echo-quality and cross-network TURN tests remain necessary. Phone
microphones require HTTPS; a plain LAN-IP HTTP origin is not a secure context.

## Optional GIF provider

Set **server-only** `GIPHY_API_KEY`, never a `VITE_` variable, and restart.
`/api/gifs/status` exposes only availability. The button appears after a successful
normalized trending check; no-key mode stays quiet and chat remains fully usable.
Search is debounced/cancellable, lazy previews retain provider URLs, and the picker
shows official attribution. `/api/gifs/trending` and `/api/gifs/search?q=...&limit=...`
return six normalized fields, with bounded results, validation, rate limits and a
short cache. Provider failures are logged with bounded credential-redacted bodies.

GIPHY's current [integration guidance](https://developers.giphy.com/docs/) restricts
API proxying/caching. The requested server-only integration needs provider approval
before public use. Tests mock provider success/failure; a live key has not been supplied.
No arbitrary user URL is fetched/proxied by this server. Inline image chat allows
validated HTTPS hosts/file shapes only and renders no user HTML.

## Controls

| Key | Action |
| --- | --- |
| Space / K | Host play/pause |
| J / L | Host seek −10s / +10s |
| F / Escape | Stage fullscreen / exit |
| X | Effects |
| M | Mic mute after initial permission click |
| / | Focus chat |
| C | Copy invite |
| T | Toggle sidebar |

Shortcuts ignore inputs, textareas and contenteditable. Enter sends; Shift+Enter
inserts a newline. Composer content is limited to 500 characters. Playback shortcuts
use the same host/echo-guard path as the player controls. Settings contains ducking
and effects; detailed engine version/corrections are opt-in with `?debug=1`.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Vitest covers permissions, validation, clock/correction policy, echo guards, throttling,
voice signaling/presence, reactions and normalized GIF API responses. Playwright uses
real Socket.IO clients and media playback; synthetic audio passes through actual
WebRTC to verify RMS, normalization-path setup, ducking, mute/zero and cleanup.
Synthetic tests do not certify physical microphones or relay infrastructure.
GitHub Actions runs checks and a Docker build. Nothing is deployed automatically.

## Deployment and scaling

Follow [DEPLOY.md](DEPLOY.md). Render's blueprint is one Node web service, uses `PORT`
and serves both HTTP and Socket.IO behind HTTPS. No services or credentials have
been provisioned. Finish phone/laptop, YouTube, late-join and host disconnect/reconnect
checks before deployment. Add the approved `public/og.png` sharing asset and reconcile
the missing locked visual reference.

For multiple instances, a Socket.IO Redis adapter can distribute broadcasts, but
it does **not** make this in-memory authoritative room state shared or persistent.
A scaling design also needs consistent room ownership/state, coordinated limits,
recovery semantics and sticky routing for polling. Do not enable multiple instances
with this MVP or infer production scale from small-room local tests.
