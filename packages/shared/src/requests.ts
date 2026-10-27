import { parseMedia, supportsAction } from "./media.js";
import { validPosition, type Action, type Room } from "./index.js";

export type ControlIntent =
  | { action: Action; payload: { position: number } }
  | { action: "setVideo"; payload: { url: string } };
export type ControlRequest = ControlIntent & {
  id: string;
  requesterId: string;
  requesterName: string;
  createdAt: number;
  sourceRevision: number;
};
export const REQUEST_TTL = 60_000;
export function cleanControlIntent(
  value: unknown,
  room: Pick<Room, "playback">,
): ControlIntent {
  if (!value || typeof value !== "object")
    throw new Error("Invalid control request.");
  const { action, payload } = value as { action?: unknown; payload?: unknown };
  if (!payload || typeof payload !== "object")
    throw new Error("Invalid control request.");
  if (action === "setVideo")
    return {
      action,
      payload: { url: parseMedia((payload as { url?: unknown }).url).url },
    };
  if (action !== "play" && action !== "pause" && action !== "seek")
    throw new Error("Invalid playback command.");
  const position = (payload as { position?: unknown }).position;
  if (!validPosition(position)) throw new Error("Invalid playback command.");
  if (!room.playback.media) throw new Error("Load a video first.");
  if (!supportsAction(room.playback.media, action))
    throw new Error("This source does not support that playback control.");
  return { action, payload: { position } };
}
export function requestIsCurrent(
  request: ControlRequest,
  room: Room,
  now: number,
): boolean {
  return (
    now - request.createdAt < REQUEST_TTL &&
    request.sourceRevision === room.playback.revision &&
    room.participants.some(
      (p) => p.id === request.requesterId && p.role === "participant",
    )
  );
}
export function checkRequestLimit(
  queue: ControlRequest[],
  requesterId: string,
  action: ControlIntent["action"],
) {
  if (queue.some((r) => r.requesterId === requesterId && r.action === action))
    throw new Error("Already waiting for approval for this action.");
  if (queue.filter((r) => r.requesterId === requesterId).length >= 3)
    throw new Error("You can have at most 3 pending requests.");
}
