# WatchParty MVP

Project root: `/home/onyx/Projects/watchparty/`. All project files, dependencies, tests and generated output must remain inside this dedicated subfolder. Each new project must use its own named subfolder of `/home/onyx/Projects/`, never the home or Projects parent directory.

Original dark, responsive watch-party experience inspired by watchparty.me.
Home accepts a display name and creates rooms or joins by code/invite URL.
Rooms show a YouTube/HTML5 player, invite copy, participants, host badge and chat.
Host alone loads media and plays, pauses or seeks. Server timestamps determine
late-join position; clock-offset estimation and local drift correction never emit controls.
Disconnects promote the next participant; reconnecting clients rejoin and resynchronize.
Validate codes, names, messages, media URLs and runtime event payloads.
Use React/Vite, Express/Socket.IO and a shared TypeScript package with npm workspaces.
Include /healthz, bounded in-memory rooms, strict TS, ESLint, unit and two-client
integration tests, environment example, exact README commands, multi-stage Docker and Compose.
Acceptance: npm run lint, npm run typecheck, npm test and npm run build pass.
No authentication, databases, ORMs, Redux, component libraries. Subtle CSS-only effects must respect reduced motion.

## Deployment-ready UI pass

Use Rose Pine colors; the current typography hierarchy is defined in DESIGN.md. Home uses a large
"Same movie. Same second." hero, a ticket join form and a CRT test card.
Room uses a compact header, dominant video bezel, source bar, real Chat/People
tabs, responsive 390px layout and a fixed statusline with measured sync, drift,
RTT, playback revision, host and count. Missing metrics display `--`.
Debounce room lookup 300ms, cancel stale HTTP requests and show waiting,
tuning, room found or no signal. Keep existing socket event contracts and sync math.
Shortcuts: Space playback, F fullscreen, / chat and C invite; ignore typing.
Support effects toggle and reduced motion; scanlines cover only the screen.
Harden CSP, rate limits, shutdown and logs. Include 404, product metadata,
favicon, CI, Docker, Render blueprint and deployment guide. Do not deploy.

## Collaboration pass

Add audio-only opt-in WebRTC mesh (8 simultaneous voice participants), bounded
Socket.IO signaling/presence, ephemeral reactions and validated HTTPS image chat.
Preserve authoritative playback. J/K/L/Space/F/X/M/slash/C are typing-aware;
first mic capture requires its explicit button click. Keep square minimal UI,
quiet empty chat, scroll-aware unread counts and secondary sync diagnostics.
No deployment or camera access. Reaction symbols explicitly requested in this
pass are the sole exception to the no-emoji content convention.

## Realtime polish

CSS-only optimistic reactions animate for 1.4–1.8s, cap at twelve, deduplicate
server echoes and use a 600ms static fallback. Keep reactions out of history.
Audio RMS uses hysteresis at about 17Hz, with transition-only UI updates and full
cleanup. Received audio uses conservative compressor/unity gain. Remote speech
ducks movie volume to 60% with 100ms attack/380ms release and exact base restoration;
keep mute/zero intact and persist its local preference. No playback events change.
Provide a native debounced GIPHY picker through bounded server-only API routes,
normalization, short cache, attribution and no-key graceful fallback. No SDK or
animation dependency. Provider approval/key and physical TURN checks precede release.

## Polish verification

Keep received voice peer-to-peer; no capture DSP beyond browser constraints.
No GIPHY secret in the bundle. The requested proxy/cache requires provider approval
before public use under its current guidance. Local keyless mode must remain useful.


## Shared-room UX pass

Preserve all playback, identity, permissions, signaling and deployment contracts.
Add stable name avatars, measured RMS rings, three-speaker video overlay with a
450ms silence release, compact plain-text auto-growing composer, emoji-only messages,
source editor collapse and normal/debug statusline modes. All fonts are local:
Instrument Serif display, IBM Plex Sans Variable UI, JetBrains Mono metadata.
GIPHY routes validate optional limits, report bounded redacted upstream failures,
handle empty/malformed/throttled/auth responses and keep an honest no-key state.
No deployment, paid service, account, auth, database or animation framework is added.
