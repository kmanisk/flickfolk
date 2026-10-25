import { describe, it, expect } from "vitest";
import { ClockSync, computeCorrection } from "../src/sync.js";
describe("clock sync", () => {
  it("selects the lowest RTT sample, not a slow ping with a biased midpoint", () => {
    const clock = new ClockSync(() => 1000);
    clock.ingest([
      { t0: 0, rtt: 100, serverNow: 90 },
      { t0: 200, rtt: 10, serverNow: 225 },
      { t0: 400, rtt: 20, serverNow: 490 },
    ]);
    expect(clock.rttMs).toBe(10);
    expect(clock.offsetMs).toBe(20);
    expect(clock.nowServer()).toBe(1020);
  });
  it("rejects outliers and smooths refresh offsets with alpha .3", () => {
    const clock = new ClockSync();
    expect(clock.ingest([{ t0: 0, rtt: 10, serverNow: 25 }])).toBe(true);
    expect(clock.ingest([{ t0: 100, rtt: 21, serverNow: 10000 }])).toBe(false);
    expect(clock.offsetMs).toBe(20);
    clock.ingest([{ t0: 100, rtt: 20, serverNow: 150 }]);
    expect(clock.offsetMs).toBe(26);
    expect(clock.rttMs).toBe(20);
    expect(clock.ingest([{ t0: NaN, rtt: -1, serverNow: 0 }])).toBe(false);
  });
});
const base = {
  provider: "file" as const,
  nowMs: 5000,
  lastCorrectionMs: 0,
  consecutiveOver: 2,
  targetSec: 40,
};
describe("provider correction policy", () => {
  it.each([
    [0, "none", 1],
    [0.119, "none", 1],
    [0.12, "rate", 0.95],
    [-0.12, "rate", 1.05],
    [2, "rate", 0.95],
    [2.001, "seek", 1],
    [-2.001, "seek", 1],
  ])("file drift %s chooses %s", (driftSec, action, rate) => {
    const fix = computeCorrection({ ...base, driftSec });
    expect(fix.action).toBe(action);
    expect(fix.rate).toBe(rate);
    if (fix.action === "seek") expect(fix.seekTo).toBe(40);
  });
  it("requires two bad measurements and holds a nudge until under .05s", () => {
    expect(
      computeCorrection({ ...base, driftSec: 0.3, consecutiveOver: 1 }).action,
    ).toBe("none");
    expect(
      computeCorrection({ ...base, driftSec: 0.08, nudging: true }).action,
    ).toBe("rate");
    expect(
      computeCorrection({ ...base, driftSec: 0.049, nudging: true }),
    ).toEqual({ action: "none", rate: 1 });
  });
  it.each([
    [0.6, 5000, 2, "none"],
    [0.61, 3999, 2, "none"],
    [0.61, 4000, 1, "none"],
    [0.61, 4000, 2, "seek"],
    [-0.7, 8000, 2, "seek"],
  ])(
    "youtube drift %s at %s with %s samples: %s",
    (driftSec, nowMs, consecutiveOver, action) => {
      expect(
        computeCorrection({
          ...base,
          provider: "youtube",
          driftSec,
          nowMs,
          consecutiveOver,
        }).action,
      ).toBe(action);
    },
  );
});
