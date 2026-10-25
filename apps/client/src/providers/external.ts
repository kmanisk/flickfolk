import { mediaCapabilities, type Media } from "@watchparty/shared";
import type { AdapterEvent, PlayerAdapter } from "../lib/playerAdapter.js";
import { assertActive, iframe, loadScript } from "./sdk.js";
interface TwitchPlayer {
  play(): void;
  pause(): void;
  destroy?(): void;
  seek(time: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPaused(): boolean;
  getVolume(): number;
  setVolume(value: number): void;
  setMuted(value: boolean): void;
  addEventListener(event: string, callback: () => void): void;
  removeEventListener(event: string, callback: () => void): void;
}
interface TwitchSDK {
  Player: (new (
    element: string,
    options: Record<string, unknown>,
  ) => TwitchPlayer) &
    Record<
      | "READY"
      | "PLAY"
      | "PLAYING"
      | "PAUSE"
      | "SEEK"
      | "ENDED"
      | "OFFLINE"
      | "PLAYBACK_BLOCKED",
      string
    >;
}
interface Sound {
  duration: number;
}
interface Widget {
  bind(
    event: string,
    listener: (data?: { currentPosition?: number }) => void,
  ): void;
  unbind(event: string): void;
  play(): void;
  pause(): void;
  seekTo(ms: number): void;
  skip(index: number): void;
  getPosition(callback: (ms: number) => void): void;
  getDuration(callback: (ms: number) => void): void;
  getSounds(callback: (sounds: Sound[]) => void): void;
  getCurrentSoundIndex(callback: (index: number) => void): void;
  getVolume(callback: (value: number) => void): void;
  setVolume(value: number): void;
}
interface SoundCloudSDK {
  Widget: ((frame: HTMLIFrameElement) => Widget) & {
    Events: Record<
      | "READY"
      | "PLAY"
      | "PAUSE"
      | "PLAY_PROGRESS"
      | "SEEK"
      | "FINISH"
      | "ERROR",
      string
    >;
  };
}
declare global {
  interface Window {
    Twitch?: TwitchSDK;
    SC?: SoundCloudSDK;
  }
}
let embedSequence = 0;
export interface ExternalPlayer {
  adapter: PlayerAdapter;
  dispose(): void;
}
export async function createExternalPlayer(
  media: Media,
  element: HTMLElement,
  signal: AbortSignal,
): Promise<ExternalPlayer> {
  const caps = mediaCapabilities(media);
  const listeners = new Set<(event: AdapterEvent) => void>();
  const cleanups: (() => void)[] = [];
  const emit = (event: AdapterEvent) => {
    if (!signal.aborted) listeners.forEach((fn) => fn(event));
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    cleanups.splice(0).forEach((fn) => fn());
    element.replaceChildren();
    signal.removeEventListener("abort", dispose);
  };
  signal.addEventListener("abort", dispose, { once: true });
  let time = Number.NaN,
    length = 0,
    playing = false,
    buffering = false,
    volume = 1,
    muted = false;
  const adapter: PlayerAdapter = {
    ...caps,
    play() {},
    pause() {},
    seek() {},
    getTime: () => time,
    getDuration: () => length,
    setRate() {},
    isBuffering: () => buffering,
    isPlaying: () => playing,
    on: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  const state = (next: boolean) => {
    playing = next;
    emit({ type: "state", action: next ? "play" : "pause" });
  };
  function ready(
    setup: (resolve: () => void, reject: (error: Error) => void) => void,
  ) {
    return new Promise<void>((resolve, reject) => {
      let done = false;
      const cancelled = () =>
        finish(new DOMException("Source changed", "AbortError"));
      const timer = setTimeout(
        () =>
          finish(
            new Error("This source is unavailable or cannot be embedded."),
          ),
        15000,
      );
      function finish(error?: Error) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", cancelled);
        if (error) reject(error);
        else resolve();
      }
      signal.addEventListener("abort", cancelled, { once: true });
      try {
        setup(
          () => finish(),
          (error) => finish(error),
        );
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error("Provider initialization failed."),
        );
      }
    });
  }

