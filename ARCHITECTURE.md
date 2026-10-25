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
