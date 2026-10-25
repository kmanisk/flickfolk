# Deployment preparation — not deployed

The app is prepared for a **single Node web service** on Render. This pass does
not create services, push a repository, require secrets or trigger deployment.

## Local production check

From the project root:

```sh
cd /home/onyx/Projects/watchparty
npm ci
npm run lint
npm run typecheck
npm test
npm run build
NODE_ENV=production npm start
```

Test **http://localhost:3001** and **http://localhost:3001/healthz**.
No `.env` file or credential is required. `PORT` defaults to 3001 and `HOST` to
0.0.0.0. A local `.env` may supply these values; an explicitly exported environment
variable takes precedence. The client uses the current origin for HTTP and sockets.

Before deployment, test all four:

1. **Two browser tabs:** create/join, load a video, host play/pause/seek, late join,
   chat, guest controls disabled, invite copy and real diagnostics.
2. **Phone + laptop:** use `http://<laptop-LAN-IP>:3001` on the same network. Clipboard
   APIs may be unavailable over LAN HTTP; the copy failure displays the actual invite.
   Use `/` for chat, Space for host playback, F for fullscreen, C for copy on a keyboard.
3. **YouTube playback:** use an embeddable public video. A browser may ask you to
   enable sound locally. Also try direct HTTPS MP4/WebM and an unavailable URL.
4. **Host disconnect/reconnect:** leave or interrupt the host's network. Another
   participant becomes host; the returning participant rejoins without taking host
   back. Short unexpected transport outages may recover the socket ID within 30s.
   Refreshes, intentional leave/disconnect, server restart and expired recovery do not
   preserve a socket ID. If everyone leaves, the room is deleted and a new one is needed.

Browser emulation does not replace a physical phone/laptop network test.

## Docker locally

```sh
docker compose up --build -d
curl --fail http://localhost:3001/healthz
docker compose ps
docker compose down
```

The multi-stage image uses Node 24, runs as non-root `node`, serves the built Vite
app through Express and includes an environment-aware health check. Compose forwards
port 3001 and permits a 15-second graceful stop; the application deadline is 10 seconds.
The Docker build context is allowlisted and excludes local secrets, backups and tests.
Docker was not available in the preparation environment: the image has not been built
or run here. GitHub Actions builds it and checks HTTP health plus the runtime user.

## Render setup — perform in the deployment session

1. Create a Git repository **from this project directory only** and push it to your
   GitHub/GitLab/Bitbucket account. There is currently no Git repository or remote in
   this project. Exclude `.env`, node_modules, backups and test output. Never initialize
   or upload the home directory or Projects parent.
2. Run CI and inspect its results. It installs, audits, lints, typechecks, tests, builds, runs
   Chromium acceptance tests, builds Docker and checks container health/non-root use.
3. In Render, choose **New → Blueprint**, connect the repository and select
   `render.yaml`. Inspect the proposed **one** web service named `afterglow`.
   The file uses `runtime: node`, one instance, `/healthz`, and manual deploys.
   Review the compute plan, price and region before applying; no plan or region is
   hardcoded. Do not add a database, worker or other service.
4. The project must be at the repository root. If you deliberately retain a larger
   monorepo, set Render's Root Directory to the relative WatchParty project folder
   and ensure the Blueprint path points to this file; do not upload unrelated files.
5. Confirm these values in the service settings:

   | Setting       | Value                                              |
   | ------------- | -------------------------------------------------- |
   | Runtime       | Node                                               |
   | Node version  | 24 (`NODE_VERSION`)                                |
   | Build command | `npm ci --include=dev && npm run build`            |
   | Start command | `npm start`                                        |
   | Health check  | `/healthz`                                         |
   | Instances     | 1                                                  |
   | `NODE_ENV`    | `production`                                       |
   | `HOST`        | `0.0.0.0`                                          |
   | `TRUST_PROXY` | `1`                                                |
   | `PORT`        | Render-provided environment value; do not override |

   No credentials are required by the application. `CLIENT_ORIGIN` is unnecessary
   for this same-origin deployment. Only set it for an intentional extra browser
   origin; it is not a list. `TRUST_PROXY=1` trusts exactly one reverse-proxy hop;
   do not expose such a configuration directly behind arbitrary forwarded headers.

