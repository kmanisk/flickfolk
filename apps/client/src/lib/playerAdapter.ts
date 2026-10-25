import type { Action } from "@watchparty/shared";
export type AdapterEvent =
  | { type: "state"; action: Action }
  | { type: "buffering" }
  | { type: "ended" }
  | { type: "error"; message: string };
export interface PlayerAdapter {
  provider: "file" | "youtube";
  play(): void | Promise<void>;
  pause(): void;
  seek(position: number): void;
  getTime(): number;
  getDuration(): number;
  setRate(rate: number): void;
  isBuffering(): boolean;
  isPlaying?(): boolean;
  on(listener: (event: AdapterEvent) => void): () => void;
}
export function html5Adapter(video: HTMLVideoElement): PlayerAdapter {
  return {
    provider: "file",
    play: () => video.play(),
    pause: () => video.pause(),
    seek: (time) => {
      video.currentTime = time;
    },
    getTime: () => video.currentTime,
    getDuration: () => video.duration,
    setRate: (rate) => {
      if (video.playbackRate !== rate) video.playbackRate = rate;
    },
    isPlaying: () => !video.paused && !video.ended,
    isBuffering: () => video.seeking || video.readyState < 3,
    on: (listener) => {
      const events: Record<string, () => void> = {
        play: () => listener({ type: "state", action: "play" }),
        pause: () => listener({ type: "state", action: "pause" }),
        seeked: () => listener({ type: "state", action: "seek" }),
        waiting: () => listener({ type: "buffering" }),
        playing: () => listener({ type: "buffering" }),
        canplay: () => listener({ type: "buffering" }),
        ended: () => listener({ type: "ended" }),
        error: () =>
          listener({
            type: "error",
            message:
              "Video could not load. Check the URL, codec and server access.",
          }),
      };
      for (const [event, handler] of Object.entries(events))
        video.addEventListener(event, handler);
      return () => {
        for (const [event, handler] of Object.entries(events))
          video.removeEventListener(event, handler);
      };
    },
  };
}
// YouTube has discrete rates: correction never requests fractional nudges.
export function youtubeAdapter(player: YT.Player): PlayerAdapter {
  return {
    provider: "youtube",
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    seek: (time) => player.seekTo(time, true),
    getTime: () => player.getCurrentTime(),
    getDuration: () => player.getDuration(),
    setRate: (rate) => {
      if (player.getPlaybackRate() !== rate) player.setPlaybackRate(rate);
    },
    isBuffering: () => player.getPlayerState() === 3,
    isPlaying: () => player.getPlayerState() === 1,
    on: (listener) => {
      const state = (event: YT.OnStateChangeEvent) => {
        if (event.data === 0) listener({ type: "ended" });
        else if (event.data === 1 || event.data === 2)
          listener({
            type: "state",
            action: event.data === 1 ? "play" : "pause",
          });
        listener({ type: "buffering" });
      };
      player.addEventListener("onStateChange", state);
      return () => player.removeEventListener("onStateChange", state);
    },
  };
}
