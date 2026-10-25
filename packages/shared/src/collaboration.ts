export interface VoiceState {
  joined: boolean;
  muted: boolean;
  speaking: boolean;
}
export const VOICE_OFF: VoiceState = {
  joined: false,
  muted: true,
  speaking: false,
};
export const MAX_VOICE_PEERS = 8;
export const REACTIONS = [
  "\u2764\uFE0F",
  "\uD83D\uDE02",
  "\uD83D\uDE2E",
  "\uD83D\uDE2D",
  "\uD83D\uDC4F",
  "\uD83D\uDD25",
] as const;
export type ReactionSymbol = (typeof REACTIONS)[number];
export interface Reaction {
  clientId?: string;
  id: string;
  senderId: string;
  symbol: ReactionSymbol;
}
export type VoiceSignal =
  | { kind: "description"; type: "offer" | "answer"; sdp: string }
  | {
      kind: "ice";
      candidate: {
        candidate: string;
        sdpMid: string | null;
        sdpMLineIndex: number | null;
        usernameFragment?: string | null;
      };
    };
export function cleanReaction(value: unknown): ReactionSymbol {
  if (
    typeof value !== "string" ||
    !(REACTIONS as readonly string[]).includes(value)
  )
    throw new Error("Invalid reaction.");
  return value as ReactionSymbol;
}
export function cleanVoiceState(value: unknown): VoiceState {
  if (
    !value ||
    typeof value !== "object" ||
    !("joined" in value) ||
    !("muted" in value) ||
    !("speaking" in value) ||
    typeof value.joined !== "boolean" ||
    typeof value.muted !== "boolean" ||
    typeof value.speaking !== "boolean"
  )
    throw new Error("Invalid microphone state.");
  return {
    joined: value.joined,
    muted: !value.joined || value.muted,
    speaking: value.joined && !value.muted && value.speaking,
  };
}
export function cleanSignal(value: unknown): VoiceSignal {
  if (!value || typeof value !== "object" || !("kind" in value))
    throw new Error("Invalid voice signal.");
  if (
    value.kind === "description" &&
    "type" in value &&
    (value.type === "offer" || value.type === "answer") &&
    "sdp" in value &&
    typeof value.sdp === "string" &&
    value.sdp.length <= 6000 &&
    /^v=0\r?\n/.test(value.sdp) &&
    /^m=audio /m.test(value.sdp) &&
    !/^m=(?!audio )/m.test(value.sdp)
  )
    return { kind: "description", type: value.type, sdp: value.sdp };
  if (
    value.kind === "ice" &&
    "candidate" in value &&
    value.candidate &&
    typeof value.candidate === "object"
  ) {
    const c = value.candidate;
    if (
      "candidate" in c &&
      typeof c.candidate === "string" &&
      c.candidate.length <= 1500 &&
      (c.candidate === "" || c.candidate.startsWith("candidate:")) &&
      "sdpMid" in c &&
      (c.sdpMid === null ||
        (typeof c.sdpMid === "string" && c.sdpMid.length <= 100)) &&
      "sdpMLineIndex" in c &&
      (c.sdpMLineIndex === null ||
        (typeof c.sdpMLineIndex === "number" &&
          Number.isInteger(c.sdpMLineIndex) &&
          c.sdpMLineIndex >= 0 &&
          c.sdpMLineIndex < 8))
    ) {
      return {
        kind: "ice",
        candidate: {
          candidate: c.candidate,
          sdpMid: c.sdpMid,
          sdpMLineIndex: c.sdpMLineIndex,
        },
      };
    }
  }
  throw new Error("Invalid voice signal.");
}
export const GIF_HOSTS = [
  "giphy.com",
  "tenor.com",
  "i.imgur.com",
  "upload.wikimedia.org",
  "images.unsplash.com",
  "cdn.discordapp.com",
  "media.discordapp.net",
];
export function gifUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 500)
    throw new Error(
      "Use a direct HTTPS GIF or image URL (max 500 characters).",
    );
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Invalid GIF URL.");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    !GIF_HOSTS.some(
      (domain) => host === domain || host.endsWith("." + domain),
    ) ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
    /\.(localhost|local|internal|test|invalid|example|lan|home|onion)$/.test(
      host,
    ) ||
    !/\.(gif|png|jpe?g|webp|avif)$/i.test(url.pathname)
  )
    throw new Error(
      "Use a public HTTPS direct GIF/image URL without credentials.",
    );
  url.hash = "";
  if (url.href.length > 500) throw new Error("GIF URL is too long.");
  return url.href;
}

export interface GifResult {
  id: string;
  title: string;
  previewUrl: string;
  originalUrl: string;
  width: number;
  height: number;
}
export function gifQuery(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 50 ||
    Array.from(value).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new Error("Search must be 1–50 printable characters.");
  return value.trim();
}
