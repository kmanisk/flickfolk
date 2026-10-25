import {
  ClockSync,
  computeCorrection,
  currentPosition,
  type Action,
  type Playback,
} from "@watchparty/shared";
import type { AdapterEvent, PlayerAdapter } from "./playerAdapter.js";
import type { SyncStore } from "./syncStore.js";
interface EngineOptions {
  clock: ClockSync;
  store: SyncStore;
  send: (action: Action, position: number) => void;
  onTime?: (time: number, duration: number) => void;
  onBlocked?: (blocked: boolean) => void;
  onError?: (message: string) => void;
  now?: () => number;
  visible?: () => boolean;
}
export class PlaybackEngine {
  private playback: Playback | null = null;
  private host = false;
  private connected = false;
  private visible = true;
  private disposed = false;
  private blocked = false;
  private playPending = false;
  private playGeneration = 0;
  private applying = false;
  private ignoreUntil = -Infinity;
  private lastCorrection = -Infinity;
  private consecutiveOver = 0;
  private nudging = false;
  private rate = 1;
  private timer: ReturnType<typeof setInterval> | undefined;
  private verify: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: () => void;
  private sentAt = new Map<Action, number>();
  private afterSeek: "play" | "pause" | undefined;
  private trailing = new Map<
    Action,
    { position: number; timer: ReturnType<typeof setTimeout> }
  >();
  private now: () => number;
  constructor(
    readonly adapter: PlayerAdapter,
    private readonly options: EngineOptions,
  ) {
    this.now = options.now ?? (() => performance.now());
    this.visible = options.visible?.() ?? true;
    this.unsubscribe = adapter.on((event) => this.playerEvent(event));
  }
  private target(): number {
    return this.clamp(
      this.playback
        ? currentPosition(this.playback, this.options.clock.nowServer())
        : 0,
    );
  }
  private clamp(position: number): number {
    const duration = this.adapter.getDuration();
    return Math.max(
      0,
      Math.min(
        Number.isFinite(position) ? position : 0,
        Number.isFinite(duration) && duration > 0 ? duration : Infinity,
      ),
    );
  }
  private program(action: () => void) {
    this.ignoreUntil = this.now() + 600;
    this.applying = true;
    try {
      action();
    } catch {
      this.options.onError?.("Playback is unavailable. Try another video.");
    } finally {
      this.applying = false;
    }
  }
  private setRate(rate: number) {
    if (this.rate === rate) return;
    this.rate = rate;
    this.adapter.setRate(rate);
  }
  private publish(
    state: "synced" | "resyncing" | "offline" | "buffering",
    driftMs: number | null = null,
    correction = false,
  ) {
    this.options.store.update({
      state,
      driftMs,
      offsetMs: this.options.clock.offsetMs,
      rttMs: this.connected ? this.options.clock.rttMs : null,
      version: this.playback?.revision ?? -1,
      corrections: correction ? ++this.corrections : this.corrections,
    });
  }
  private corrections = 0;
  private time() {
    this.options.onTime?.(this.adapter.getTime(), this.adapter.getDuration());
  }
  private schedule() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (
      this.connected &&
      this.visible &&
      this.playback?.playing &&
      !this.disposed
    )
      this.timer = setInterval(() => this.tick(), 1000);
  }
  setContext(host: boolean, connected: boolean) {
    const changed = this.connected !== connected;
    this.host = host;
    this.connected = connected;
    if (!host || !connected) this.cancelCommands();
    if (!connected) {
      this.pause();
      this.setRate(1);
      this.publish("offline");
    } else if (changed) this.resync();
    this.schedule();
  }
  receive(playback: Playback): boolean {
    if (
      this.disposed ||
      (this.playback && playback.revision <= this.playback.revision)
    )
      return false;
    this.playback = { ...playback };
    this.consecutiveOver = 0;
    this.nudging = false;
    this.resync();
    this.schedule();
    return true;
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    if (!visible) {
      this.consecutiveOver = 0;
      this.setRate(1);
    }
    this.schedule();
  }
  resync() {
    if (this.disposed || !this.playback || !this.connected) return;
    const target = this.target();
    const drift = target - this.adapter.getTime();
    if (this.visible && Math.abs(drift) > 0.05) {
      this.program(() => this.adapter.seek(target));
      this.corrections++;
      this.lastCorrection = this.now();
    }
    this.setRate(1);
    this.nudging = false;
    this.consecutiveOver = 0;
    if (this.playback.playing) this.play();
    else this.pause();
    this.publish(
      this.blocked || this.adapter.isBuffering() ? "buffering" : "synced",
      this.blocked ? null : drift * 1000,
    );
    this.time();
  }
  private pause() {
    this.playGeneration++;
    this.playPending = false;
    this.program(() => this.adapter.pause());
  }
  private play() {
    if (this.blocked || this.playPending) return;
    this.playPending = true;
    const generation = ++this.playGeneration;
    this.program(() => {
      try {
        const operation = this.adapter.play();
        void Promise.resolve(operation).then(
          () => {
            if (generation === this.playGeneration) this.playPending = false;
          },
          (error: unknown) => {
            if (this.disposed || generation !== this.playGeneration) return;
            this.playPending = false;
            if (error instanceof Error && error.name === "AbortError") return;
            this.autoplayBlocked();
          },
        );
      } catch {
        this.playPending = false;
        this.autoplayBlocked();
      }
    });
  }
  autoplayBlocked() {
    if (this.disposed || this.blocked) return;
    this.blocked = true;
    this.options.onBlocked?.(true);
    this.publish("buffering");
  }
  gesture() {
    if (this.disposed) return;
    this.blocked = false;
    this.options.onBlocked?.(false);
    this.resync();
  }
  tick() {
    if (
      !this.connected ||
      !this.visible ||
      !this.playback?.playing ||
      this.disposed
    )
      return;
    this.time();
    if (this.blocked || this.adapter.isBuffering()) {
      this.consecutiveOver = 0;
      this.publish("buffering");
      return;
    }
    if (this.adapter.isPlaying?.() === false) this.play();
    const target = this.target();
    const driftSec = this.adapter.getTime() - target;
    const threshold =
      this.adapter.provider === "youtube" ? 0.6 : this.nudging ? 0.05 : 0.12;
    const over =
      this.adapter.provider === "youtube"
        ? Math.abs(driftSec) > threshold
        : Math.abs(driftSec) >= threshold;
    this.consecutiveOver = over ? this.consecutiveOver + 1 : 0;
    const fix = computeCorrection({
      driftSec,
      provider: this.adapter.provider,
      nowMs: this.now(),
      lastCorrectionMs: this.lastCorrection,
      consecutiveOver: this.consecutiveOver,
      targetSec: target,
      nudging: this.nudging,
    });
    if (fix.action === "seek") {
      this.program(() => this.adapter.seek(fix.seekTo));
      this.lastCorrection = this.now();
      this.consecutiveOver = 0;
      this.nudging = false;
      this.setRate(1);
    } else {
      this.setRate(fix.rate);
      this.nudging = fix.action === "rate";
    }
    this.publish(
      over || fix.action !== "none" ? "resyncing" : "synced",
      -driftSec * 1000,
      fix.action === "seek",
    );
  }
  command(action: Action, position = this.adapter.getTime()): boolean {
    if (!this.host || !this.connected || !this.playback || this.disposed)
      return false;
    if (action !== "seek" && this.trailing.has("seek")) {
      this.afterSeek = action;
      return true;
    }
    const bounded = this.clamp(position);
    const remaining =
      150 - (this.now() - (this.sentAt.get(action) ?? -Infinity));
    if (remaining <= 0) {
      const pending = this.trailing.get(action);
      if (pending) clearTimeout(pending.timer);
      this.trailing.delete(action);
      this.sentAt.set(action, this.now());
      this.options.send(action, bounded);
      if (action === "seek" && this.afterSeek) {
        const after = this.afterSeek;
        this.afterSeek = undefined;
        this.command(after, bounded);
      }
    } else {
      const pending = this.trailing.get(action);
      if (pending) pending.position = bounded;
      else {
        const next = {
          position: bounded,
          timer: setTimeout(() => {
            this.trailing.delete(action);
            if (this.host && this.connected && !this.disposed) {
              this.sentAt.set(action, this.now());
              this.options.send(action, this.clamp(next.position));
              if (action === "seek" && this.afterSeek) {
                const after = this.afterSeek;
                this.afterSeek = undefined;
                this.command(after, next.position);
              }
            }
          }, remaining),
        };
        this.trailing.set(action, next);
      }
    }
    return true;
  }
  private playerEvent(event: AdapterEvent) {
    if (this.disposed) return;
    if (event.type === "error") {
      this.options.onError?.(event.message);
      return;
    }
    this.time();
    if (event.type === "buffering") {
      if (this.playback && this.connected)
        this.publish(
          this.blocked || this.adapter.isBuffering() ? "buffering" : "synced",
        );
      return;
    }
    if (this.applying || !this.playback || !this.connected) return;
    const action = event.type === "ended" ? "pause" : event.action;
    if (this.now() < this.ignoreUntil) {
      // A guest's native seek never gains authority, including inside the echo window.
      if (
        !this.host &&
        action === "seek" &&
        Math.abs(this.target() - this.adapter.getTime()) > 0.15
      ) {
        if (this.verify) clearTimeout(this.verify);
        this.verify = setTimeout(
          () => this.resync(),
          Math.max(0, this.ignoreUntil - this.now()),
        );
      }
      return;
    }
    if (
      event.type === "state" &&
      ((action === "play" && this.playback.playing) ||
        (action === "pause" && !this.playback.playing))
    )
      return;
    if (
      action === "seek" &&
      Math.abs(this.target() - this.adapter.getTime()) < 0.05
    )
      return;
    if (this.host) this.command(action);
    else this.resync();
  }
  private cancelCommands() {
    for (const pending of this.trailing.values()) clearTimeout(pending.timer);
    this.trailing.clear();
    this.afterSeek = undefined;
  }
  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    if (this.verify) clearTimeout(this.verify);
    this.cancelCommands();
    this.unsubscribe();
    this.setRate(1);
  }
}