  try {
    assertActive(signal);
    if (media.kind === "kick") {
      const frame = iframe(
        element,
        `https://player.kick.com/${encodeURIComponent(media.id)}?autoplay=false`,
        "Kick livestream",
      );
      await ready((resolve, reject) => {
        frame.onload = resolve;
        frame.onerror = () => reject(new Error("Kick could not load."));
      });
    } else if (media.kind === "twitch") {
      await loadScript("https://player.twitch.tv/js/embed/v1.js");
      assertActive(signal);
      if (!window.Twitch) throw new Error("Twitch API unavailable.");
      const SDK = window.Twitch;
      const target = document.createElement("div");
      target.id = `flickfolk-player-${++embedSequence}`;
      element.replaceChildren(target);
      const player = new SDK.Player(target.id, {
        width: "100%",
        height: "100%",
        autoplay: false,
        parent: [location.hostname],
        ...(media.live ? { channel: media.id } : { video: media.id }),
      });
      const frame = target.querySelector("iframe");
      if (frame) frame.allow = `${frame.allow}; keyboard-map 'src'`;
      cleanups.push(() => {
        try {
          player.pause();
          player.destroy?.();
        } catch {
          /* Frame may already be gone. */
        }
      });
      adapter.play = () => player.play();
      adapter.pause = () => player.pause();
      adapter.seek = (value) => {
        if (caps.canSeek) player.seek(value);
      };
      adapter.getTime = () =>
        caps.canReadPosition ? player.getCurrentTime() : 0;
      adapter.getDuration = () =>
        caps.canReadDuration ? player.getDuration() : 0;
      adapter.isPlaying = () => !player.isPaused();
      adapter.getVolume = () => player.getVolume();
      adapter.setVolume = (value) => player.setVolume(value);
      adapter.setMuted = (value) => player.setMuted(value);
      const bind = (event: string, callback: () => void) => {
        player.addEventListener(event, callback);
        cleanups.push(() => player.removeEventListener(event, callback));
      };
      await ready((resolve, reject) => {
        bind(SDK.Player.READY, resolve);
        bind(SDK.Player.PLAY, () => {
          buffering = true;
          emit({ type: "buffering" });
        });
        bind(SDK.Player.PLAYING, () => {
          buffering = false;
          state(true);
        });
        bind(SDK.Player.PAUSE, () => state(false));
        bind(SDK.Player.SEEK, () => {
          if (caps.canSeek) emit({ type: "state", action: "seek" });
        });
        bind(SDK.Player.ENDED, () => emit({ type: "ended" }));
        bind(SDK.Player.PLAYBACK_BLOCKED, () => emit({ type: "blocked" }));
        bind(SDK.Player.OFFLINE, () => {
          const error = new Error("This Twitch channel is offline.");
          reject(error);
          emit({ type: "error", message: error.message });
        });
      });
    } else if (media.kind === "soundcloud") {
      await loadScript("https://w.soundcloud.com/player/api.js");
      assertActive(signal);
      if (!window.SC) throw new Error("SoundCloud API unavailable.");
      const frame = iframe(
        element,
        `https://w.soundcloud.com/player/?url=${encodeURIComponent(media.url)}&auto_play=false&show_user=true&show_artwork=true&single_active=false&color=%23ff7a59`,
        "SoundCloud player",
      );
      const widget = window.SC.Widget(frame),
        events = window.SC.Widget.Events;
      let wantPlaying = false;
      let index = 0,
        local = Number.NaN,
        durations: number[] = [];
      const offset = (i: number) =>
        durations.slice(0, i).reduce((a, b) => a + b, 0);
      const update = () => {
        time = offset(index) + local;
      };
      let pendingSeek: { index: number; position: number } | null = null;
      let nativeTrackChange: number | null = null;
      const selected = () =>
        widget.getCurrentSoundIndex((next) => {
          const changed = next !== index;
          const before = time;
          const requested = pendingSeek !== null;
          index = next;
          if (pendingSeek && next === pendingSeek.index) {
            const target = pendingSeek.position;
            pendingSeek = null;
            local = Number.NaN;
            widget.seekTo(target * 1000);
            if (!wantPlaying) widget.pause();
          } else if (changed) local = Number.NaN;
          update();
          if (changed && !requested && Number.isFinite(before))
            nativeTrackChange = before;
        });
      const bind = (
        event: string,
        callback: (data?: { currentPosition?: number }) => void,
      ) => {
        widget.bind(event, callback);
        cleanups.push(() => widget.unbind(event));
      };
      adapter.play = () => {
        wantPlaying = true;
        widget.play();
      };
      adapter.pause = () => {
        wantPlaying = false;
        widget.pause();
      };
      adapter.seek = (value) => {
        let target = 0;
        while (
          target < durations.length - 1 &&
          value >= offset(target) + durations[target]!
        )
          target++;
        const position = Math.max(0, value - offset(target));
        if (target !== index) {
          pendingSeek = { index: target, position };
          widget.skip(target);
        } else widget.seekTo(position * 1000);
      };
      adapter.getVolume = () => {
        widget.getVolume((value) => {
          if (!muted && Number.isFinite(value))
            volume = Math.max(0, Math.min(1, value / 100));
        });
        return volume;
      };
      adapter.setVolume = (value) => {
        volume = value;
        widget.setVolume(muted ? 0 : value * 100);
      };
      adapter.setMuted = (value) => {
        muted = value;
        widget.setVolume(muted ? 0 : volume * 100);
      };
      cleanups.push(() => widget.pause());
      await ready((resolve, reject) => {
        bind(events.READY, () => {
          widget.getSounds((sounds) => {
            if (
              !Array.isArray(sounds) ||
              !sounds.length ||
              sounds.some((sound) => !sound || !Number.isFinite(sound.duration))
            ) {
              reject(
                new Error(
                  "This SoundCloud source does not expose a playable timeline. Try another track.",
                ),
              );
              return;
            }
            durations = sounds.map((s) =>
              Number.isFinite(s.duration) ? Math.max(0, s.duration / 1000) : 0,
            );
            length = durations.reduce((a, b) => a + b, 0);
            if (
              durations.length > 1 &&
              durations.some((duration) => duration <= 0)
            ) {
              reject(
                new Error(
                  "This playlist does not expose a complete playable timeline. Try a track link.",
                ),
              );
              return;
            }
            if (!length)
              widget.getDuration((ms) => {
                length = ms / 1000;
              });
            selected();
            widget.getPosition((ms) => {
              if (!Number.isFinite(ms)) return;
              local = ms / 1000;
              update();
              emit({ type: "position" });
            });
            widget.getVolume((value) => {
              volume = value / 100;
              resolve();
            });
          });
        });
        bind(events.PLAY, () => {
          selected();
          state(true);
        });
        bind(events.PAUSE, () => state(false));
        bind(events.PLAY_PROGRESS, (data) => {
          if (typeof data?.currentPosition === "number") {
            local = data.currentPosition / 1000;
            update();
            if (
              nativeTrackChange !== null &&
              Math.abs(time - nativeTrackChange) > 0.5
            )
              emit({ type: "state", action: "seek" });
            nativeTrackChange = null;
            emit({ type: "position" });
          }
        });
        bind(events.SEEK, (data) => {
          if (typeof data?.currentPosition === "number")
            local = data.currentPosition / 1000;
          update();
          emit({ type: "state", action: "seek" });
        });
        bind(events.FINISH, () => {
          if (index >= durations.length - 1) {
            playing = false;
            emit({ type: "ended" });
          } else selected();
        });
        bind(events.ERROR, () => {
          const error = new Error(
            "This SoundCloud source is unavailable or cannot be embedded.",
          );
          reject(error);
          emit({ type: "error", message: error.message });
        });
      });
    } else if (media.kind === "spotify") {
      const frame = iframe(
        element,
        `/spotify-bridge.html#${encodeURIComponent(media.id)}`,
        "Spotify player",
      );
      const channel = new MessageChannel();
      const waiting = new Set<{
        resolve: () => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }>();
      let measuredAt = performance.now();
      let cancelPending = false;
      let hasPlayed = false;
      let pendingPosition: number | undefined;
      const send = (action: string, position?: number) =>
        channel.port1.postMessage({ action, position });
      cleanups.push(() => {
        send("dispose");
        channel.port1.close();
        channel.port2.close();
        for (const task of waiting) {
          clearTimeout(task.timer);
          task.reject(new DOMException("Source changed", "AbortError"));
        }
        waiting.clear();
      });
      await ready((resolve, reject) => {
        frame.onload = () => {
          frame.onload = null;
          frame.contentWindow?.postMessage(
            "flickfolk:spotify:init",
            location.origin,
            [channel.port2],
          );
        };
        channel.port1.onmessage = ({ data }: MessageEvent<unknown>) => {
          if (!data || typeof data !== "object" || !("type" in data)) return;
          if (data.type === "ready") {
            resolve();
            return;
          }
          if (data.type === "error") {
            const error = new Error(
              "Spotify is unavailable or restricted by your browser/account. Try another source.",
            );
            reject(error);
            emit({ type: "error", message: error.message });
            return;
          }
          if (
            data.type !== "update" ||
            !("position" in data) ||
            !("duration" in data) ||
            !("playing" in data) ||
            !("buffering" in data) ||
            typeof data.position !== "number" ||
            typeof data.duration !== "number" ||
            !Number.isFinite(data.position) ||
            !Number.isFinite(data.duration)
          )
            return;
          const observed = Math.max(0, data.position);
          const expected =
            time +
            (playing && !buffering
              ? (performance.now() - measuredAt) / 1000
              : 0);
          const jumped = caps.canSeek && Math.abs(observed - expected) > 1;
          measuredAt = performance.now();
          time = observed;
          length = Math.max(0, data.duration);
          buffering = Boolean(data.buffering);
          if (data.playing && !buffering) hasPlayed = true;
          emit({ type: "position" });
          if (data.playing && cancelPending) {
            cancelPending = false;
            send("pause");
            return;
          }
          state(Boolean(data.playing));
          if (hasPlayed && pendingPosition !== undefined) {
            const target = pendingPosition;
            pendingPosition = undefined;
            send("seek", target);
          }
          if (jumped) emit({ type: "state", action: "seek" });
          if (playing && !buffering)
            for (const task of waiting) {
              clearTimeout(task.timer);
              task.resolve();
              waiting.delete(task);
            }
        };
      });
      adapter.play = () =>
        new Promise<void>((resolve, reject) => {
          if (playing) {
            resolve();
            return;
          }
          const task = {
            resolve,
            reject,
            timer: setTimeout(() => {
              waiting.delete(task);
              reject(
                new DOMException(
                  "Tap the Spotify player to enable playback. Your account or browser may restrict this source.",
                  "NotAllowedError",
                ),
              );
            }, 4000),
          };
          waiting.add(task);
          cancelPending = false;
          send("play");
        });
      adapter.pause = () => {
        // Pausing an unloaded Spotify entity throws inside its frame. Do not send
        // a redundant initial pause; cancel an in-flight play once it starts.
        if (waiting.size && !playing) cancelPending = true;
        for (const task of waiting) {
          clearTimeout(task.timer);
          task.reject(new DOMException("Playback paused", "AbortError"));
        }
        waiting.clear();
        if (playing) send("pause");
      };
      adapter.seek = (value) => {
        if (!caps.canSeek) return;
        if (!hasPlayed) pendingPosition = Math.floor(value);
        else send("seek", Math.floor(value));
      };
    } else throw new Error("Unsupported provider.");
    assertActive(signal);
    return { adapter, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
