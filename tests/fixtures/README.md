# Browser media fixtures

`clip.webm` is the existing short video fixture used by playback tests.
`audio.ogg` is a four-second 220 Hz sine tone generated locally with FFmpeg/Opus:

```bash
ffmpeg -f lavfi -i 'sine=frequency=220:sample_rate=48000' -t 4 -c:a libopus audio.ogg
```

Provider tests mock official SDK boundaries. The real engine, room state, typed
Socket.IO commands, permissions, correction policy and UI remain active.
These fixtures do not certify provider availability, account access or ad behavior.
