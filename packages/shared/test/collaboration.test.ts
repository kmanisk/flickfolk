import { describe, it, expect } from "vitest";
import {
  REACTIONS,
  cleanReaction,
  cleanVoiceState,
  cleanSignal,
  gifUrl,
  VOICE_OFF,
} from "../src/index.js";
describe("collaboration boundaries", () => {
  it("accepts only the six supported reactions", () => {
    for (const symbol of REACTIONS) expect(cleanReaction(symbol)).toBe(symbol);
    for (const bad of ["<img>", "", "abc", null, {}])
      expect(() => cleanReaction(bad)).toThrow();
  });
  it("only accepts known public HTTPS raster image URLs", () => {
    expect(gifUrl("https://media.giphy.com/media/example/giphy.gif")).toContain(
      "https://media.giphy.com/",
    );
    expect(gifUrl("https://i.imgur.com/example.webp?size=2")).toContain(
      ".webp",
    );
    for (const bad of [
      "http://media.giphy.com/a.gif",
      "javascript:alert(1)",
      "https://user:pass@media.giphy.com/a.gif",
      "https://127.0.0.1/a.gif",
      "https://localhost/a.gif",
      "https://media.giphy.com.evil.com/a.gif",
      "https://evil.com/a.gif",
      "https://media.giphy.com/a.svg",
      "https://media.giphy.com/a.html",
      "https://media.giphy.com:8443/a.gif",
      null,
    ])
      expect(() => gifUrl(bad)).toThrow();
  });
  it("normalizes muted/off speaking state and rejects malformed presence", () => {
    expect(
      cleanVoiceState({ joined: false, muted: false, speaking: true }),
    ).toEqual(VOICE_OFF);
    expect(
      cleanVoiceState({ joined: true, muted: true, speaking: true }).speaking,
    ).toBe(false);
    expect(() => cleanVoiceState({ joined: "true" })).toThrow();
  });
  it("only accepts bounded audio descriptions and ICE shapes", () => {
    expect(
      cleanSignal({
        kind: "description",
        type: "offer",
        sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
      }).kind,
    ).toBe("description");
    for (const sdp of [
      "v=0\r\nm=video 9 RTP 1\r\n",
      "v=0\r\nm=audio 9 RTP 1\r\nm=application 9 datachannel\r\n",
      "x".repeat(7000),
    ])
      expect(() =>
        cleanSignal({ kind: "description", type: "offer", sdp }),
      ).toThrow();
    expect(() =>
      cleanSignal({
        kind: "ice",
        candidate: { candidate: "bad", sdpMid: null, sdpMLineIndex: -1 },
      }),
    ).toThrow();
  });
});
