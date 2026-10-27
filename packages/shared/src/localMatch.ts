export interface LocalFileIdentity {
  fingerprint: string;
  durationSec: number;
}

export type LocalMatch = "exact" | "near" | "mismatch";

export function matchLocal(
  host: LocalFileIdentity,
  mine: LocalFileIdentity,
): LocalMatch {
  if (host.fingerprint === mine.fingerprint) return "exact";
  return Math.abs(host.durationSec - mine.durationSec) <= 2
    ? "near"
    : "mismatch";
}
