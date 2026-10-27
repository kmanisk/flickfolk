import { mediaCapabilities } from "./media.js";
export * from "./media.js";
import type { VoiceState, VoiceSignal, Reaction } from "./collaboration.js";
import { can, type Role } from "./permissions.js";
import type { ControlIntent, ControlRequest } from "./requests.js";
export * from "./permissions.js";
export * from "./requests.js";
export * from "./collaboration.js";
export * from "./audio.js";
export * from "./reactions.js";
export interface Media {
  kind:
    | "youtube"
    | "video"
    | "audio"
    | "twitch"
    | "soundcloud"
    | "spotify"
    | "kick";
  live?: boolean;
  url: string;
  id: string;
}
export interface Playback {
  media: Media | null;
  playing: boolean;
  position: number;
  updatedAt: number;
  revision: number;
}
export interface Participant {
  role: Role;
  voice: VoiceState;
  id: string;
  name: string;
}
export interface Message {
  senderId?: string;
  kind: "text" | "gif";
  id: string;
  name: string;
  text: string;
  at: number;
}
export interface Room {
  code: string;
  hostId: string;
  participants: Participant[];
  playback: Playback;
  messages: Message[];
}
export type Action = "play" | "pause" | "seek";
export type Result<T = void> =
  { ok: true; data: T } | { ok: false; error: string };
export type Ack<T = void> = (result: Result<T>) => void;
export interface ClientEvents {
  "room:create": (
    payload: { name: string; clientId?: string },
    ack: Ack<Room>,
  ) => void;
  "room:join": (
    payload: { name: string; code: string; clientId?: string },
    ack: Ack<Room>,
  ) => void;
  "room:leave": (ack: Ack) => void;
  "media:set": (payload: { url: string }, ack: Ack) => void;
  "role:assign": (
    payload: { userId: string; role: "moderator" | "participant" },
    ack: Ack,
  ) => void;
  "participant:remove": (payload: { userId: string }, ack: Ack) => void;
  "control:request": (
    payload: ControlIntent,
    ack: Ack<{ requestId: string }>,
  ) => void;
  "control:resolve": (
    payload: { requestId: string; approve: boolean },
    ack: Ack,
  ) => void;
  "control:requests": (ack: Ack<ControlRequest[]>) => void;
  "playback:control": (
    payload: { action: Action; position: number },
    ack: Ack,
  ) => void;
  "chat:send": (
    payload: { text: string; kind?: "text" | "gif" },
    ack: Ack,
  ) => void;
  "voice:state": (payload: VoiceState, ack: Ack) => void;
  "voice:signal": (
    payload: { targetId: string; signal: VoiceSignal },
    ack: Ack,
  ) => void;
  "reaction:send": (
    payload: { symbol: string; clientId?: string },
    ack: Ack,
  ) => void;
  clock: (ack: (now: number) => void) => void;
}
export interface ServerEvents {
  "role:assigned": (payload: {
    userId: string;
    username: string;
    role: Role;
  }) => void;
  "participant:removed": (payload: {
    userId: string;
    reason: "removed_by_host";
  }) => void;
  "control:requests": (payload: ControlRequest[]) => void;
  "control:result": (payload: {
    requestId: string;
    approved: boolean;
    error?: string;
  }) => void;
  "voice:presence": (payload: { id: string; state: VoiceState }) => void;
  "voice:signal": (payload: { fromId: string; signal: VoiceSignal }) => void;
  reaction: (payload: Reaction) => void;
  "room:state": (room: Room) => void;
}
export const CODE = /^[A-HJ-NP-Z2-9]{6}$/;
export function normalizeCode(value: string): string {
  const trimmed = value.trim();
  try {
    return (
      new URL(trimmed).pathname
        .split("/")
        .filter(Boolean)
        .at(-1)
        ?.toUpperCase() ?? ""
    );
  } catch {
    return trimmed.toUpperCase();
  }
}
export function cleanName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter a display name.");
  const name = value.trim().replace(/\s+/g, " ");
  // Control characters are explicitly rejected at the protocol boundary.
  // eslint-disable-next-line no-control-regex
  if (!name || name.length > 32 || /[\u0000-\u001f\u007f]/.test(name))
    throw new Error("Names must be 1–32 printable characters.");
  return name;
}
export function cleanChat(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 500 ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)
  )
    throw new Error("Messages must be 1–500 printable characters.");
  return value.trim();
}
export function currentPosition(playback: Playback, now: number): number {
  if (playback.media && !mediaCapabilities(playback.media).canReadPosition)
    return 0;
  return Math.max(
    0,
    playback.position +
      (playback.playing ? Math.max(0, now - playback.updatedAt) / 1000 : 0),
  );
}
export function correction(
  local: number,
  target: number,
  playing: boolean,
): { seek: boolean; rate: number } {
  const drift = target - local;
  return {
    seek: Math.abs(drift) > (playing ? 1.25 : 0.15),
    rate: playing && Math.abs(drift) > 0.2 ? (drift > 0 ? 1.04 : 0.96) : 1,
  };
}
export function canControl(
  room: Pick<Room, "hostId"> & Partial<Pick<Room, "participants">>,
  id: string,
): boolean {
  const person = room.participants?.find((p) => p.id === id);
  return person
    ? can(person.role, "play")
    : !room.participants && room.hostId === id;
}
export function validPosition(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 604800
  );
}

export * from "./presentation.js";
export * from "./sync.js";
export * from "./brand.js";
