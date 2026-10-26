import { useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { Link2, Wifi, WifiOff } from "lucide-react";
import { REACTIONS, type ReactionSymbol, type Room } from "@watchparty/shared";
import type { PlaybackMetrics } from "./Player.js";
import { syncStore } from "./lib/syncRuntime.js";
import { Button, Chip } from "./ui/index.js";
const labels = ["heart", "laugh", "surprise", "cry", "applause", "fire"];
export function SyncStatusline({
  room,
  connected,
  status,
  phase,
  host,
  debug,
  onSource,
  sourceOpen,
  sourceTriggerRef,
  sourceEditor,
  onReaction,
}: {
  room: Room | null;
  connected: boolean;
  status: string;
  phase: PlaybackMetrics["state"];
  host: boolean;
  debug: boolean;
  onSource?: () => void;
  sourceOpen?: boolean;
  sourceTriggerRef?: RefObject<HTMLButtonElement | null>;
  sourceEditor?: ReactNode;
  onReaction?: (symbol: ReactionSymbol) => void;
}) {
  const metrics = useSyncExternalStore(
    syncStore.subscribe,
    syncStore.getSnapshot,
  );
  const unavailable = ["error", "blocked", "loading", "waiting"].includes(
    phase,
  );
  const state = !connected
    ? "offline"
    : !room
      ? "standby"
      : unavailable
        ? phase
        : metrics.state;
  const drift = connected && room && !unavailable ? metrics.driftMs : null;
  const source = room?.playback.media
    ? new URL(room.playback.media.url).hostname.replace(/^www\./, "")
    : "Choose a video";
  return (
    <footer
      className={`bottom-bar sync-statusline ${debug ? "debug-status" : ""}`}
      aria-label="Playback diagnostics"
    >
      <div className="source-anchor">
        {onSource ? (
          <Button
            variant="ghost"
            className="source-chip"
            ref={sourceTriggerRef}
            aria-label="Change video source"
            aria-expanded={sourceOpen}
            onClick={onSource}
          >
            <Link2 aria-hidden="true" />
            <span>{source}</span>
          </Button>
        ) : (
          <span className="source-chip read-only-source">
            <Link2 aria-hidden="true" />
            <span>{source}</span>
          </span>
        )}
        {sourceEditor}
      </div>
      <div className="reaction-dock" aria-label="Watch reactions">
        {REACTIONS.map((symbol, i) => (
          <Button
            variant="ghost"
            key={symbol}
            aria-label={`React ${labels[i]}`}
            title={`React ${labels[i]}`}
            disabled={!connected}
            onClick={() => onReaction?.(symbol)}
          >
            {symbol}
          </Button>
        ))}
      </div>
      <Chip
        role="status"
        aria-label="Connection"
        title="Drift: how far your playback is from the host. RTT: round trip to the server."
        className={`connection-chip sync-${state}`}
      >
        <span className="sync-dot" />
        {state === "offline" ? (
          <WifiOff aria-hidden="true" />
        ) : (
          <Wifi aria-hidden="true" />
        )}
        <span>{connected ? state : status.toLowerCase()}</span>
        <span data-testid="drift">
          {unavailable
            ? "--"
            : host
              ? "host"
              : drift === null
                ? "--"
                : `${drift >= 0 ? "+" : ""}${(drift / 1000).toFixed(2)}s`}
        </span>
        <span data-testid="rtt">
          {connected && metrics.rttMs !== null
            ? `${Math.round(metrics.rttMs)} ms`
            : "--"}
        </span>
      </Chip>
      {debug && (
        <div className="debug-telemetry">
          <span>state {room ? `v${room.playback.revision}` : "--"}</span>
          <span>corrections {metrics.corrections}</span>
          <span>clock {Math.round(metrics.offsetMs)} ms</span>
        </div>
      )}
    </footer>
  );
}
