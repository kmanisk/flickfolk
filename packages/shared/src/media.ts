import type { Action, Media } from "./index.js";
export type Provider =
  "file" | "local" | "youtube" | "twitch" | "soundcloud" | "spotify" | "kick";
export interface PlayerCapabilities {
  provider: Provider;
  canPlay: boolean;
  canPause: boolean;
  canSeek: boolean;
  canReadPosition: boolean;
  canReadDuration: boolean;
  isLive: boolean;
  canSetVolume: boolean;
  canSetRate: boolean;
  syncMode: "full" | "limited" | "live" | "embed";
}
export function mediaCapabilities(media: Media): PlayerCapabilities {
  const provider =
    media.kind === "video" || media.kind === "audio" ? "file" : media.kind;
  const isLive =
    media.kind === "kick" || (media.kind === "twitch" && media.live === true);
  const embedOnly = provider === "kick";
  // Spotify documents seeking for podcast episodes only, not music collections.
  const timeline =
    !isLive && (provider !== "spotify" || media.id.startsWith("episode:"));
  return {
    provider,
    canPlay: !embedOnly,
    canPause: !embedOnly,
    canSeek: timeline,
    canReadPosition: timeline,
    canReadDuration: timeline,
    isLive,
    canSetVolume: !["spotify", "kick"].includes(provider),
    canSetRate: provider === "file" || provider === "local",
    syncMode: embedOnly
      ? "embed"
      : isLive
        ? "live"
        : provider === "spotify"
          ? "limited"
          : "full",
  };
}
export function supportsAction(media: Media, action: Action): boolean {
  const caps = mediaCapabilities(media);
  return action === "play"
    ? caps.canPlay
    : action === "pause"
      ? caps.canPause
      : caps.canSeek;
}
export const PROVIDER_NAMES: Record<Media["kind"], string> = {
  video: "Video file",
  audio: "Audio file",
  youtube: "YouTube",
  twitch: "Twitch",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  kick: "Kick",
  local: "Local file",
};
const unsupported = () => new Error("This source isn't supported yet.");
export function parseMedia(value: unknown): Media {
  if (typeof value !== "string" || value.length > 2048) throw unsupported();
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw unsupported();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw unsupported();
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
  const segments = url.pathname.split("/").filter(Boolean);
  if (
    ["twitch.tv", "www.twitch.tv", "m.twitch.tv", "player.twitch.tv"].includes(
      host,
    )
  ) {
    if (url.port || url.protocol !== "https:") throw unsupported();
    const video =
      host === "player.twitch.tv"
        ? url.searchParams.get("video")?.replace(/^v/, "")
        : segments[0] === "videos" && segments.length === 2
          ? segments[1]
          : null;
    if (video && /^\d{1,24}$/.test(video))
      return {
        kind: "twitch",
        id: `v${video}`,
        url: `https://www.twitch.tv/videos/${video}`,
        live: false,
      };
    const channel =
      host === "player.twitch.tv"
        ? url.searchParams.get("channel")
        : segments.length === 1
          ? segments[0]
          : null;
    if (
      !channel ||
      !/^\w{1,25}$/.test(channel) ||
      [
        "videos",
        "directory",
        "downloads",
        "settings",
        "login",
        "signup",
        "inventory",
        "subscriptions",
        "collections",
      ].includes(channel.toLowerCase())
    )
      throw unsupported();
    return {
      kind: "twitch",
      id: channel.toLowerCase(),
      url: `https://www.twitch.tv/${channel.toLowerCase()}`,
      live: true,
    };
  }
  if (
    ["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"].includes(host)
  ) {
    if (
      url.port ||
      url.protocol !== "https:" ||
      !(
        segments.length === 2 ||
        (segments.length === 3 && segments[1] === "sets")
      ) ||
      segments.some((p) => !/^[a-zA-Z0-9_-]{1,160}$/.test(p)) ||
      ["discover", "search", "you", "stream", "charts"].includes(segments[0]!)
    )
      throw unsupported();
    const canonical = `https://soundcloud.com/${segments.join("/")}`;
    return { kind: "soundcloud", id: canonical, url: canonical };
  }
  if (host === "open.spotify.com") {
    if (url.port || url.protocol !== "https:") throw unsupported();
    let parts = segments;
    if (parts[0] && /^intl-[a-z-]+$/.test(parts[0])) parts = parts.slice(1);
    if (parts[0] === "embed") parts = parts.slice(1);
    if (
      parts.length !== 2 ||
      !["track", "album", "playlist", "episode", "show", "artist"].includes(
        parts[0]!,
      ) ||
      !/^[a-zA-Z0-9]{22}$/.test(parts[1]!)
    )
      throw unsupported();
    return {
      kind: "spotify",
      id: parts.join(":"),
      url: `https://open.spotify.com/${parts.join("/")}`,
    };
  }
  if (["kick.com", "www.kick.com", "player.kick.com"].includes(host)) {
    if (
      url.port ||
      url.protocol !== "https:" ||
      segments.length !== 1 ||
      !/^[a-zA-Z0-9_-]{1,32}$/.test(segments[0]!) ||
      [
        "categories",
        "browse",
        "search",
        "settings",
        "login",
        "signup",
        "video",
        "clips",
      ].includes(segments[0]!.toLowerCase())
    )
      throw unsupported();
    const id = segments[0]!.toLowerCase();
    return {
      kind: "kick",
      id,
      url: `https://player.kick.com/${id}`,
      live: true,
    };
  }
  if (/\.(mp4|webm)$/i.test(url.pathname))
    return { kind: "video", id: url.href, url: url.href };
  if (/\.(mp3|ogg|m4a)$/i.test(url.pathname))
    return { kind: "audio", id: url.href, url: url.href };
  throw unsupported();
}
