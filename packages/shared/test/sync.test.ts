import { describe, expect, it } from "vitest";
import {
  canControl,
  cleanChat,
  cleanName,
  correction,
  currentPosition,
  normalizeCode,
  parseMedia,
  validPosition,
  type Playback,
} from "../src/index.js";
const state: Playback = {
  media: null,
  position: 15,
  playing: true,
  updatedAt: 1000,
  revision: 1,
};
describe("authoritative timeline", () => {
  it("advances playing state for late joiners", () =>
    expect(currentPosition(state, 5500)).toBe(19.5));
  it("holds paused state", () =>
    expect(currentPosition({ ...state, playing: false }, 5500)).toBe(15));
  it("does not rewind for a clock behind the server", () =>
    expect(currentPosition(state, 500)).toBe(15));
  it("clamps negative positions", () =>
    expect(
      currentPosition({ ...state, position: -10, playing: false }, 500),
    ).toBe(0));
  it("leaves negligible drift alone", () =>
    expect(correction(10, 10.1, true)).toEqual({ seek: false, rate: 1 }));
  it("does not repeatedly seek or change rate for a 140ms playback offset", () => {
    expect(correction(10, 10.14, true)).toEqual({ seek: false, rate: 1 });
  });
  it("gently catches up or slows down", () => {
    expect(correction(10, 10.5, true)).toEqual({ seek: false, rate: 1.04 });
    expect(correction(10, 9.5, true).rate).toBe(0.96);
  });
  it("seeks major drift and paused mismatches", () => {
    expect(correction(10, 15, true).seek).toBe(true);
    expect(correction(10, 10.2, false).seek).toBe(true);
  });
});
describe("permissions and input boundaries", () => {
  it("only grants controls to host", () => {
    expect(canControl({ hostId: "host" }, "host")).toBe(true);
    expect(canControl({ hostId: "host" }, "guest")).toBe(false);
  });
  it("normalizes invites and names", () => {
    expect(normalizeCode("https://example.com/room/abc234")).toBe("ABC234");
    expect(cleanName("  Jane   Doe ")).toBe("Jane Doe");
  });
  it("rejects invalid names and chat", () => {
    for (const value of ["", null, {}, "a".repeat(33)])
      expect(() => cleanName(value)).toThrow();
    for (const value of ["", null, {}, "x".repeat(501), "\u0000"])
      expect(() => cleanChat(value)).toThrow();
  });
  it("accepts supported media", () => {
    expect(parseMedia("https://youtu.be/dQw4w9WgXcQ").id).toBe("dQw4w9WgXcQ");
    expect(parseMedia("https://www.youtube.com/shorts/dQw4w9WgXcQ").kind).toBe(
      "youtube",
    );
    expect(parseMedia("https://cdn.example/a.webm?token=example").kind).toBe(
      "video",
    );
    expect(parseMedia("https://example.com/file.m3u8").stream).toBe("hls");
    expect(parseMedia("https://example.com/signed/video?id=1").kind).toBe(
      "video",
    );
  });
  it("rejects unsupported or dangerous URLs", () => {
    for (const value of [
      "javascript:alert(1)",
      "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
      "https://user:pass@example.com/v.mp4",
      "https://youtube.com/watch?v=bad",
      "https://example.com/image.png",
      null,
    ])
      expect(() => parseMedia(value)).toThrow();
  });
  it("rejects invalid seek positions", () => {
    for (const value of [NaN, Infinity, -1, "1", 604801])
      expect(validPosition(value)).toBe(false);
    expect(validPosition(0)).toBe(true);
  });
});
