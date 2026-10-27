import {
  cleanControlIntent,
  currentPosition,
  mediaCapabilities,
  parseMedia,
  cleanLocalSource,
  type ControlIntent,
  type LocalSourceMetadata,
  type Room,
} from "@watchparty/shared";

// Direct controls and approved requests share this timestamp/revision path.
export function applyControl(
  room: Room,
  input: ControlIntent,
  now = Date.now(),
) {
  const intent = cleanControlIntent(input, room);
  if (intent.action === "setVideo") {
    room.playback = {
      media: parseMedia(intent.payload.url),
      position: 0,
      playing: false,
      updatedAt: now,
      revision: room.playback.revision + 1,
    };
    for (const person of room.participants) person.hasFile = false;
    return;
  }
  room.playback = {
    ...room.playback,
    position: !mediaCapabilities(room.playback.media!).canReadPosition
      ? 0
      : intent.action === "play"
        ? currentPosition(room.playback, now)
        : intent.payload.position,
    playing:
      intent.action === "seek"
        ? room.playback.playing
        : intent.action === "play",
    updatedAt: now,
    revision: room.playback.revision + 1,
  };
}

export function applyLocalSource(
  room: Room,
  input: LocalSourceMetadata,
  now = Date.now(),
) {
  const local = cleanLocalSource(input);
  room.playback = {
    media: {
      kind: "local",
      id: local.fingerprint,
      url: "",
      local,
    },
    position: 0,
    playing: false,
    updatedAt: now,
    revision: room.playback.revision + 1,
  };
  for (const person of room.participants) person.hasFile = false;
}
