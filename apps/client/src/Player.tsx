import { registerShortcuts } from "./lib/shortcuts.js";
import { endedOverlayMode } from "./lib/playerUi.js";
import { PlaybackEngine } from "./lib/playbackEngine.js";
import {
  html5Adapter,
  youtubeAdapter,
  type PlayerAdapter,
} from "./lib/playerAdapter.js";
import { clockSync, syncStore, subscribeResync } from "./lib/syncRuntime.js";
import { ActiveSpeakers, type Speaker } from "./ActiveSpeakers.js";
import type { AudioLevels } from "./AudioLevels.js";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ReactionOverlay } from "./ReactionOverlay.js";
import { useDucking } from "./useDucking.js";
import type { VisibleReaction } from "./useReactions.js";
import {
  Captions,
  Film,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
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
  mediaCapabilities,
  PROVIDER_NAMES,
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
  onStarted,
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
  onStarted: () => void;
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
  const external = useRef<PlayerAdapter | null>(null);
  const externalMount = useRef<HTMLDivElement>(null);
  const started = useRef(onStarted);
  started.current = onStarted;
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
  const [ended, setEnded] = useState(false);
  const endMode = endedOverlayMode(ended, host);
  const media = playback.media;
  const caps = media ? mediaCapabilities(media) : null;
  const volume = useDucking(
    video,
    yt,
    ready,
    media?.id,
    remoteSpeaking,
    ducking,
    muted,
    external,
  );
  const volumeObserver = useRef(volume.observe);
  volumeObserver.current = volume.observe;
  useEffect(() => {
    setReady(false);
    setError("");
    setBlocked(false);
    setEnded(false);
    position.current = 0;
    duration.current = 0;
    if (currentTimeLabel.current)
      currentTimeLabel.current.textContent = "--:--";
    if (durationLabel.current) durationLabel.current.textContent = "--:--";
    if (seekInput.current) {
      seekInput.current.value = "0";
      seekInput.current.style.setProperty("--progress", "0%");
    }
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
            fs: 0,
            iv_load_policy: 3,
            cc_load_policy: 1,
            playsinline: 1,
            origin: location.origin,
            rel: 0,
          },
          events: {
            onStateChange: (event) => {
              if (disposed) return;
              if (event.data === 0) setEnded(true);
              if (event.data === 1) {
                setEnded(false);
                started.current();
              }
            },
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
    if (!media || ["youtube", "video", "audio"].includes(media.kind)) return;
    const abort = new AbortController();
    let dispose: (() => void) | undefined;
    void import("./providers/external.js")
      .then(({ createExternalPlayer }) => {
        if (abort.signal.aborted || !externalMount.current) return;
        return createExternalPlayer(media, externalMount.current, abort.signal);
      })
      .then((player) => {
        if (!player) return;
        dispose = player.dispose;
        if (abort.signal.aborted) {
          dispose();
          return;
        }
        external.current = player.adapter;
        setReady(true);
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "This source could not load.",
          );
      });
    return () => {
      abort.abort();
      dispose?.();
      external.current = null;
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
      durationLabel.current.textContent =
        duration.current > 0 ? timestamp(duration.current) : "--:--";
    if (seeking.current) return;
    if (!Number.isFinite(time)) {
      if (currentTimeLabel.current)
        currentTimeLabel.current.textContent = "--:--";
      return;
    }
    position.current = time;
    if (currentTimeLabel.current)
      currentTimeLabel.current.textContent = timestamp(time);
    if (seekInput.current) {
      seekInput.current.max = String(duration.current || Math.max(time, 1));
      seekInput.current.style.setProperty(
        "--progress",
        `${duration.current ? Math.min((time / duration.current) * 100, 100) : 0}%`,
      );
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
        : external.current;
    if (!adapter) return;
    const stopStarted = adapter.on((event) => {
      if (
        external.current === adapter &&
        event.type === "state" &&
        event.action === "play" &&
        !adapter.isBuffering()
      )
        started.current();
    });
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
      stopStarted();
      next.dispose();
      if (engine.current === next) engine.current = null;
    };
  }, [ready, error, media?.kind, media?.id]);
  useEffect(() => {
    engine.current?.setContext(host, connected);
  }, [host, connected]);
  useEffect(() => {
    engine.current?.receive(playback);
  }, [playback]);
  useEffect(() => {
    if (playback.playing) setEnded(false);
  }, [playback.playing, playback.revision]);
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
    const playbackCommand = (action: "toggle" | "back" | "forward") => {
      const value = commands.current;
      if (
        !value.host ||
        !value.connected ||
        !value.ready ||
        !value.playback.media
      )
        return;
      if (action === "toggle") {
        value.control(
          value.playback.playing ? "pause" : "play",
          position.current,
        );
        return;
      }
      if (!engine.current?.adapter.canSeek) return;
      const localDuration = engine.current.adapter.getDuration();
      const target = Math.max(
        0,
        position.current + (action === "back" ? -10 : 10),
      );
      const next = localDuration > 0 ? Math.min(target, localDuration) : target;
      position.current = next;
      commands.current.position = next;
      value.control("seek", next);
    };
    return registerShortcuts({
      " ": () => playbackCommand("toggle"),
      k: () => playbackCommand("toggle"),
      j: () => playbackCommand("back"),
      l: () => playbackCommand("forward"),
      f: fullscreen,
      escape: () => {
        if (document.fullscreenElement)
          void document.exitFullscreen().catch(() => {});
      },
    });
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
    external.current?.setMuted?.(next);
  }
  return (
    <div
      className={`player-shell ${effects ? "fx-on" : "fx-off"} ${media?.kind === "youtube" ? "youtube-player" : ""} ${controlsVisible || !playback.playing || ended ? "controls-visible" : ""} ${ended ? "is-ended" : ""}`}
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
                ? "Choose a video from the source control below."
                : "Your host is choosing a video."}
            </span>
          </div>
        ) : media.kind === "video" || media.kind === "audio" ? (
          <video
            ref={video}
            src={media.url}
            muted={muted}
            playsInline
            preload="auto"
            className={media.kind === "audio" ? "audio-source" : undefined}
            onLoadedMetadata={() => setReady(true)}
            onPlaying={() => {
              setEnded(false);
              started.current();
            }}
            onEnded={() => setEnded(true)}
            onError={() =>
              setError(
                "Video could not load. Check the URL, codec and server access.",
              )
            }
          />
        ) : media.kind === "youtube" ? (
          <div className="youtube-mount" ref={mount} />
        ) : (
          <div
            className="external-mount"
            data-provider={media.kind}
            ref={externalMount}
          />
        )}
        {media?.kind === "audio" && (
          <div className="audio-art" aria-hidden="true">
            <Film />
            <span>Audio file</span>
          </div>
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
        {endMode !== "hidden" && media && ready && !error && (
          <div className="ended-overlay" role="status">
            <strong>That’s the end.</strong>
            {endMode === "restart" ? (
              <Button
                variant="primary"
                onClick={() => {
                  setEnded(false);
                  issue("seek", 0);
                  window.setTimeout(() => issue("play", 0), 0);
                }}
              >
                <RotateCcw aria-hidden="true" />
                Watch again
              </Button>
            ) : (
              <span>Waiting for the host</span>
            )}
          </div>
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
      {media && (caps?.isLive || caps?.syncMode === "limited") && (
        <div className="provider-capability" role="note">
          {caps.isLive && <span className="live-chip">LIVE</span>}
          <span>
            {PROVIDER_NAMES[media.kind]}
            {caps.syncMode === "embed"
              ? " · local embed"
              : caps.syncMode === "live"
                ? " · no timeline sync"
                : " · provider-limited playback"}
          </span>
        </div>
      )}
      <div
        className={`player-controls ${caps?.syncMode === "embed" ? "native-embed-controls" : ""}`}
        onPointerEnter={() => {
          interacting.current = true;
          showControls();
        }}
        onPointerLeave={() => {
          interacting.current = false;
          showControls();
        }}
      >
        {(!caps || caps.canPlay || caps.canPause) && (
          <IconButton
            className="icon-button"
            aria-label={playback.playing ? "Pause" : "Play"}
            disabled={
              !host ||
              !connected ||
              !media ||
              !ready ||
              !!error ||
              (playback.playing ? !caps?.canPause : !caps?.canPlay)
            }
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
        )}
        {(!caps || caps.canReadPosition) && (
          <span className="time" ref={currentTimeLabel}>
            0:00
          </span>
        )}
        {(!caps || caps.canSeek) && (
          <input
            className="media-seek"
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
        )}
        {(!caps || caps.canReadDuration) && (
          <span className="time" ref={durationLabel}>
            --:--
          </span>
        )}
        {(!caps || caps.canSetVolume) && (
          <>
            <IconButton
              className="icon-button"
              aria-label={muted || volume.baseVolume <= 0.001 ? "Unmute" : "Mute"}
              onClick={toggleMute}
              disabled={!media || !ready}
            >
              {muted || volume.baseVolume <= 0.001 ? (
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
              style={{ "--volume": `${Math.round(volume.baseVolume * 100)}%` } as CSSProperties}
              onChange={(event) => volume.choose(Number(event.target.value))}
              disabled={!media || !ready}
            />
          </>
        )}
        {media?.kind === "youtube" && (
          <span
            className="youtube-caption-status"
            title="YouTube captions are on when available"
          >
            <Captions aria-hidden="true" />
            <span className="sr-only">Captions on when available</span>
          </span>
        )}
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
