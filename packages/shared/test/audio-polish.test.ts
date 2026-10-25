import { describe, it, expect } from "vitest";
import {
  speechActivity,
  SILENT,
  duckTarget,
  volumeRamp,
  addReaction,
  gifQuery,
  type Reaction,
} from "../src/index.js";
describe("speech threshold and hysteresis", () => {
  it("starts promptly, holds through the hysteresis band, then releases quickly", () => {
    const on = speechActivity(SILENT, 0.03, 0);
    expect(on.speaking).toBe(true);
    expect(speechActivity(on, 0.02, 60).speaking).toBe(true);
    const quiet = speechActivity(on, 0.005, 100);
    expect(quiet.speaking).toBe(true);
    expect(speechActivity(quiet, 0.005, 259).speaking).toBe(true);
    expect(speechActivity(quiet, 0.005, 260).speaking).toBe(false);
  });
  it("clears immediately when muted, disconnected or invalid", () => {
    const on = { speaking: true, quietSince: null };
    expect(speechActivity(on, 0.1, 1, false)).toEqual(SILENT);
    expect(speechActivity(on, NaN, 1)).toEqual(SILENT);
  });
});
describe("volume ducking state", () => {
  it("ducks remote speech to 60% of chosen volume and multiple speakers do not compound", () => {
    expect(duckTarget(0.8, 1, true)).toBeCloseTo(0.48);
    expect(duckTarget(0.8, 5, true)).toBeCloseTo(0.48);
  });
  it("restores exact base when speech ends or preference is off", () => {
    expect(duckTarget(0.73, 0, true)).toBe(0.73);
    expect(duckTarget(0.73, 2, false)).toBe(0.73);
    expect(volumeRamp(0.438, 0.73, 380, 380)).toBe(0.73);
  });
  it("preserves zero and does not change muted media volume", () => {
    expect(duckTarget(0, 4, true)).toBe(0);
    expect(duckTarget(0.73, 2, true, true)).toBe(0.73);
  });
  it("smooths attack/release and clamps elapsed time", () => {
    expect(volumeRamp(1, 0.6, 0, 100)).toBe(1);
    expect(volumeRamp(1, 0.6, 50, 100)).toBeCloseTo(0.8);
    expect(volumeRamp(1, 0.6, 100, 100)).toBe(0.6);
    expect(volumeRamp(0.6, 1, 1000, 380)).toBe(1);
  });
});
describe("reactions and GIF searches", () => {
  const reaction = (n: number): Reaction => ({
    id: String(n),
    senderId: "person",
    symbol: "\uD83D\uDD25",
    clientId: `client${n}`,
  });
  it("deduplicates echoed optimistic reactions", () => {
    const first = [reaction(1)];
    expect(addReaction(first, { ...reaction(1), id: "server-id" })).toBe(first);
  });
  it("keeps at most 30 reactions and discards the oldest", () => {
    let items: Reaction[] = [];
    for (let n = 0; n < 50; n++) items = addReaction(items, reaction(n));
    expect(items).toHaveLength(30);
    expect(items[0]?.id).toBe("20");
  });
  it("validates search shape and bounds", () => {
    expect(gifQuery("  hello cat  ")).toBe("hello cat");
    for (const value of ["", "x".repeat(51), "a\nb", null, [], {}])
      expect(() => gifQuery(value)).toThrow();
  });
});
