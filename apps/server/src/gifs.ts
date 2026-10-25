import { log } from "./log.js";
import type { Express, Request, Response } from "express";
import { gifUrl, gifQuery, type GifResult } from "@watchparty/shared";
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
export function normalizeGifs(value: unknown): GifResult[] {
  const data = record(value).data;
  if (!Array.isArray(data)) throw new Error("Invalid provider response");
  return data.slice(0, 24).flatMap((raw): GifResult[] => {
    const gif = record(raw);
    const images = record(gif.images);
    const original = record(images.original);
    const preview = record(
      images.fixed_width_small ?? images.fixed_height_small ?? images.downsized,
    );
    const width = Number(original.width);
    const height = Number(original.height);
    try {
      const originalUrl = gifUrl(original.url);
      const previewUrl = gifUrl(preview.webp ?? preview.url ?? original.url);
      if (
        ![originalUrl, previewUrl].every((url) => {
          const host = new URL(url).hostname;
          return host === "giphy.com" || host.endsWith(".giphy.com");
        })
      )
        return [];
      if (
        typeof gif.id !== "string" ||
        !/^[\w-]{1,100}$/.test(gif.id) ||
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1 ||
        width > 10000 ||
        height > 10000
      )
        return [];
      return [
        {
          id: gif.id,
          title:
            typeof gif.title === "string" ? gif.title.slice(0, 160) : "GIF",
          previewUrl,
          originalUrl,
          width,
          height,
        },
      ];
    } catch {
      return [];
    }
  });
}
export function installGifRoutes(
  app: Express,
  allow: (key: string, capacity: number, intervalMs?: number) => boolean,
) {
  const cache = new Map<string, { expires: number; gifs: GifResult[] }>();
  const inflight = new Map<string, Promise<{ status: number; body: object }>>();
  let cooldown = 0;
  async function load(kind: "trending" | "search", query: string, limit: number) {
    const key = `${kind}:${query}:${limit}`;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now())
      return { status: 200, body: { gifs: cached.gifs } };
    if (cooldown > Date.now())
      return {
        status: 429,
        body: { error: "GIF search is busy. Try again shortly." },
      };
    const existing = inflight.get(key);
    if (existing) return existing;
    if (inflight.size >= 8)
      return {
        status: 429,
        body: { error: "GIF search is busy. Try again shortly." },
      };
    const job = (async () => {
      try {
        const url = new URL(`https://api.giphy.com/v1/gifs/${kind}`);
        url.searchParams.set("api_key", process.env.GIPHY_API_KEY!);
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("rating", "pg");
        if (query) url.searchParams.set("q", query);
        const response = await fetch(url, {
          signal: AbortSignal.timeout(6000),
          redirect: "error",
        });
        if (!response.ok) {
          const raw = (await response.text()).slice(0, 1024);
          const secret = process.env.GIPHY_API_KEY;
          const body = (secret ? raw.split(secret).join("[redacted]") : raw).replace(/api_key[=": ]+[^\s&"<>]+/gi, "api_key=[redacted]").split("").map((char) => char.charCodeAt(0) < 32 ? " " : char).join("");
          log("gif_provider_error", { status: response.status, body });
        }
        if (response.status === 401 || response.status === 403) return { status: 502, body: { error: "GIF provider rejected its API key. Try again later." } };
        if (response.status === 429) {
          cooldown = Date.now() + 30_000;
          return {
            status: 429,
            body: { error: "GIF search quota reached. Try again shortly." },
          };
        }
        if (!response.ok) throw new Error("Provider failed");
        const body = await response.text();
        if (body.length > 2_000_000)
          throw new Error("Provider response too large");
        const parsed: unknown = JSON.parse(body);
        const meta = record(record(parsed).meta);
        if (meta.status !== undefined && meta.status !== 200) throw new Error("Invalid provider status");
        const normalized = normalizeGifs(parsed);
        if (Array.isArray(record(parsed).data) && (record(parsed).data as unknown[]).length && !normalized.length) throw new Error("Malformed provider media");
        const gifs = normalized.slice(0, limit);
        if (cache.size >= 64) cache.delete(cache.keys().next().value!);
        cache.set(key, { gifs, expires: Date.now() + 30_000 });
        return { status: 200, body: { gifs } };
      } catch {
        log("gif_provider_failure", { reason: "network_or_invalid_response" });
        return {
          status: 502,
          body: { error: "GIF search unavailable. Try again later." },
        };
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, job);
    return job;
  }
  const route =
    (kind: "trending" | "search") => async (req: Request, res: Response) => {
      res.set("Cache-Control", "no-store");
      if (!process.env.GIPHY_API_KEY) {
        res.status(503).json({ error: "GIF search unavailable" });
        return;
      }
      if (!allow(`gifs:${req.ip}`, 40)) {
        res
          .set("Retry-After", "30")
          .status(429)
          .json({ error: "GIF search is busy. Try again shortly." });
        return;
      }
      let query = "";
      let limit = 24;
      try {
        if (kind === "search") query = gifQuery(req.query.q);
        if (req.query.limit !== undefined) {
          if (typeof req.query.limit !== "string" || !/^(?:[1-9]|1[0-9]|2[0-4])$/.test(req.query.limit)) throw new Error("Invalid limit");
          limit = Number(req.query.limit);
        }
      } catch {
        res
          .status(400)
          .json({ error: "Use a 1–50 character search and a limit from 1 to 24." });
        return;
      }
      const result = await load(kind, query, limit);
      if (result.status === 429) res.set("Retry-After", "30");
      res.status(result.status).json(result.body);
    };
  app.get("/api/gifs/trending", route("trending"));
  app.get("/api/gifs/search", route("search"));
}
