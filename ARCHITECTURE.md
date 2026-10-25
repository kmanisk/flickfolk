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
Host commands are clamped and throttled; programmatic events are guarded for 600ms.
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
