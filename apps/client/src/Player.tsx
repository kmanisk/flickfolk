import { PlaybackEngine } from "./lib/playbackEngine.js";
import { html5Adapter, youtubeAdapter } from "./lib/playerAdapter.js";
import { clockSync, syncStore, subscribeResync } from "./lib/syncRuntime.js";
import { ActiveSpeakers, type Speaker } from "./ActiveSpeakers.js";
import type { AudioLevels } from "./AudioLevels.js";
import { useEffect, useRef, useState } from "react";
import { ReactionOverlay } from "./ReactionOverlay.js";
import { useDucking } from "./useDucking.js";
import type { VisibleReaction } from "./useReactions.js";
import {
  Film,
  Maximize,
  Minimize,
  Pause,
  Play,
  SmilePlus,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button, IconButton } from "./ui/index.js";
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
  control,
  onMetrics,
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
  control: (action: Action, position: number) => void;
  onMetrics: (metrics: PlaybackMetrics) => void;
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
  const [controlsVisible, setControlsVisible] = useState(true);
  const [reactionOpen, setReactionOpen] = useState(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const interacting = useRef(false);
  function showControls() {
    setControlsVisible(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (latest.current.playing)
      controlsTimer.current = setTimeout(() => {
        if (!interacting.current) setControlsVisible(false);
      }, 2500);
  }
  useEffect(() => {
    showControls();
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [playback.playing]);
  const report = useRef(onMetrics);
  report.current = onMetrics;
  const video = useRef<HTMLVideoElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const yt = useRef<YT.Player | null>(null);
  const engine = useRef<PlaybackEngine | null>(null);
  const position = useRef(0);
  const duration = useRef(0);
  const seeking = useRef(false);
  const seekInput = useRef<HTMLInputElement>(null);
  const currentTimeLabel = useRef<HTMLSpanElement>(null);
  const durationLabel = useRef<HTMLSpanElement>(null);
  const latest = useRef(playback);
  latest.current = playback;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
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
    setReady(false);
    setError("");
    setBlocked(false);
    position.current = 0;
    duration.current = 0;
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
            onAutoplayBlocked: () => {
              engine.current?.autoplayBlocked();
              setBlocked(true);
            },
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
  const latestControl = useRef(control);
  latestControl.current = control;
  function showTime(time: number, length: number) {
    volumeObserver.current();
    duration.current = Number.isFinite(length) ? length : 0;
    if (durationLabel.current)
      durationLabel.current.textContent = timestamp(duration.current);
    if (seeking.current) return;
    position.current = time;
    if (currentTimeLabel.current)
      currentTimeLabel.current.textContent = timestamp(time);
    if (seekInput.current) {
      seekInput.current.max = String(duration.current || Math.max(time, 1));
      seekInput.current.value = String(
        Math.min(time, duration.current || Math.max(time, 1)),
      );
    }
  }
  const presentTime = useRef(showTime);
  presentTime.current = showTime;
  useEffect(() => {
    if (!ready || error) return;
    const adapter = video.current
      ? html5Adapter(video.current)
      : yt.current
        ? youtubeAdapter(yt.current)
        : null;
    if (!adapter) return;
    const next = new PlaybackEngine(adapter, {
      clock: clockSync,
      store: syncStore,
      visible: () => !document.hidden,
      send: (action, target) => latestControl.current(action, target),
      onTime: (time, length) => presentTime.current(time, length),
      onBlocked: setBlocked,
      onError: setError,
    });
    engine.current = next;
    next.setContext(host, connected);
    next.receive(latest.current);
    const visibility = () => {
      next.setVisible(!document.hidden);
      if (!document.hidden) next.resync();
    };
    document.addEventListener("visibilitychange", visibility);
    const unsubscribe = subscribeResync(() => next.resync());
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      next.dispose();
      if (engine.current === next) engine.current = null;
    };
  }, [ready, error, media?.id]);
  useEffect(() => {
    engine.current?.setContext(host, connected);
  }, [host, connected]);
  useEffect(() => {
    engine.current?.receive(playback);
  }, [playback]);
  function issue(action: Action, target: number) {
    const accepted =
      action === "seek"
        ? engine.current?.command(action, target)
        : engine.current?.command(action);
    if (accepted && action === "seek") {
      position.current = target;
      if (currentTimeLabel.current)
        currentTimeLabel.current.textContent = timestamp(target);
    }
  }
  function commitSeek() {
    if (!seeking.current) return;
    seeking.current = false;
    issue("seek", Number(seekInput.current?.value ?? position.current));
  }
  const commands = useRef({
    host,
    connected,
    ready,
    playback,
    position: position.current,
    control: issue,
  });
  commands.current = {
    host,
    connected,
    ready: ready && !error,
    playback,
    position: position.current,
    control: issue,
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
          position.current,
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
          position.current + (event.key.toLowerCase() === "j" ? -10 : 10),
        );
        const next =
          localDuration > 0 ? Math.min(target, localDuration) : target;
        position.current = next;
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
    engine.current?.gesture();
  }
  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (video.current) video.current.muted = next;
    if (next) yt.current?.mute();
    else yt.current?.unMute();
  }
  return (
    <div
      className={`player-shell ${effects ? "fx-on" : "fx-off"} ${controlsVisible || !playback.playing ? "controls-visible" : ""}`}
      ref={shell}
      onPointerEnter={showControls}
      onPointerMove={showControls}
      onPointerDown={showControls}
      onFocusCapture={() => {
        interacting.current = true;
        showControls();
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          interacting.current = false;
          showControls();
        }
      }}
    >
      <div className="screen">
        {!media ? (
          <div className="empty-player">
            <Film aria-hidden="true" />
            <span>
              {host
                ? "Pick a video. Make it a night."
                : "Your host is choosing a video."}
            </span>
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
          <Button className="player-notice enable" onClick={enable}>
            Click to enable playback
          </Button>
        )}
      </div>
      <div className={`stage-reaction-tools ${reactionOpen ? "is-open" : ""}`}>
        <IconButton
          className="mobile-reaction-toggle"
          aria-label="Reactions"
          aria-expanded={reactionOpen}
          onClick={() => setReactionOpen((value) => !value)}
        >
          <SmilePlus aria-hidden="true" />
        </IconButton>
        <div className="fullscreen-reactions" aria-label="Fullscreen reactions">
          {REACTIONS.map((symbol, index) => (
            <Button
              variant="ghost"
              key={symbol}
              aria-label={`React ${["heart", "laugh", "surprise", "cry", "applause", "fire"][index]}`}
              disabled={!connected}
              onClick={() => {
                onReaction(symbol);
                setReactionOpen(false);
              }}
            >
              {symbol}
            </Button>
          ))}
        </div>
      </div>
      <div
        className="player-controls"
        onPointerEnter={() => {
          interacting.current = true;
          showControls();
        }}
        onPointerLeave={() => {
          interacting.current = false;
          showControls();
        }}
      >
        <IconButton
          className="icon-button"
          aria-label={playback.playing ? "Pause" : "Play"}
          disabled={!host || !connected || !media || !ready || !!error}
          onClick={() =>
            issue(playback.playing ? "pause" : "play", position.current)
          }
        >
          {playback.playing ? (
            <Pause aria-hidden="true" fill="currentColor" />
          ) : (
            <Play aria-hidden="true" fill="currentColor" />
          )}
        </IconButton>
        <span className="time" ref={currentTimeLabel}>
          0:00
        </span>
        <input
          aria-label="Seek video"
          type="range"
          min="0"
          ref={seekInput}
          max="1"
          step="0.1"
          defaultValue="0"
          disabled={!host || !connected || !media || !ready || !!error}
          onPointerDown={(event) => {
            seeking.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={commitSeek}
          onPointerCancel={() => {
            seeking.current = false;
            engine.current?.resync();
          }}
          onBlur={commitSeek}
          onKeyUp={(event) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "Home",
                "End",
                "PageUp",
                "PageDown",
              ].includes(event.key)
            )
              commitSeek();
          }}
          onChange={(event) => {
            seeking.current = true;
            if (currentTimeLabel.current)
              currentTimeLabel.current.textContent = timestamp(
                Number(event.target.value),
              );
          }}
        />
        <span className="time" ref={durationLabel}>
          0:00
        </span>
        <IconButton
          className="icon-button"
          aria-label={muted ? "Unmute" : "Mute"}
          onClick={toggleMute}
          disabled={!media}
        >
          {muted ? (
            <VolumeX aria-hidden="true" />
          ) : (
            <Volume2 aria-hidden="true" />
          )}
        </IconButton>
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
        <IconButton
          className="icon-button fullscreen"
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen player"}
          aria-pressed={isFullscreen}
          title={isFullscreen ? "Exit fullscreen (F or Esc)" : "Fullscreen (F)"}
          onClick={fullscreen}
        >
          {isFullscreen ? (
            <Minimize aria-hidden="true" />
          ) : (
            <Maximize aria-hidden="true" />
          )}
        </IconButton>
      </div>
    </div>
  );
}
