# WatchParty MVP

## Final hiring-assignment milestone (supersedes earlier scope restrictions)

Stable starting main: `30cad8be13830640047d6aa3c3c7ed93b8c70c9d`.
Keep the existing sync/media/voice architecture, signup-free identity and Warm Dusk.
Add shared Host/Moderator/Participant roles and one permission matrix used on both
sides; backend state is authoritative. Exactly one member is Host and matches hostId.
Hosts manage roles/removal; Host/Moderators control media and resolve requests.
Participants request play/pause/seek/source through the same validated mutation
helpers used by direct controls. Requests are reviewer-private, bounded to three
per member, deduplicated by member/action, expire after 60s and on stale playback
revision/source, departure or removal. Removed clients cannot automatically rejoin
within the browser session, but can explicitly join again. Failover favors Moderators;
socket replacement preserves roles and hostId. No accounts or persistent bans.
Add accessible People management, confirmations, request review/results and removal
screens. Preserve chat/reactions/voice. Add stable kinetic Home text, native motion,
hidden-tab cleanup and reduced-motion static tagline. Audit 320px through 1920px.
Gate merge on full local suite and GitHub CI including Docker; update evaluator docs,
push PR, merge normally, deploy the exact main SHA to existing Flickfolk on Render
and verify the live multi-client flows. No new cloud services or data infrastructure.

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


## Prompt A: playback engine

Preserve the existing `clock`, `playback:control` and `room:state` wire protocol.
Use five clock samples 200ms apart at connect, then three every 30s; lowest RTT,
EMA alpha .3 on refresh, reject samples above twice the best known RTT.
Keep pure clock/correction policy in shared and framework-independent adapters and
engine in client/lib. Playing correction runs at 1Hz while visible, skipping
buffer/seeking. File rate nudges are .95/1.05, large drift seeks above 2s;
YouTube seeks only above .6s and at most every 4s. Require two bad measurements.
An active file nudge continues until drift falls below .05s (normal deadband .12s).
Startup/late join, resume and reconnect align once directly to the current timeline.

Only playback has a protocol revision. Drop stale/duplicate playback revisions
inside the engine, while still accepting same-revision participants/chat snapshots;
dropping whole room snapshots would discard working chat/presence without a protocol
change. Protect programmatic adapter events for 600ms; rate changes never emit.
Throttle host commands per action to 150ms, clamp to duration and submit scrubs once
on release. Autoplay denial waits for an explicit gesture instead of retrying.
Expose measured telemetry through an external store, publishing at most 4Hz.
Tests cover clock selection/outliers, policy/hysteresis, stale playback, echo guards,
throttle/clamping, autoplay and simulated convergence plus existing browser sync.
This pass stops after Prompt A. Prompt B and C require separate sessions.

## Flickfolk Warm Dusk final product

This brief supersedes previous product branding and visual requirements. Follow
DESIGN.md Warm Dusk, preserving the working engine and socket/voice protocols.
Use existing workspace paths for shared brand and client UI primitives. Rename only
visible/product metadata; keep existing storage/environment/protocol identifiers.
Desktop room is viewport-bound (56px top/bottom, 360px rail); mobile has a 48px
header, 16:9 stage and bottom composer. Group chat identities, expose configured
GIFs only, retain plain-text safety, and use truthful 4Hz-capped sync telemetry.
Keep the existing reaction protocol; update the six-symbol whitelist and DOM cap to
30, with optimistic deduplication and ephemeral events. No history insertion.
Create public kmanisk/flickfolk, checkpoint pre-warm-dusk, feature branch, merge and
push main/tags after verification. Do not deploy. Missing locked image is documented.

## Final polish

Verify, merge and push feat/ui-polish-3. The latest user instruction cancels Render
deployment; no deployment or new cloud services are part of this pass. Keep the
existing production configuration and single-instance in-memory room architecture.
Preserve the engine, host authority, protocols and WebRTC. Centralize shortcut
filtering: only actual text entry suppresses shortcuts, never buttons or ranges.
Use keyboard-only focus-visible rings; preserve native Enter and range arrows.
Bottom source chip is the only source editor, via host-only URL popover. Remove
stage heading and duplicate topbar connection. Add inviting empty chat/quick sends,
raised reaction dock, restrained volume, aligned Home header and sunset CSS preview.
Validate on desktop/mobile and run the existing tests plus shortcut/focus coverage
before completion. Preserve the existing deployment files without invoking Render.

Future persistence may use Supabase Auth (Google/GitHub) and Postgres for profiles,
room history, preferences and recent links. This is not implemented in this pass.
Keep voice peer-to-peer and sync/chat/reactions on the same Node/Socket.IO server;
no Redis or separate backend. A non-Render deployment target remains unspecified.

## Signup-free media providers

Latest scope explicitly excludes authentication, Supabase and persistence. Keep
local identity and the name/create/join flow. Home has one GitHub icon link, factual
stack footer and no Effects control. Room effects are available only after actual
media readiness and playback have both occurred. Central shortcuts use capture,
suppress only text entry and preserve host authority, Enter and native range arrows.
Add typed capabilities around the existing PlayerAdapter/engine. Preserve HTML5 and
YouTube; accept direct browser-supported audio. Official Twitch API supports VOD
timeline controls and live play/pause without timeline sync; derive parent host.
SoundCloud Widget supports tracks/playlists with provider attribution. Spotify uses
only its iframe API with honest capability/autoplay/account limitations. Kick uses
its official live iframe and exposes no invented controls or timeline metrics.
Validate canonical provider URLs and reject unsupported operations on client/server
before room state changes. Lazy-load provider scripts, keep chat/voice independent,
and add URL/capability/guest/shortcut/provider tests plus all existing checks.
