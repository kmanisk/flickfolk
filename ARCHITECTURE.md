# Sync algorithm

The existing server remains authoritative; clock and playback wire events are unchanged.
`packages/shared/src/sync.ts` selects low-RTT clock samples and computes correction policy.
`playerAdapter.ts` maps native HTML5 and YouTube events into one small playback interface.
`playbackEngine.ts` owns the 1Hz visible/playing correction timer, commands and echo guards.
Startup/resume aligns once; a 1.5s offset cannot converge in 10s from 5% nudging alone.
Thereafter files nudge at .95/1.05 until 50ms; above 2s they seek after two bad measurements.
YouTube uses no fractional rate nudges and limits correction seeks to once per four seconds.
Hidden/buffering/seeking players skip drift samples; visibility/reconnect resample the clock.
Autoplay denial waits for a gesture, then targets the current timestamp instead of stale position.
Only playback has revisions: duplicate playback is dropped without discarding chat/presence.
Host/Moderator commands are clamped and throttled; programmatic events are guarded for 600ms.
`syncStore.ts` exposes truthful snapshots at most 4Hz, read only by the statusline.
Player time/range labels use refs; React renders UI changes, not a playback clock.

## Capability boundaries

`packages/shared/src/media.ts` canonicalizes provider URLs and defines capabilities.
The existing engine accepts the same adapter contract, extended with explicit controls,
readable metrics and sync mode; unsupported commands are rejected before send and on
server receipt. No room/chat/voice events are replaced and no database is introduced.
`providers/external.ts` adapts official Twitch, SoundCloud and Spotify APIs plus the
non-controllable Kick iframe, loading scripts only for a selected source. Source
changes tear down listeners, frames and pending operations. Live/embed sources skip
timeline correction, limited providers do not report perfect sync, and existing
file/YouTube clock, correction, echo guard, authority and reconnect behavior remain.

Spotify's official loader currently requires eval. `/spotify-bridge.html` scopes that
CSP exception to the provider frame; the main document keeps eval disabled. A private
MessageChannel initialized only by the same-origin parent carries typed operations
and measured playback updates. Unknown timestamps/drift display as unavailable.

## Roles and approval boundary

Client intent -> shared validation -> Socket.IO -> server reads role from room state
-> shared `can(role, action)` -> `applyControl` -> authoritative room broadcast.
The UI uses the same permission function for affordances; server enforcement is the
security boundary. Role assignment and removal are Host-only. Moderator capabilities
include playback/source and review, never management. Roles cannot be supplied at join.

Participant -> bounded private request queue -> Host/Moderator -> approve -> same
`applyControl` -> broadcast + requester result. Denial never mutates playback.
Requests expire after 60s or a stale revision, departure or promotion. One timer per
nonempty queue, no idle polling. Queues never appear in room snapshots.

`setHost`/`promoteHost` preserve exactly one host matching `room.hostId`. Replacement
sockets migrate role/host identity; a disconnected Host returning after failover is a
Moderator. A bounded 30s role lease supports local client identity without accounts.
Removal leaves the Socket.IO room and deletes session/queue membership, so controls
and voice signals fail membership checks. The browser session removal marker stops
automatic rejoin; it is not a permanent ban or an authentication mechanism.
## Local playback plane

`LocalFileAdapter -> browser-local File/ObjectURL -> existing HTML5 adapter -> playbackEngine`.
Only `{ fingerprint, name, size, durationSec }` crosses Socket.IO; file bytes and paths
never do. Fingerprinting samples at most 3 MiB in a module Worker. The server keeps
source metadata and per-socket `hasFile` readiness in the existing in-memory room.
Exact/near/mismatch decisions are shared pure logic; near matches require explicit local
confirmation. Reloading intentionally loses the File handle and shows the selection panel
again while the room metadata remains available until the room itself disappears.
