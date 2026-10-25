export interface SpeechActivity {
  speaking: boolean;
  quietSince: number | null;
}
export const SILENT: SpeechActivity = { speaking: false, quietSince: null };
// Separate on/off thresholds plus a short release prevent flicker at the boundary.
export function speechActivity(
  previous: SpeechActivity,
  rms: number,
  now: number,
  enabled = true,
): SpeechActivity {
  if (!enabled || !Number.isFinite(rms)) return { ...SILENT };
  if (!previous.speaking) return { speaking: rms >= 0.025, quietSince: null };
  if (rms >= 0.014) return { speaking: true, quietSince: null };
  const quietSince = previous.quietSince ?? now;
  return now - quietSince >= 160
    ? { ...SILENT }
    : { speaking: true, quietSince };
}
export function duckTarget(
  baseVolume: number,
  remoteSpeakers: number,
  enabled: boolean,
  muted = false,
): number {
  const base = Math.max(0, Math.min(1, baseVolume));
  return base * (enabled && remoteSpeakers > 0 && !muted ? 0.6 : 1);
}
export function volumeRamp(
  from: number,
  to: number,
  elapsedMs: number,
  durationMs: number,
): number {
  const t = Math.max(0, Math.min(1, elapsedMs / durationMs));
  const eased = t * t * (3 - 2 * t);
  return t >= 1 ? to : from + (to - from) * eased;
}
