import { useSyncExternalStore } from "react";
import type { Room } from "@watchparty/shared";
import type { PlaybackMetrics } from "./Player.js";
import { syncStore } from "./lib/syncRuntime.js";
export function SyncStatusline({
  room,
  connected,
  status,
  phase,
  hostName,
  debug,
}: {
  room: Room | null;
  connected: boolean;
  status: string;
  phase: PlaybackMetrics["state"];
  hostName: string;
  debug: boolean;
}) {
  const metrics = useSyncExternalStore(
    syncStore.subscribe,
    syncStore.getSnapshot,
  );
  const unavailable = ["error", "blocked", "loading", "waiting"].includes(
    phase,
  );
  const state = !connected
    ? status.toLowerCase()
    : !room
      ? "standby"
      : unavailable
        ? phase
        : metrics.state === "synced" && !room.playback.playing
          ? "paused"
          : metrics.state;
  const drift = connected && room && !unavailable ? metrics.driftMs : null;
  return (
    <div
      className={`sync-statusline ${debug ? "debug-status" : ""}`}
      aria-label="Playback diagnostics"
    >
      <span className="status-brand">AFTERGLOW</span>
      <span className={connected ? "status-connected" : "status-disconnected"}>
        {state}
      </span>
      <span className="status-secondary" data-testid="drift">
        offset{" "}
        {drift === null
          ? "--"
          : `${drift > 0 ? "+" : ""}${Math.round(drift)}ms`}
      </span>
      <span className="status-secondary" data-testid="rtt">
        rtt{" "}
        {connected && metrics.rttMs !== null
          ? `${Math.round(metrics.rttMs)}ms`
          : "--"}
      </span>
      <span className="status-secondary">
        state {room ? `v${room.playback.revision}` : "--"}
      </span>
      <span className="status-secondary">
        corrections {room ? metrics.corrections : "--"}
      </span>
      <span className="status-host">host {hostName}</span>
      <span className="status-count">
        {room
          ? `${room.participants.length} ${room.participants.length === 1 ? "person" : "people"}`
          : "-- people"}
      </span>
      <span className="status-room">{room?.code ?? "STANDBY"}</span>
    </div>
  );
}
