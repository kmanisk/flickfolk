import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/server.js";
import { normalizeGifs } from "../src/gifs.js";
const provider = {
  data: [
    {
      id: "cat1",
      title: "Cat",
      images: {
        original: {
          url: "https://media.giphy.com/media/cat1/giphy.gif?cid=keep",
          width: "320",
          height: "240",
        },
        fixed_width_small: {
          webp: "https://media.giphy.com/media/cat1/100.webp",
          url: "https://media.giphy.com/media/cat1/100.gif",
        },
      },
    },
  ],
};
let app: ReturnType<typeof createApp>;
let base: string;
beforeEach(async () => {
  app = createApp();
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  base = `http://127.0.0.1:${(app.http.address() as AddressInfo).port}`;
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) => app.io.close(() => resolve()));
});
it("normalizes only safe necessary provider fields", () => {
  expect(normalizeGifs(provider)).toEqual([
    {
      id: "cat1",
      title: "Cat",
      previewUrl: "https://media.giphy.com/media/cat1/100.webp",
      originalUrl: "https://media.giphy.com/media/cat1/giphy.gif?cid=keep",
      width: 320,
      height: 240,
    },
  ]);
  expect(
    normalizeGifs({
      data: [
        {
          ...provider.data[0],
          images: {
            original: {
              url: "https://evil.com/a.gif",
              width: 320,
              height: 240,
            },
          },
        },
      ],
    }),
  ).toEqual([]);
  expect(() => normalizeGifs({})).toThrow();
});
it("returns a graceful unavailable state without a key", async () => {
  vi.stubEnv("GIPHY_API_KEY", "");
  const response = await fetch(`${base}/api/gifs/trending`);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "GIF search unavailable" });
});
it("validates queries, keeps the key server-side and briefly caches identical searches", async () => {
  const key = randomUUID();
  vi.stubEnv("GIPHY_API_KEY", key);
  const original = globalThis.fetch;
  let calls = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if (String(input).startsWith("https://api.giphy.com/")) {
      calls++;
      expect(new URL(String(input)).searchParams.get("api_key")).toBe(key);
      return Promise.resolve(Response.json(provider));
    }
    return original(input, init);
  });
  expect((await fetch(`${base}/api/gifs/search?q=`)).status).toBe(400);
  expect(
    (await fetch(`${base}/api/gifs/search?q=${"x".repeat(51)}`)).status,
  ).toBe(400);
  const first = await fetch(`${base}/api/gifs/search?q=cat`);
  const body = await first.text();
  expect(first.status).toBe(200);
  expect(body).not.toContain(key);
  expect(body).not.toContain("images");
  expect((await fetch(`${base}/api/gifs/search?q=cat`)).status).toBe(200);
  expect(calls).toBe(1);
});
it("handles provider throttling and network errors without leaking provider data", async () => {
  vi.stubEnv("GIPHY_API_KEY", randomUUID());
  const original = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) =>
    String(input).startsWith("https://api.giphy.com/")
      ? Promise.resolve(new Response("secret provider body", { status: 429 }))
      : original(input, init),
  );
  const response = await fetch(`${base}/api/gifs/trending`);
  expect(response.status).toBe(429);
  expect(await response.text()).not.toContain("secret");
  expect(response.headers.get("retry-after")).toBe("30");
});

it("turns upstream network failure into a bounded generic response", async () => {
  vi.stubEnv("GIPHY_API_KEY", randomUUID());
  const original = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) =>
    String(input).startsWith("https://api.giphy.com/")
      ? Promise.reject(new Error("upstream failure"))
      : original(input, init),
  );
  const response = await fetch(`${base}/api/gifs/trending`);
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    error: "GIF search unavailable. Try again later.",
  });
});

it("returns empty trending results and validates bounded provider limits", async () => {
  vi.stubEnv("GIPHY_API_KEY", randomUUID());
  const original = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if (String(input).startsWith("https://api.giphy.com/")) {
      expect(new URL(String(input)).searchParams.get("limit")).toBe("6");
      return Promise.resolve(
        Response.json({ data: [], meta: { status: 200 } }),
      );
    }
    return original(input, init);
  });
  expect((await fetch(`${base}/api/gifs/trending?limit=25`)).status).toBe(400);
  expect(
    (await fetch(`${base}/api/gifs/trending?limit=6&limit=7`)).status,
  ).toBe(400);
  const response = await fetch(`${base}/api/gifs/trending?limit=6`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ gifs: [] });
});
it("logs bounded redacted provider failure bodies and returns a useful auth error", async () => {
  const key = randomUUID();
  vi.stubEnv("GIPHY_API_KEY", key);
  const logging = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const original = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) =>
    String(input).startsWith("https://api.giphy.com/")
      ? Promise.resolve(
          new Response(`API rejected api_key=${key}`, { status: 401 }),
        )
      : original(input, init),
  );
  const response = await fetch(`${base}/api/gifs/search?q=cat`);
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    error: "GIF provider rejected its API key. Try again later.",
  });
  const logs = logging.mock.calls.map(([text]) => String(text)).join("");
  expect(logs).toContain("gif_provider_error");
  expect(logs).toContain("API rejected");
  expect(logs).not.toContain(key);
});
it("treats malformed and synthetic provider responses as errors rather than empty results", async () => {
  vi.stubEnv("GIPHY_API_KEY", randomUUID());
  const original = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) =>
    String(input).startsWith("https://api.giphy.com/")
      ? Promise.resolve(
          Response.json({ meta: { status: 200, response_id: "" } }),
        )
      : original(input, init),
  );
  expect((await fetch(`${base}/api/gifs/trending`)).status).toBe(502);
});

it("reports only configured GIF availability without exposing the key", async () => {
  vi.stubEnv("GIPHY_API_KEY", "");
  expect(await (await fetch(`${base}/api/gifs/status`)).json()).toEqual({
    available: false,
  });
  const key = randomUUID();
  vi.stubEnv("GIPHY_API_KEY", key);
  const response = await fetch(`${base}/api/gifs/status`);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ available: true });
});
