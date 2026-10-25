# Afterglow design reference

Reference: https://www.figma.com/design/9mkEKyqIstCdmsN5vmv1BH/WatchParty-UI-Redesign
Requested frames: latest Home / 1440, Room / 1440, Room / 390.

Figma inspection is currently blocked by the connector Starter-plan tool quota;
public URL retrieval also failed. No frame dimensions, asset matches or pixel
fidelity are claimed. This implementation follows the explicit written brief.
Reconcile against those three frames when Figma access is restored.

## Tokens

Rose Pine base #191724, surface #1f1d2e, overlay #26233a, muted #6e6a86,
subtle #908caa, text #e0def4, love #eb6f92, gold #f6c177,
rose #ebbcba, pine #31748f, foam #9ccfd8, iris #c4a7e7.
Use bundled Instrument Serif for major display headings, IBM Plex Sans Variable for
body/controls/chat, and JetBrains Mono only for technical broadcast metadata.
This hierarchy supersedes the earlier all-Inter pass. Fonts and OFL licenses are local.
Square corners, thin separators and generous negative space; no glass or SaaS cards.

## Layout and behavior

1440 home: compact wordmark/nav, huge two-line hero, left ticket with name,
create and code join; right CRT color test-card with live channel and lookup.
1440 room: compact code/host header; dominant player and slim source bar left;
Chat/People rail right. 390 room stacks screen, controls, source and tab rail.
Always reserve space for the fixed tmux-style statusline, including safe areas.
Chat displays actual participants, timestamps and host. No invented chat or metrics.
Lookup progresses waiting -> tuning... -> room found / no signal after a 300ms
input debounce; changes cancel pending requests. Network failure is identified.

## Effects and accessibility

Scanlines apply only to the video/display area. Vignette/grain are subtle and
non-interactive. Power-on runs on media change; gold afterglow runs on a new
playback revision. [fx] toggles CSS effects; reduced motion disables all effects.
Every interactive target is at least 40px. Visible focus, named controls, actual
tab semantics, keyboard shortcuts that ignore typing, and responsive overflow checks.

## Verification

Inspect browser screenshots at 1440 and 390px. Keep realtime acceptance tests;
add lookup states, stale response handling, tabs, shortcuts and truthful telemetry.
No authentication, database or component library. Deployment is out of scope.

## Local usability follow-up

The fullscreen button and F key toggle entry/exit; fullscreenchange keeps the button
state correct when the browser exits. The previous upright Inter pass is superseded by the display/UI/metadata
font hierarchy above. The statusline labels the measured playback offset separately
from network RTT. A ready or reconnected player aligns once immediately; existing
ongoing drift correction remains unchanged. Three-participant browser tests cover
late join, playback and seeking. The 200ms playing tolerance is not a promise of
zero offset or a network latency measurement.

## Collaboration controls

Keep the Rose Pine broadcast visual language. Microphone, reactions and GIF actions use
square controls; the empty conversation says only "quiet in here.". Source stays
visible but becomes secondary after a video loads. Remove the explanatory playback
sentence entirely. The fixed statusline prioritizes current sync state, participant
count and code; offset/RTT/revision stay smaller secondary measurements.
Chat supports compact timestamps, multiline entry, retained drafts and scroll-aware
unread state. Reactions render inside the fullscreen player, expire after 1.5 seconds
and become static with FX off or reduced motion. People shows measured speaking and
mic state. No camera, generic pills, demonstration messages or fake metrics.

## Motion and audio polish

Use compositor-only reaction bursts with random fixed trajectories, a twelve-node
cap, echo deduplication and a 600ms reduced-motion/FX-off state. Keep the overlay
inside the player and non-interactive. Speak indicators pulse only the outline;
RMS hysteresis controls state, never microphone enablement. Fullscreen retains
controls, reactions and speaking names. Native micro-motion uses 120–160ms changes
on controls/popovers/messages only; no scrolling or continuous background motion.
The GIPHY picker uses the existing square dark pane treatment, small lazy previews,
its official attribution mark and an honest unavailable state without a key.


## Shared-room presence pass

Name-hashed circular monograms use flat palette colors and survive reconnection.
Measured RMS changes ring CSS properties directly, without per-sample React state.
Speaking avatars/names appear inside the screen, including fullscreen, capped at
three; silence releases the overlay after 450ms. Disconnected participants clear it.
People prioritizes name, host, mic and speech. Local audio is never looped back.

The rail uses a one-line textarea (plain-text equivalent to contenteditable), grows
to four lines, and preserves Enter/Shift+Enter, limits and scroll-aware unread state.
Emoji-only messages use 52px/38px type and one insertion animation; room reactions
remain ephemeral. GIF and emoji panels sit above the sticky horizontal composer.
Source collapses after loading. Default statusline exposes sync/count/channel only;
`?debug=1` retains measured RTT/offset/revision/host. No telemetry was removed.

Shared CSS motion tokens are 120/180/320ms. Reduced motion disables nonessential
motion. Home section visibility uses a one-shot IntersectionObserver; no scroll loop.
