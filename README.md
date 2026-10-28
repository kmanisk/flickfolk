<div align="center">
  <img src="apps/client/public/favicon.svg" width="92" alt="Flickfolk logo" />

# Flickfolk

**Same movie. Same second.**

Real-time watch parties with synchronized playback, voice chat, reactions and private local-file playback.

[Live app](https://flickfolk.onrender.com) · [Architecture](ARCHITECTURE.md) · [Design](DESIGN.md) · [Deployment](DEPLOY.md)

<br />

<img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111111" alt="React 19" />
<img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
<img src="https://img.shields.io/badge/Node.js-22+-5FA04E?logo=node.js&logoColor=white" alt="Node.js" />
<img src="https://img.shields.io/badge/Socket.IO-Realtime-010101?logo=socket.io&logoColor=white" alt="Socket.IO" />
<img src="https://img.shields.io/badge/WebRTC-Voice-333333?logo=webrtc&logoColor=white" alt="WebRTC" />
<img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite" />
<img src="https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white" alt="Playwright" />
<img src="https://img.shields.io/badge/Render-Live-46E3B7?logo=render&logoColor=111111" alt="Render" />

</div>

<p align="center">
  <img src="docs/screenshots/room-1366.png" alt="Flickfolk watch room" width="920" />
</p>

## Overview

Flickfolk lets people open a room, share an invite and watch the same media on the same timeline. The server keeps room and playback state authoritative while each browser handles media playback locally.

- Room codes and invite links with no account required.
- Synchronized play, pause, seek and source changes.
- Host, Moderator and Participant roles with server-side permissions.
- Participant control requests with Host/Moderator approval.
- Late-join alignment, reconnect recovery and automatic host failover.
- Peer-to-peer WebRTC voice chat with speaking indicators and movie ducking.
- Reactions, text/GIF chat and responsive desktop/mobile layouts.
- Local-file watch parties without uploading the video.
- Direct media URLs, YouTube, HLS, MPEG-DASH and provider embeds.

## Media

| Source | Support |
| --- | --- |
| YouTube | Synchronized playback through the IFrame API |
| Direct video URLs | Native browser playback, including signed and extensionless media URLs |
| HLS `.m3u8` | Native HLS where available, otherwise `hls.js` |
| MPEG-DASH `.mpd` | `dash.js` over the same synchronized video engine |
| Local files | MP4, WebM, MKV, MOV, AVI, MPEG, TS and other browser-decodable containers |
| Direct audio | MP3, OGG, M4A and other browser-supported audio |
| Twitch | VOD timeline sync plus capability-aware live playback |
| SoundCloud | Track and playlist playback through the official widget |
| Spotify | Official embed controls with provider-specific limits |
| Kick | Official livestream embed |

Container support still depends on codecs available in the viewer's browser and operating system. Flickfolk does not transcode media on the server.

## Private local-file playback

Local files stay on each viewer's device. A Host or Moderator chooses a file, Flickfolk fingerprints a small sample in a Web Worker, and other viewers select their own copy.

```text
Local File
    ↓
Browser Object URL
    ↓
HTML5 Video
    ↓
Flickfolk Sync Engine
```

Only a sanitized filename, size, duration and SHA-256 fingerprint are shared with the room. File bytes and filesystem paths never leave the device.

Exact copies match automatically. A different encode with nearly the same duration can be accepted explicitly with **Use anyway**. Refreshing intentionally requires selecting the local file again.

## Room controls

| Capability | Host | Moderator | Participant |
| --- | --- | --- | --- |
| Play / pause | Direct | Direct | Request |
| Seek | Direct | Direct | Request |
| Change source | Direct | Direct | Request |
| Approve requests | Yes | Yes | No |
| Promote / demote | Yes | No | No |
| Remove participant | Yes | No | No |
| Chat / reactions / voice | Yes | Yes | Yes |

Permissions are validated by the server; disabled client controls are only UI feedback.

## Architecture

```text
Client intent
    ↓
Socket.IO
    ↓
Server validation + permissions
    ↓
Authoritative room/playback state
    ↓
Room broadcast
    ↓
Local playback + drift correction
```

The server owns room membership, roles, playback state and revisions. Browsers own media playback, UI state and peer-to-peer audio. The synchronization engine estimates clock offset, aligns late joiners, ignores stale revisions and corrects drift with small rate adjustments or seeks depending on the media provider.

```text
apps/client      React/Vite UI, player adapters, voice and room experience
apps/server      Express, Socket.IO, validation, room state and signaling
packages/shared  shared types, permissions, media parsing and sync policy
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the deeper implementation notes.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Backend | Node.js, Express, Socket.IO |
| Realtime audio | WebRTC |
| Playback | HTML5 Media, YouTube IFrame API, hls.js, dash.js |
| Styling | CSS, Figtree, JetBrains Mono |
| Testing | Vitest, Playwright |
| Delivery | Docker, GitHub Actions, Render |

## Screenshots

### Home

![Flickfolk Home desktop](docs/screenshots/home-1366.png)

### Mobile

<p align="center">
  <img src="docs/screenshots/home-390.png" width="360" alt="Flickfolk Home mobile" />
  <img src="docs/screenshots/room-390.png" width="360" alt="Flickfolk Room mobile" />
</p>

## Development

Requires Node.js 22.12+ and npm.

```bash
npm ci
cp .env.example .env
npm run dev
```

Production build:

```bash
npm run build
NODE_ENV=production npm start
```

Docker:

```bash
docker compose up --build
```

The production container runs as a non-root user and exposes `/healthz`.

## Optional configuration

WebRTC voice works without an account. Public STUN is available by default; restrictive networks can use TURN.

```env
STUN_URLS=
TURN_URLS=
TURN_USERNAME=
TURN_PASSWORD=
```

GIF search is optional and uses a server-side GIPHY key:

```env
GIPHY_API_KEY=
```

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space / K | Play or pause |
| J / L | Seek -10s / +10s |
| F | Toggle stage fullscreen |
| Escape | Exit fullscreen / close transient UI |
| M | Mute microphone after joining voice |
| `/` | Focus chat |
| C | Copy invite |
| T | Toggle sidebar |

Playback shortcuts still follow the current user's room permissions.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Current suite:

- 220 unit/integration tests
- 41 Playwright browser tests
- Docker build and non-root health smoke test in GitHub Actions

## Deployment

**Live:** https://flickfolk.onrender.com

The React client and Socket.IO server run from the same Node service. Rooms are currently stored in memory, so active rooms are cleared when the service restarts.

---

<div align="center">
  <strong>Flickfolk</strong><br />
  Same movie. Same second.
</div>
