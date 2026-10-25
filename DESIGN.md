# Flickfolk — Warm Dusk

The current user brief supersedes all prototype design rules.
Locked reference: `design/refs/room.png`. This file was absent at the start of this
pass; use the explicit specification without claiming a pixel match.

## Tokens
bg #120f10; panel #1b1819; raised #242021; line #2e2a2b.
text #f5efe8; muted #a8a09a; accent #ff7a59; accent text #1a0d0b.
online #3ddc84; danger #e5484d.
Coral is the only normal accent. Danger is reserved for errors/destructive hover.
Figtree Variable for all UI. JetBrains Mono only for room codes and sync numbers.
Self-host Fontsource latin normal subsets, font-display swap. UI 14–16px, never
below 13px. Timestamps/telemetry use tabular numerals.
Panel radius 16px; video 20px; buttons 12px; chips fully round; bubbles 18px with
a tighter sender corner. Separators 1px. No glass, backdrop blur or decorative shadows.
Lucide icons: individual imports, 20px, strokeWidth 1.75. No Unicode UI icons.

## Primitives and presence
Use the existing workspace paths: `apps/client/src/ui`, `packages/shared/src/brand.ts`.
Button, IconButton, Chip, Tabs, Tooltip, Toast, Avatar, AvatarStack, Popover, Kbd.
One coral focus ring; controls 40px desktop, at least 44px mobile.
Name-hashed initials palette: #ff8a6b, #f2b05e, #7cc6a4, #7aa8e6, #c49be8, #e88fb3.
Dark initials, online dot, truthful mic/host state. Speaking rings require measured
voice activity. Keep active-speaker overlays inside the fullscreen stage.

## Desktop room
At >=1024px, a 100dvh grid: topbar 56px, main minmax(0,1fr), bottom bar 56px.
No page scroll. Main stage flexes beside a 360px Chat/People rail; collapsed rail 56px.
Topbar: Flickfolk, room/copy, avatar stack, Invite, shortcuts, settings, mic, leave.
No duplicate title row or participant strip. Leave is ghost, danger only on hover.
Stage contains object-fit-contain video, a static 8% coral radial glow, source editor
and overlay controls. Controls hide after 2.5s only while playing and idle.
Bottom bar: source domain/editor, six-reaction dock, real sync/drift/RTT chip.
Detailed version/correction telemetry appears only with ?debug=1.

## Conversation and motion
Group consecutive same-author messages within five minutes, cap rendered history at
200. No repeated identity on grouped lines; timestamps on hover. Emoji-only <=3
messages are large and bubble-free. Reactions never become chat messages.
Compact one-row composer grows to four lines, Enter sends, Shift+Enter newline,
plain-text paste only, 500 characters. Follow only within 80px of the bottom.
GIPHY is lazy and offered only after a successful configured provider check; Link
remains an overflow fallback. Provider failures do not break chat.
Reactions float 180–280px over 1.4–1.8s, cap 30, reconcile optimistic echoes.
Reduced motion uses a short fade; FX off removes decorative glow/motion.
Native transform/opacity transitions only; rail width may transition 220ms.

## Home and mobile
Home >=1024px: concise heading/form left, HTML/CSS room preview right; primary action
visible at 1366x768. No fake people, stats, screenshots, generated artwork or queues.
At 390x844 the primary action remains above fold; preview follows the form.
Room <768px: topbar 48px, near-top 16:9 stage, tabs and flexible panel, composer above
safe-area bottom. A single floating reaction button opens an upward dock.
No horizontal overflow at 360px. Fullscreen targets the stage wrapper with overlays.

## Invariants
Preserve playback engine, host authority, echo guards, Socket.IO wire events,
reconnect identity, peer voice, compression and ducking. No camera/auth/database.
Lazy Room, voice, GIF and YouTube API. No animation library or UI framework.
No deployment. Verify lint/typecheck/unit/build/browser and actual responsive renders.
