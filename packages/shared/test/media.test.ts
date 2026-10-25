import { expect, it } from "vitest";
import {
  parseMedia,
  mediaCapabilities,
  supportsAction,
  currentPosition,
} from "../src/index.js";
it.each([
  ["https://cdn.example/movie.mp4?token=x", "video", "file"],
  ["http://localhost:3101/clip.webm", "video", "file"],
  ["https://cdn.example/music.mp3", "audio", "file"],
  ["https://cdn.example/music.ogg", "audio", "file"],
  ["https://cdn.example/music.m4a", "audio", "file"],
  ["https://youtu.be/dQw4w9WgXcQ", "youtube", "youtube"],
  ["https://www.youtube.com/embed/dQw4w9WgXcQ", "youtube", "youtube"],
  ["https://www.twitch.tv/twitchdev", "twitch", "twitch"],
  ["https://www.twitch.tv/videos/123456789", "twitch", "twitch"],
  [
    "https://player.twitch.tv/?video=v12345&parent=evil.example",
    "twitch",
    "twitch",
  ],
  ["https://soundcloud.com/artist/a-track", "soundcloud", "soundcloud"],
  [
    "https://soundcloud.com/artist/sets/my-playlist",
    "soundcloud",
    "soundcloud",
  ],
  [
    "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
    "spotify",
    "spotify",
  ],
  [
    "https://open.spotify.com/playlist/4cOdK2wGLETKBW3PvgPWqT",
    "spotify",
    "spotify",
  ],
  [
    "https://open.spotify.com/intl-de/episode/4cOdK2wGLETKBW3PvgPWqT?si=tracking",
    "spotify",
    "spotify",
  ],
  ["https://player.kick.com/streamer?autoplay=true", "kick", "kick"],
  ["https://kick.com/streamer", "kick", "kick"],
])("detects %s without fetching user URLs", (url, kind, provider) => {
  const media = parseMedia(url);
  expect(media.kind).toBe(kind);
  expect(mediaCapabilities(media).provider).toBe(provider);
  expect(media.url).not.toContain("evil.example");
  expect(media).toEqual(parseMedia(media.url));
});
it.each([
  "javascript:alert(1)",
  "data:text/html,<script></script>",
  "https://user:pass@kick.com/streamer",
  "https://twitch.tv.evil.example/channel",
  "https://twitch.tv/directory",
  "https://twitch.tv/videos/nope",
  "https://player.twitch.tv/?video=bad",
  "http://soundcloud.com/artist/track",
  "https://soundcloud.com/discover",
  "https://soundcloud.com/search/tracks",
  "https://open.spotify.com/track/short",
  "https://spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
  "https://open.spotify.com:444/track/4cOdK2wGLETKBW3PvgPWqT",
  "https://kick.com/streamer/clips",
  "https://kick.com/browse",
  "https://example.com/watch/123",
  "https://example.com/image.png",
  "<iframe src='https://player.kick.com/x'></iframe>",
])("rejects unsupported or misleading source %s", (url) =>
  expect(() => parseMedia(url)).toThrow("This source isn't supported yet."),
);
it("never fabricates live positions or permits unsupported live/embed actions", () => {
  for (const url of [
    "https://twitch.tv/twitchdev",
    "https://kick.com/streamer",
  ]) {
    const media = parseMedia(url),
      caps = mediaCapabilities(media);
    expect(caps).toMatchObject({
      isLive: true,
      canSeek: false,
      canReadPosition: false,
      canReadDuration: false,
    });
    expect(supportsAction(media, "seek")).toBe(false);
    expect(
      currentPosition(
        { media, position: 500, playing: true, updatedAt: 0, revision: 1 },
        100000,
      ),
    ).toBe(0);
  }
  expect(supportsAction(parseMedia("https://kick.com/streamer"), "play")).toBe(
    false,
  );
  expect(
    supportsAction(parseMedia("https://twitch.tv/twitchdev"), "pause"),
  ).toBe(true);
});
it("uses documented Spotify episode seeking and treats all Spotify playback as limited", () => {
  const track = mediaCapabilities(
    parseMedia("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"),
  );
  const episode = mediaCapabilities(
    parseMedia("https://open.spotify.com/episode/4cOdK2wGLETKBW3PvgPWqT"),
  );
  expect(track).toMatchObject({
    canPlay: true,
    canPause: true,
    canSeek: false,
    canSetVolume: false,
    canReadPosition: false,
    syncMode: "limited",
  });
  expect(episode).toMatchObject({
    canSeek: true,
    canReadPosition: true,
    canReadDuration: true,
    syncMode: "limited",
  });
});
it("keeps full timeline controls for files, YouTube, Twitch VOD and SoundCloud", () => {
  for (const url of [
    "https://example.com/a.mp3",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://twitch.tv/videos/12345",
    "https://soundcloud.com/artist/sets/list",
  ]) {
    expect(mediaCapabilities(parseMedia(url))).toMatchObject({
      canPlay: true,
      canPause: true,
      canSeek: true,
      canReadPosition: true,
      canReadDuration: true,
      isLive: false,
      syncMode: "full",
    });
  }
});
