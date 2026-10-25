import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClockSync, type Playback } from "@watchparty/shared";
import { PlaybackEngine } from "../src/lib/playbackEngine.js";
import { ClockSampler } from "../src/lib/clockSampling.js";
import { createSyncStore } from "../src/lib/syncStore.js";
import type { AdapterEvent, PlayerAdapter } from "../src/lib/playerAdapter.js";
class FakePlayer implements PlayerAdapter {
  provider: "file" | "youtube" = "file";
  time = 0;
  duration = 100;
  rate = 1;
  playing = false;
  buffering = false;
  seek = vi.fn((time: number) => {
    this.time = time;
    this.emit({ type: "state", action: "seek" });
  });
  play = vi.fn(() => {
    this.playing = true;
    this.emit({ type: "state", action: "play" });
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.playing = false;
    this.emit({ type: "state", action: "pause" });
  });
  setRate = vi.fn((rate: number) => {
    this.rate = rate;
  });
  getTime = () => this.time;
  getDuration = () => this.duration;
  isBuffering = () => this.buffering;
  listener: ((event: AdapterEvent) => void) | undefined;
  on(listener: (event: AdapterEvent) => void) {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }
  emit(event: AdapterEvent) {
    this.listener?.(event);
  }
}
const state = (revision = 1, playing = true, position = 10): Playback => ({
  revision,
  playing,
  position,
  updatedAt: Date.now(),
  media: { kind: "video", id: "clip", url: "https://example.com/clip.mp4" },
});
const disposals: (() => void)[] = [];
function setup(host = true) {
  const player = new FakePlayer();
  const clock = new ClockSync();
  const store = createSyncStore();
  const send = vi.fn();
  const blocked = vi.fn();
  const engine = new PlaybackEngine(player, {
    clock,
    store,
    send,
    now: Date.now,
    onBlocked: blocked,
  });
  engine.setContext(host, true);
  disposals.push(() => {
    engine.dispose();
    store.dispose();
  });
  return { player, clock, store, send, blocked, engine };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
});
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  vi.useRealTimers();
});
describe("framework-independent engine", () => {
  it("drops duplicate/out-of-order playback versions without applying them", () => {
    const { engine, player } = setup();
    expect(engine.receive(state(3))).toBe(true);
    const seeks = player.seek.mock.calls.length;
    expect(engine.receive(state(2, false, 70))).toBe(false);
    expect(engine.receive(state(3, false, 80))).toBe(false);
    expect(player.seek).toHaveBeenCalledTimes(seeks);
    expect(player.time).toBe(10);
  });
  it("guards programmatic events for 600ms and never emits rate changes", async () => {
    const { engine, player, send } = setup();
    engine.receive(state());
    player.emit({ type: "state", action: "pause" });
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    player.emit({ type: "state", action: "pause" });
    expect(send).toHaveBeenCalledWith("pause", 10);
    player.setRate(0.95);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("throttles each command type with a trailing final value and clamps positions", async () => {
    const { engine, send } = setup();
    engine.receive(state());
    engine.command("seek", -1);
    engine.command("seek", 40);
    engine.command("seek", 500);
    engine.command("pause", 200);
    expect(send.mock.calls).toEqual([["seek", 0]]);
    await vi.advanceTimersByTimeAsync(149);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send.mock.calls).toEqual([
      ["seek", 0],
      ["seek", 100],
      ["pause", 100],
    ]);
  });
  it("guests never emit controls, and demotion/disconnect cancel queued commands", async () => {
    const { engine, player, send } = setup(false);
    engine.receive(state(1, false));
    expect(engine.command("play")).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    player.time = 70;
    player.emit({ type: "state", action: "seek" });
    expect(player.time).toBe(10);
    expect(send).not.toHaveBeenCalled();
    engine.setContext(true, true);
    engine.command("seek", 20);
    engine.command("seek", 30);
    engine.setContext(false, false);
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("skips hidden/buffering measurements and requires two consecutive bad samples", async () => {
    const { engine, player } = setup();
    engine.receive(state());
    await Promise.resolve();
    player.seek.mockClear();
    player.time = 20;
    player.buffering = true;
    engine.tick();
    engine.tick();
    expect(player.seek).not.toHaveBeenCalled();
    player.buffering = false;
    engine.setVisible(false);
    engine.tick();
    expect(player.seek).not.toHaveBeenCalled();
    engine.setVisible(true);
    engine.tick();
    expect(player.seek).not.toHaveBeenCalled();
    engine.tick();
    expect(player.seek).toHaveBeenCalledTimes(1);
  });
  it("only retries denied autoplay after a gesture and aligns to the current expected time", async () => {
    const { engine, player, blocked } = setup();
    player.play.mockImplementationOnce(() =>
      Promise.reject(new Error("NotAllowedError")),
    );
    engine.receive(state());
    await Promise.resolve();
    expect(blocked).toHaveBeenCalledWith(true);
    await vi.advanceTimersByTimeAsync(3000);
    engine.resync();
    expect(player.play).toHaveBeenCalledTimes(1);
    engine.gesture();
    expect(player.time).toBe(13);
    expect(player.play).toHaveBeenCalledTimes(2);
  });
  it("converges from a 1.5s startup offset within 10s with one initial seek and no loop", async () => {
    const { engine, player, send } = setup();
    player.time = 8.5;
    engine.receive(state());
    const playbackTimer = setInterval(() => {
      if (player.playing) player.time += 0.01 * player.rate;
    }, 10);
    await vi.advanceTimersByTimeAsync(10000);
    clearInterval(playbackTimer);
    expect(Math.abs(player.time - 20)).toBeLessThan(0.12);
    expect(player.seek).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
  it("publishes store snapshots no more than four times per second", async () => {
    const store = createSyncStore();
    const listener = vi.fn();
    store.subscribe(listener);
    disposals.push(store.dispose);
    for (let i = 0; i < 25; i++) {
      store.update({ driftMs: i });
      await vi.advanceTimersByTimeAsync(20);
    }
    expect(listener.mock.calls.length).toBeLessThanOrEqual(3);
    expect(store.getSnapshot().driftMs).toBe(24);
  });
});
describe("clock burst scheduling", () => {
  it("samples five at connect spaced 200ms and three again every 30s", async () => {
    const ping = vi.fn(async () => Date.now());
    const changed = vi.fn();
    const sampler = new ClockSampler(
      new ClockSync(),
      { ping },
      changed,
      Date.now,
      Date.now,
    );
    disposals.push(() => sampler.stop());
    const first = sampler.start();
    await vi.advanceTimersByTimeAsync(800);
    await first;
    expect(ping).toHaveBeenCalledTimes(5);
    expect(changed).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29600);
    expect(ping).toHaveBeenCalledTimes(8);
    sampler.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(ping).toHaveBeenCalledTimes(8);
  });
});

describe("echo and provider recovery edges", () => {
  it("does not echo a delayed programmatic PLAYING acknowledgement after the window", async () => {
    const { engine, player, send } = setup();
    engine.receive(state());
    await vi.advanceTimersByTimeAsync(700);
    player.emit({ type: "state", action: "play" });
    expect(send).not.toHaveBeenCalled();
  });
  it("YouTube never rate-nudges and spaces correction seeks by at least four seconds", async () => {
    const { engine, player } = setup();
    player.provider = "youtube";
    engine.receive(state());
    player.seek.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    engine.tick();
    expect(player.seek).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(player.seek).toHaveBeenCalledTimes(1);
    player.time -= 1;
    engine.tick();
    engine.tick();
    expect(player.seek).toHaveBeenCalledTimes(1);
    expect(player.setRate).not.toHaveBeenCalledWith(0.95);
    expect(player.setRate).not.toHaveBeenCalledWith(1.05);
  });
  it("restores normal rate after nudge convergence and cancels every engine timer on dispose", () => {
    const { engine, player } = setup();
    engine.receive(state());
    player.time = 9.5;
    engine.tick();
    engine.tick();
    expect(player.rate).toBe(1.05);
    player.time = 9.96;
    engine.tick();
    expect(player.rate).toBe(1);
    engine.dispose();
    expect(player.listener).toBeUndefined();
  });
  it("pause follows the final queued scrub so a late seek cannot mutate an already paused snapshot", async () => {
    const { engine, send } = setup();
    engine.receive(state());
    engine.command("seek", 40);
    engine.command("seek", 45);
    engine.command("pause", 40);
    expect(send.mock.calls).toEqual([["seek", 40]]);
    await vi.advanceTimersByTimeAsync(150);
    expect(send.mock.calls).toEqual([
      ["seek", 40],
      ["seek", 45],
      ["pause", 45],
    ]);
  });
});

it("an intentional pause cancelling a pending play promise does not create an autoplay gate", async () => {
  const { engine, player, blocked } = setup();
  let reject: (error: Error) => void = () => {};
  player.play.mockImplementationOnce(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  engine.receive(state(1, true));
  engine.receive(state(2, false));
  reject(
    Object.assign(new Error("Interrupted by pause"), { name: "AbortError" }),
  );
  await Promise.resolve();
  expect(blocked).not.toHaveBeenCalled();
  engine.receive(state(3, true));
  expect(player.play).toHaveBeenCalledTimes(2);
});
it("pause commands sample the adapter at send time instead of a stale UI label", () => {
  const { engine, player, send } = setup();
  engine.receive(state());
  player.time = 10.875;
  engine.command("pause");
  expect(send).toHaveBeenCalledWith("pause", 10.875);
});