6. **Only in a separately authorized deployment session:** apply the reviewed
   Blueprint, then monitor its build and health. Creating a Blueprint starts its
   initial deployment even though subsequent automatic deploys are disabled.

Current sources: [Blueprint specification](https://render.com/docs/blueprint-spec),
[Render WebSockets](https://render.com/docs/websocket),
[Socket.IO recovery](https://socket.io/docs/v4/connection-state-recovery/).
The prepared YAML passes the downloaded current Render JSON Schema. Render CLI/account
validation has not been run; the CLI is unavailable and no cloud access was requested.

## HTTPS and reverse proxy

One Express HTTP server handles the SPA, API, health endpoint and Socket.IO. The
browser's current HTTPS origin is used automatically, so sockets connect with WSS
and fall back to same-origin long polling. Render supports WebSocket upgrades on
the web service's port. A custom proxy must forward `/socket.io/` HTTP requests and
WebSocket upgrades to the same process. Do not add cross-origin frontend hosting
or multiple replicas to this in-memory MVP.

Helmet allows the YouTube API script and iframe, HTTPS media, local fonts and
WS/WSS connections. Production blocks insecure HTTP media. Browser policy, codecs,
provider embedding restrictions and unavailable sources can prevent playback; the
player displays an error instead of treating unavailable media as synchronized.

## Post-deploy checks — after authorization

- Request `https://<service>.onrender.com/healthz`: expect HTTP 200 and `{"status":"ok"}`.
- Open `/`, `/room/<actual-code>` directly, and an unknown path: the latter must return
  HTTP 404 and show “No signal.” Verify favicon, title, description and font loading.
- Repeat the four-device/participant checks above over HTTPS. Inspect network for
  successful Socket.IO connection/upgrade and the console for CSP or playback errors.
- Verify lookup returns 200 for the real code, 404 for a missing valid code and 400
  for malformed input. It must not disclose names, chat or media.
- Observe measured RTT, drift and playback revision; missing measurements show `--`.
- Review JSON logs for startup, requests and shutdown. Names, codes, chat, media URLs,
  headers and tokens are deliberately not logged.
- Restart only when ready to lose all in-memory rooms; confirm health recovers and
  old room invites report missing. Keep exactly one service instance.

## Preparation verification

Lint, strict typecheck, 54 unit/integration tests and sixteen production-mode Chromium
tests passed. The dependency audit reports zero vulnerabilities after upgrading the
test runner. The original server playback command block is unchanged. A separate
live production-browser check initialized the YouTube iframe API and observed video
time advancing. Production SIGTERM completed gracefully. Desktop 1440px and mobile
390px renders were inspected; screenshots are included under `docs/screenshots/`.
These checks do not certify a physical phone/network or substitute for Docker/CI.

## Remaining release assets and visual review

- Restore Figma access and compare latest Home / 1440, Room / 1440 and Room / 390.
  The connector hit its Starter-plan tool quota; this UI follows the written brief,
  not a verified pixel comparison. Details are in DESIGN.md.
- TODO: add approved 1200×630 `apps/client/public/og.png`. Metadata references `/og.png`
  as requested, but the asset is absent. After a public domain exists, use an absolute
  canonical image URL (and add `og:url`) for dependable link previews.
- Run Docker locally or confirm its CI job before deploying.
- Complete the four manual checks and only then authorize deployment.

## Voice and media-controls deployment notes

No voice service or TURN account has been created. The app uses audio-only WebRTC
mesh with a maximum of eight voice participants; audio does not pass through
Express/Socket.IO. Video/chat still permit up to 24 people. Voice failures must not
be considered video synchronization failures.

Set optional `STUN_URLS`, `TURN_URLS`, `TURN_USERNAME` and `TURN_PASSWORD` in Render's
environment settings (or local `.env` / Compose environment). The default is public
Google STUN, no TURN. Blank `STUN_URLS` disables STUN. TURN URLs accept comma-separated
`turn:`/`turns:` entries; configure username/password together. These runtime values
are delivered to browsers through `/api/rtc-config` with no caching. Use a restricted,
rotatable TURN account; long-lived TURN credentials are not private once delivered
to a browser. For a public release, obtain short-lived credentials from your TURN
provider. Voice and direct-link GIFs require no GIF-search API key; searchable
GIPHY results need the optional server key and approval described below.

Before deploying voice, test **two physical devices on different networks** with
HTTPS and a configured TURN relay, including a relay-only provider/network test.
STUN-only success on a LAN does not establish internet NAT/firewall coverage.
Chromium acceptance tests use fake audio devices, verify inbound audio RTP packets,
explicit initial capture, mute and full track/peer teardown. They do not prove
physical microphone routing, echo quality or TURN infrastructure. Keep the system's
intended internal/virtual recording input selected; this app requests no camera.
Microphone permission is requested only by the first mic button click. M toggles
mute only after that. Reconnect closes capture and requires another explicit click.

Confirm People shows host, mic and speaking state; reactions appear inside the
fullscreen player and disappear without entering history; GIFs stay within the
composer/history limits and never invoke server-side fetching. The GIF domain
allowlist and file-shape checks are in `packages/shared/src/collaboration.ts`.
Check J/K/L host controls, guest restrictions, X/M shortcuts, Enter/Shift+Enter,
scroll-up unread state, and teardown after leave/network loss. The explanatory
sync sentence was removed; only the bottom statusline shows advanced measurements.

## GIPHY and audio polish release gates

- Optional `GIPHY_API_KEY` belongs only in the server environment, never a `VITE_`
  setting. Restart after changing it. No key yields HTTP 503 with a concise unavailable
  state; direct-link GIFs, chat, video and voice remain available. Compose passes the
  optional variable; Render can set it in service environment settings.
- GIPHY's current [API guidance](https://developers.giphy.com/docs/api/#best-practices)
  prohibits API proxying and media-URL caching by default and requires search/trending
  calls from the client. The user-requested server proxy and bounded 30-second result
  cache therefore need provider approval before public use. Do not assume a key
  alone authorizes that topology. The official attribution mark is included.
- Verify real-key trending/search/429 behavior and the provider's production-key
  requirements in the deployment session. This pass uses mocks; no key/account or
  approval is required for the rest of the application and none was created here.
- Voice capture still requests browser permission only after the mic button click.
  Browser echo/noise/AGC constraints remain unchanged. Received audio uses conservative
  native compression and unity gain; no external DSP or server audio relay was added.
- Ducking defaults on and persists locally. Verify 100ms attack, 380ms release,
  exact chosen-volume restoration, mute/zero, YouTube volume, several speakers,
  disconnect cleanup and the off preference on two physical devices. RMS indicators
  use transition-only UI updates with hysteresis, not the mic-enabled flag.
- Keep optional STUN/TURN settings from the voice section. STUN-only and synthetic
  browser tests cannot establish cross-network TURN reliability, acoustic echo or
  physical microphone quality. Those checks and the existing Docker/OG/Figma gates
  still precede deployment. Nothing has been deployed.


## Shared-room UX acceptance

Set `GIPHY_API_KEY` in the server environment or the project-root `.env`, then restart.
Both dev and production npm launch paths load that file; no `VITE_` key is used.
The inspected local setup had neither a `.env` nor a key. A missing key intentionally
returns 503 with `GIF search unavailable`. Provider 401/403 reports key rejection;
429 returns Retry-After, and malformed/network responses return 502. Inspect structured
`gif_provider_error` (bounded, credential-redacted body) or `gif_provider_failure`
logs. Keep these diagnostic logs access-controlled. Verify real-key trending/search
and approved server-proxy/cache usage before public release.

Check local and remote avatars respond to speech, the three-speaker limit and
fullscreen visibility, silence fade and disconnect cleanup. Test the compact composer,
plain-text paste, emoji-only messages, GIF empty/retry/quota states, collapsed source,
and `?debug=1` telemetry. Repeat physical microphone/TURN and acoustic quality checks;
synthetic browser audio cannot establish those. Existing deployment gates still apply.

This UX pass passed 54 unit/integration and 16 production-mode Chromium tests.
Home, idle/loaded Room, Chat, People, GIF states, active speech, fullscreen and mobile
were inspected. A separate browser played the public sample movie without JavaScript
errors or overflow. GIF-provider API tests remain mocked because no key is configured.
