import { useEffect, useRef, useState } from "react";
import { gifUrl, type GifResult } from "@watchparty/shared";
export function GifPicker({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    input.current?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('button[aria-label="Search GIFs"]')
      )
        return;
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target)
      )
        close.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key, true);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setError("");
    setUnavailable(false);
    setItems([]);
    const timer = setTimeout(
      () => {
        const url = query.trim()
          ? `/api/gifs/search?q=${encodeURIComponent(query.trim())}&limit=24`
          : "/api/gifs/trending?limit=24";
        void fetch(url, { signal: controller.signal, cache: "no-store" })
          .then(async (response) => {
            if (!current) return;
            if (!response.ok) {
              setUnavailable(response.status === 503);
              throw new Error(
                response.status === 503
                  ? "GIF search unavailable"
                  : response.status === 429
                    ? "GIF search is busy. Try again shortly."
                    : "GIF search unavailable. Try again later.",
              );
            }
            const body: unknown = await response.json();
            if (!current) return;
            if (
              !body ||
              typeof body !== "object" ||
              !("gifs" in body) ||
              !Array.isArray(body.gifs)
            )
              throw new Error("GIF search unavailable");
            const gifs = body.gifs
              .slice(0, 24)
              .flatMap((value): GifResult[] => {
                if (
                  !value ||
                  typeof value !== "object" ||
                  typeof value.id !== "string" ||
                  typeof value.title !== "string" ||
                  !Number.isInteger(value.width) ||
                  !Number.isInteger(value.height) ||
                  value.width < 1 ||
                  value.height < 1
                )
                  return [];
                try {
                  return [
                    {
                      id: value.id,
                      title: value.title,
                      previewUrl: gifUrl(value.previewUrl),
                      originalUrl: gifUrl(value.originalUrl),
                      width: value.width,
                      height: value.height,
                    },
                  ];
                } catch {
                  return [];
                }
              });
            setItems(gifs);
          })
          .catch((error) => {
            if (current)
              setError(
                error instanceof Error
                  ? error.message
                  : "GIF search unavailable",
              );
          })
          .finally(() => {
            if (current) setLoading(false);
          });
      },
      query.trim() ? 250 : 0,
    );
    return () => {
      current = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, attempt]);
  return (
    <div
      ref={panel}
      className="gif-picker popup-surface"
      role="dialog"
      aria-label="GIF picker"
    >
      {!unavailable && <div className="gif-picker-search">
        <input
          ref={input}
          aria-label="Search GIFs"
          maxLength={50}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search GIFs"
        />
        <button aria-label="Close GIF picker" onClick={onClose}>
          ×
        </button>
      </div>}
      {loading ? (
        <div className="gif-skeleton" aria-label="Loading GIFs">
          <i />
          <i />
          <i />
          <i />
        </div>
      ) : error ? (
        <p className="gif-status" role="status">
          {error}
          {!unavailable && <button className="secondary" onClick={() => setAttempt((value) => value + 1)}>Retry</button>}
        </p>
      ) : items.length ? (
        <div className="gif-grid">
          {items.map((gif) => (
            <button
              key={gif.id}
              aria-label={`Send ${gif.title || "GIF"}`}
              onClick={() => onSelect(gif.originalUrl)}
            >
              <img
                src={gif.previewUrl}
                width={gif.width}
                height={gif.height}
                alt={gif.title || "GIF"}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            </button>
          ))}
        </div>
      ) : (
        <p className="gif-status">No GIFs found.</p>
      )}
      {!unavailable && <a
        className="giphy-attribution"
        href="https://giphy.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src="/giphy-attribution.png" alt="Powered by GIPHY" />
      </a>}
    </div>
  );
}
