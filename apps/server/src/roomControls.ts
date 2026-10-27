import {
  cleanControlIntent,
  currentPosition,
  mediaCapabilities,
  parseMedia,
  type ControlIntent,
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
