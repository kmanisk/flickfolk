import { ActiveSpeakers, type Speaker } from "./ActiveSpeakers.js";
import type { AudioLevels } from "./AudioLevels.js";
import { useEffect, useRef, useState } from "react";
import { ReactionOverlay } from "./ReactionOverlay.js";
import { useDucking } from "./useDucking.js";
import type { VisibleReaction } from "./useReactions.js";
import { TestCard } from "./TestCard.js";
export interface PlaybackMetrics {
  driftMs: number | null;
  state:
    | "waiting"
    | "loading"
    | "synced"
    | "correcting"
    | "paused"
    | "blocked"
    | "error";
}
import {
  correction,
  currentPosition,
  type Action,
  type Playback,
  type ReactionSymbol,
  REACTIONS,
} from "@watchparty/shared";
declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let youtubeReady: Promise<void> | undefined;
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve();
  return (youtubeReady ??= new Promise<void>((resolve, reject) => {
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      youtubeReady = undefined;
      reject(new Error("YouTube could not load. Check your connection."));
    };
    document.head.append(script);
  }));
}
export function timestamp(value: number) {
  const s = Math.max(0, Math.floor(value));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function Player({
  playback,
  host,
  connected,
  offset,
  control,
  onMetrics,
  channel,
  reactions,
  onReactionEnd,
  remoteSpeaking,
  ducking,
  speakers,
  levels,
  onReaction,
  effects,
}: {
  playback: Playback;
  host: boolean;
  connected: boolean;
  offset: React.RefObject<number>;
  control: (action: Action, position: number) => void;
  onMetrics: (metrics: PlaybackMetrics) => void;
  channel: string;
  reactions: VisibleReaction[];
  onReactionEnd: (id: string) => void;
  remoteSpeaking: boolean;
  ducking: boolean;
  speakers: Speaker[];
  levels: AudioLevels;
  onReaction: (symbol: ReactionSymbol) => void;
  effects: boolean;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const report = useRef(onMetrics);
  report.current = onMetrics;
  const video = useRef<HTMLVideoElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const yt = useRef<YT.Player | null>(null);
  const initiallyAligned = useRef(false);
  const latest = useRef(playback);
  latest.current = playback;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const media = playback.media;
  const volume = useDucking(
    video,
    yt,
    ready,
    media?.id,
    remoteSpeaking,
    ducking,
    muted,
  );
  const volumeObserver = useRef(volume.observe);
  volumeObserver.current = volume.observe;
  useEffect(() => {
    initiallyAligned.current = false;
    setReady(false);
    setError("");
    setBlocked(false);
    setPosition(0);
    setDuration(0);
    if (media?.kind !== "youtube") return;
    let disposed = false;
    void loadYouTube()
      .then(() => {
        if (disposed || !mount.current || !window.YT) return;
        const target = document.createElement("div");
        mount.current.replaceChildren(target);
        yt.current = new window.YT.Player(target, {
          videoId: media.id,
          width: "100%",
          height: "100%",
          playerVars: {
            controls: 0,
            disablekb: 1,
            playsinline: 1,
            origin: location.origin,
            rel: 0,
          },
          events: {
            onReady: () => {
              if (!disposed) setReady(true);
            },
            onError: () =>
              setError(
                "This YouTube video cannot be embedded. Try another video.",
              ),
            onAutoplayBlocked: () => setBlocked(true),
          },
        });
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      disposed = true;
      yt.current?.destroy();
      yt.current = null;
    };
  }, [media?.kind, media?.id]);
  useEffect(() => {
    report.current({
      driftMs: null,
      state: error
        ? "error"
        : blocked
          ? "blocked"
          : !media
            ? "waiting"
            : !ready
              ? "loading"
              : "synced",
    });
  }, [error, blocked, ready, media]);
  useEffect(() => {
    if (!connected) initiallyAligned.current = false;
    if (!ready || error) return;
    const sync = () => {
      volumeObserver.current();
      const state = latest.current;
      const playing = connected && state.playing;
      const target = currentPosition(state, Date.now() + offset.current);
      const v = video.current;
      const y = yt.current;
      const local = v?.currentTime ?? y?.getCurrentTime() ?? 0;
      const length = v?.duration ?? y?.getDuration() ?? 0;
      const bounded =
        Number.isFinite(length) && length > 0
          ? Math.min(target, length)
          : target;
      const fix = correction(local, bounded, playing);
      // A ready late joiner must land on the timeline immediately, even when
      // the initial offset is below the normal hard-seek threshold.
      if (connected && !blocked && !initiallyAligned.current && length > 0) {
        fix.seek = true;
        initiallyAligned.current = true;
      }
      const driftMs = (bounded - local) * 1000;
      report.current({
        driftMs: connected && !blocked ? driftMs : null,
        state: blocked
          ? "blocked"
          : Math.abs(driftMs) > 200
            ? "correcting"
            : playing
              ? "synced"
              : "paused",
      });
      if (v) {
        if (fix.seek) v.currentTime = bounded;
        v.playbackRate = fix.rate;
        if (playing && v.paused && !v.ended)
          void v
            .play()
            .then(() => setBlocked(false))
            .catch(() => setBlocked(true));
        if (!playing && !v.paused) v.pause();
      }
      if (y) {
        if (fix.seek) y.seekTo(bounded, true);
        const status = y.getPlayerState();
        if (playing && status !== 1 && status !== 3 && status !== 0)
          y.playVideo();
        if (!playing && status !== 2) y.pauseVideo();
      }
      setPosition(bounded);
      setDuration(Number.isFinite(length) ? length : 0);
    };
    sync();
    const timer = window.setInterval(sync, 500);
    return () => window.clearInterval(timer);
  }, [ready, playback.revision, connected, offset, error, blocked]);
  const commands = useRef({
    host,
    connected,
    ready,
    playback,
    position,
    control,
  });
  commands.current = {
    host,
    connected,
    ready: ready && !error,
    playback,
    position,
    control,
  };
  useEffect(() => {
    const changed = () =>
      setIsFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  function fullscreen() {
    const operation = document.fullscreenElement
      ? document.exitFullscreen?.()
      : shell.current?.requestFullscreen?.();
    void operation?.catch(() => {
      /* Fullscreen may be unavailable in an embedded browser. */
    });
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.fullscreenElement) {
        event.preventDefault();
        void document.exitFullscreen().catch(() => {});
        return;
      }
      if (
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
          ))
      )
        return;
      if (
        event.key === " " &&
        event.target instanceof Element &&
        event.target.closest("button, a")
      )
        return;
      const value = commands.current;
      if (
        (event.key === " " || event.key.toLowerCase() === "k") &&
        value.host &&
        value.connected &&
        value.ready &&
        value.playback.media
      ) {
        event.preventDefault();
        value.control(
          value.playback.playing ? "pause" : "play",
          value.position,
        );
      }
      if (
        ["j", "l"].includes(event.key.toLowerCase()) &&
        value.host &&
        value.connected &&
        value.ready &&
        value.playback.media
      ) {
        event.preventDefault();
        const localDuration =
          video.current?.duration ?? yt.current?.getDuration() ?? 0;
        const target = Math.max(
          0,
          value.position + (event.key.toLowerCase() === "j" ? -10 : 10),
        );
        const next =
          localDuration > 0 ? Math.min(target, localDuration) : target;
        setPosition(next);
        commands.current.position = next;
        value.control("seek", next);
      }
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        fullscreen();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function enable() {
    setBlocked(false);
    if (!latest.current.playing) return;
    void video.current?.play().catch(() => setBlocked(true));
    yt.current?.playVideo();
  }
  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (video.current) video.current.muted = next;
    if (next) yt.current?.mute();
    else yt.current?.unMute();
  }
  return (
    <div className={`player-shell ${effects ? "fx-on" : "fx-off"}`} ref={shell}>
      <div className="screen">
        {!media ? (
          <div className="empty-player">
            <TestCard
              channel={channel}
              caption={
                host
                  ? "PASTE A LINK TO SET THE SCENE"
                  : "YOUR HOST IS CHOOSING THE FEATURE"
              }
            />
          </div>
        ) : media.kind === "video" ? (
          <video
            ref={video}
            src={media.url}
            muted={muted}
            playsInline
            preload="auto"
            onLoadedMetadata={() => setReady(true)}
            onError={() =>
              setError(
                "Video could not load. Check the URL, codec and server access.",
              )
            }
          />
        ) : (
          <div className="youtube-mount" ref={mount} />
        )}
        <div
          className="screen-fx"
          key={`${media?.id ?? "empty"}-${ready}`}
          aria-hidden="true"
        />
        {media && (
          <div
            className="screen-flash"
            key={playback.revision}
            aria-hidden="true"
          />
        )}
        <ActiveSpeakers people={speakers} levels={levels} />
        <ReactionOverlay items={reactions} onDone={onReactionEnd} />
        {media?.kind === "youtube" && (
          <div className="youtube-shield" aria-hidden="true" />
        )}
        {media && !ready && !error && (
          <div className="player-notice">Loading your video…</div>
        )}
        {error && (
          <div className="player-notice" role="alert">
            {error}
          </div>
        )}
        {blocked && (
          <button className="player-notice enable" onClick={enable}>
            Click to enable playback
          </button>
        )}
      </div>
      {isFullscreen && (
        <div className="fullscreen-reactions" aria-label="Fullscreen reactions">
          {REACTIONS.map((symbol, index) => (
            <button
              key={symbol}
              aria-label={`React ${["heart", "laugh", "surprise", "cry", "applause", "fire"][index]}`}
              disabled={!connected}
              onClick={() => onReaction(symbol)}
            >
              {symbol}
            </button>
          ))}
        </div>
      )}
      <div className="player-controls">
        <button
          className="icon-button"
          aria-label={playback.playing ? "Pause" : "Play"}
          disabled={!host || !connected || !media || !ready || !!error}
          onClick={() => control(playback.playing ? "pause" : "play", position)}
        >
          {playback.playing ? "Ⅱ" : "▶"}
        </button>
        <span className="time">{timestamp(position)}</span>
        <input
          aria-label="Seek video"
          type="range"
          min="0"
          max={duration || Math.max(position, 1)}
          step="0.1"
          value={Math.min(position, duration || Math.max(position, 1))}
          disabled={!host || !connected || !media || !duration}
          onChange={(e) => {
            const target = Number(e.target.value);
            setPosition(target);
            control("seek", target);
          }}
        />
        <span className="time">{timestamp(duration)}</span>
        <button
          className="icon-button"
          aria-label={muted ? "Unmute" : "Mute"}
          onClick={toggleMute}
          disabled={!media}
        >
          {muted ? "◌" : "◖"}
        </button>
        <input
          className="media-volume"
          aria-label="Movie volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume.baseVolume}
          onChange={(event) => volume.choose(Number(event.target.value))}
          disabled={!media || !ready}
        />
        <button
          className="icon-button fullscreen"
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen player"}
          aria-pressed={isFullscreen}
          title={isFullscreen ? "Exit fullscreen (F or Esc)" : "Fullscreen (F)"}
          onClick={fullscreen}
        >
          {isFullscreen ? "⊡" : "⛶"}
        </button>
      </div>
    </div>
  );
}
