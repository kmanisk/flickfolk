export interface SyncSnapshot {
  state: "synced" | "resyncing" | "offline" | "buffering";
  driftMs: number | null;
  rttMs: number | null;
  offsetMs: number;
  corrections: number;
  version: number;
}
export function createSyncStore(now: () => number = Date.now) {
  let snapshot: SyncSnapshot = {
    state: "offline",
    driftMs: null,
    rttMs: null,
    offsetMs: 0,
    corrections: 0,
    version: -1,
  };
  let pending = snapshot;
  let emittedAt = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const flush = () => {
    timer = undefined;
    if (
      Object.keys(pending).every(
        (key) =>
          pending[key as keyof SyncSnapshot] ===
          snapshot[key as keyof SyncSnapshot],
      )
    )
      return;
    snapshot = pending;
    emittedAt = now();
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update: (patch: Partial<SyncSnapshot>) => {
      pending = { ...pending, ...patch };
      const delay = Math.max(0, 250 - (now() - emittedAt));
      if (delay === 0) {
        if (timer) clearTimeout(timer);
        flush();
      } else if (!timer) timer = setTimeout(flush, delay);
    },
    dispose: () => {
      if (timer) clearTimeout(timer);
      listeners.clear();
    },
  };
}
export type SyncStore = ReturnType<typeof createSyncStore>;
