import { useEffect, useState } from "react";
import { CODE, normalizeCode } from "@watchparty/shared";
export interface RoomLookup {
  state: "waiting" | "tuning" | "found" | "missing";
  count?: number;
  detail?: string;
}
export function useRoomLookup(value: string): RoomLookup {
  const [lookup, setLookup] = useState<RoomLookup>({ state: "waiting" });
  useEffect(() => {
    const code = normalizeCode(value);
    const abort = new AbortController();
    let cancelled = false;
    setLookup({
      state:
        !code || code.length < 6
          ? "waiting"
          : CODE.test(code)
            ? "waiting"
            : "missing",
    });
    if (!CODE.test(code)) return () => abort.abort();
    const timer = window.setTimeout(() => {
      setLookup({ state: "tuning" });
      void fetch(`/api/rooms/${encodeURIComponent(code)}`, {
        signal: abort.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          if (cancelled) return;
          if (!response.ok) {
            setLookup({
              state: "missing",
              detail:
                response.status === 404
                  ? "Room not found. Check the code."
                  : response.status === 429
                    ? "Too many lookups. Wait a moment."
                    : "Lookup unavailable.",
            });
            return;
          }
          const data: unknown = await response.json();
          if (cancelled) return;
          if (
            !data ||
            typeof data !== "object" ||
            !("code" in data) ||
            data.code !== code ||
            !("participants" in data) ||
            typeof data.participants !== "number" ||
            !Number.isInteger(data.participants) ||
            data.participants < 1 ||
            data.participants > 24
          )
            throw new Error("Invalid lookup response");
          setLookup({ state: "found", count: data.participants });
        })
        .catch(() => {
          if (!cancelled)
            setLookup({
              state: "missing",
              detail: "Cannot check this room. Check your connection.",
            });
        });
    }, 300);
    return () => {
      cancelled = true;
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [value]);
  return lookup;
}
