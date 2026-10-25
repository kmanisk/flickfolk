import type { VoiceState, VoiceSignal, Reaction } from "./collaboration.js";
export * from "./collaboration.js";
export * from "./audio.js";
export * from "./reactions.js";
export interface Media {
  kind: "youtube" | "video";
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
  voice: VoiceState;
  id: string;
  name: string;
}
export interface Message {
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
  "room:create": (payload: { name: string }, ack: Ack<Room>) => void;
  "room:join": (
    payload: { name: string; code: string },
    ack: Ack<Room>,
  ) => void;
  "room:leave": (ack: Ack) => void;
  "media:set": (payload: { url: string }, ack: Ack) => void;
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
export function parseMedia(value: unknown): Media {
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("Enter a YouTube or .mp4/.webm URL.");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid video URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP or HTTPS video URL without credentials.");
  const host = url.hostname.toLowerCase();
  if (
    [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be",
      "www.youtu.be",
    ].includes(host)
  ) {
    const id = host.endsWith("youtu.be")
      ? url.pathname.slice(1)
      : url.pathname === "/watch"
        ? url.searchParams.get("v")
        : /^\/(embed|shorts)\//.test(url.pathname)
          ? url.pathname.split("/")[2]
          : null;
    if (!id || !/^[\w-]{11}$/.test(id))
      throw new Error("Use a valid YouTube video link.");
    return {
      kind: "youtube",
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
    };
  }
  if (!/\.(mp4|webm)$/i.test(url.pathname))
    throw new Error("Direct videos must use .mp4 or .webm URLs.");
  return { kind: "video", id: url.href, url: url.href };
}
export function currentPosition(playback: Playback, now: number): number {
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
export function canControl(room: Pick<Room, "hostId">, id: string): boolean {
  return room.hostId === id;
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
