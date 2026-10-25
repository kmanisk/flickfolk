import { describe, expect, it } from "vitest";
import { avatarIdentity, emojiOnlyCount, plainComposerText, activeSpeakerIds } from "../src/index.js";
describe("shared-room presentation", () => {
  it("uses stable name-based monograms and palette across rejoining IDs", () => {
    expect(avatarIdentity("Kumar Gaurav")).toEqual(avatarIdentity("Kumar Gaurav"));
    expect(avatarIdentity("Kumar Gaurav").initials).toBe("KG");
    expect(avatarIdentity("Kumar Manisk Gaurav").initials).toBe("KG");
    expect(avatarIdentity("Sam").color).toBeLessThan(5);
  });
  it("recognizes emoji graphemes without treating digits or mixed text as stickers", () => {
    expect(emojiOnlyCount("\u2764\uFE0F")).toBe(1);
    expect(emojiOnlyCount("\uD83D\uDE02 \uD83D\uDE2E \uD83D\uDD25")).toBe(3);
    expect(emojiOnlyCount("\uD83D\uDC69\u200D\uD83D\uDCBB")).toBe(1);
    for (const text of ["", "hello \uD83D\uDE02", "123", "abcd", "\uD83D\uDE02".repeat(4)]) expect(emojiOnlyCount(text)).toBe(0);
  });
  it("keeps pasted markup as inert text, strips controls and bounds composition", () => {
    expect(plainComposerText('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
    expect(plainComposerText("a\r\nb\x00")).toBe("a\nb");
    expect(plainComposerText("x".repeat(600))).toHaveLength(500);
  });
  it("limits the active-speaker overlay to three actually speaking people", () => {
    const people = Array.from({ length: 6 }, (_, i) => ({ id: String(i), speaking: i > 0 }));
    expect(activeSpeakerIds(people)).toEqual(["1", "2", "3"]);
    expect(activeSpeakerIds([])).toEqual([]);
  });
});
