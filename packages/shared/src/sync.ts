export interface ClockSample {
  t0: number;
  rtt: number;
  serverNow: number;
}
export class ClockSync {
  offsetMs = 0;
  rttMs: number | null = null;
  private bestRtt = Infinity;
  private initialized = false;
  constructor(private readonly wallNow: () => number = Date.now) {}
  ingest(samples: ClockSample[]): boolean {
    const valid = samples.filter(
      (s) =>
        Number.isFinite(s.t0) &&
        Number.isFinite(s.serverNow) &&
        Number.isFinite(s.rtt) &&
        s.rtt >= 0 &&
        s.rtt <= this.bestRtt * 2,
    );
    const best = valid.sort((a, b) => a.rtt - b.rtt)[0];
    if (!best) return false;
    const offset = best.serverNow - (best.t0 + best.rtt / 2);
    this.offsetMs = this.initialized
      ? this.offsetMs * 0.7 + offset * 0.3
      : offset;
    this.rttMs = best.rtt;
    this.bestRtt = Math.min(this.bestRtt, best.rtt);
    this.initialized = true;
    return true;
  }
  nowServer(): number {
    return this.wallNow() + this.offsetMs;
  }
}
export interface CorrectionInput {
  // Positive drift means the local player is ahead of the server timeline.
  driftSec: number;
  provider: "file" | "youtube";
  nowMs: number;
  lastCorrectionMs: number;
  consecutiveOver: number;
  targetSec: number;
  nudging?: boolean;
}
export type Correction =
  | { action: "none"; rate: 1 }
  | { action: "rate"; rate: number }
  | { action: "seek"; seekTo: number; rate: 1 };
export function computeCorrection(input: CorrectionInput): Correction {
  const {
    driftSec,
    provider,
    consecutiveOver,
    nowMs,
    lastCorrectionMs,
    targetSec,
    nudging = false,
  } = input;
  const drift = Math.abs(driftSec);
  if (!Number.isFinite(drift) || !Number.isFinite(targetSec))
    return { action: "none", rate: 1 };
  if (provider === "youtube") {
    if (drift <= 0.6 || consecutiveOver < 2 || nowMs - lastCorrectionMs < 4000)
      return { action: "none", rate: 1 };
    return { action: "seek", seekTo: Math.max(0, targetSec), rate: 1 };
  }
  if (drift < (nudging ? 0.04 : 0.08) || (consecutiveOver < 2 && !nudging))
    return { action: "none", rate: 1 };
  if (drift > 2)
    return { action: "seek", seekTo: Math.max(0, targetSec), rate: 1 };
  return { action: "rate", rate: driftSec > 0 ? 0.95 : 1.05 };
}
