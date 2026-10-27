import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import {
  currentPosition,
  type Ack,
  type ClientEvents,
  type Result,
  type Room,
  type ServerEvents,
} from "@watchparty/shared";
import { createApp } from "../src/server.js";
type Client = Socket<ServerEvents, ClientEvents>;
let app: ReturnType<typeof createApp>;
let base: string;
let clients: Client[];
function request<T>(send: (ack: Ack<T>) => void): Promise<Result<T>> {
  return new Promise((resolve) => send(resolve));
}
async function connect(): Promise<Client> {
  const client: Client = io(base, {
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  });
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  return client;
}
function nextState(
  client: Client,
  matches: (room: Room) => boolean = () => true,
): Promise<Room> {
  return new Promise((resolve) => {
    const listener = (room: Room) => {
      if (matches(room)) {
        client.off("room:state", listener);
        resolve(room);
      }
    };
    client.on("room:state", listener);
  });
}
async function setup() {
  const host = await connect();
  const guest = await connect();
  const result = await request<Room>((ack) =>
    host.emit("room:create", { name: "Host" }, ack),
  );
  if (!result.ok) throw new Error(result.error);
  const code = result.data.code;
  await request<Room>((ack) =>
    guest.emit("room:join", { name: "Guest", code }, ack),
  );
  const loaded = nextState(guest, (room) => room.playback.media !== null);
  await request((ack) =>
    host.emit("media:set", { url: "https://example.com/movie.mp4" }, ack),
  );
  await loaded;
  return { host, guest, code };
}
beforeEach(async () => {
  app = createApp();
  clients = [];
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  base = `http://127.0.0.1:${(app.http.address() as AddressInfo).port}`;
});
afterEach(async () => {
  clients.forEach((client) => client.disconnect());
  await new Promise<void>((resolve) => app.io.close(() => resolve()));
});
describe("two-client playback protocol", () => {
  it("broadcasts host play, seek, pause and late-join position", async () => {
    const { host, guest, code } = await setup();
    let state = nextState(guest);
    expect(
      (
        await request((ack) =>
          host.emit("playback:control", { action: "play", position: 0 }, ack),
        )
      ).ok,
    ).toBe(true);
    expect((await state).playback.playing).toBe(true);
    state = nextState(guest);
    await request((ack) =>
      host.emit("playback:control", { action: "seek", position: 42 }, ack),
    );
    expect((await state).playback.position).toBe(42);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const late = await connect();
    const joined = await request<Room>((ack) =>
      late.emit("room:join", { name: "Late", code }, ack),
    );
    expect(joined.ok).toBe(true);
    if (joined.ok)
      expect(currentPosition(joined.data.playback, Date.now())).toBeGreaterThan(
        42.05,
      );
    state = nextState(guest);
    await request((ack) =>
      host.emit("playback:control", { action: "pause", position: 43 }, ack),
    );
    expect((await state).playback).toMatchObject({
      position: 43,
      playing: false,
    });
  });
  it("rejects guest control and media changes without changing state", async () => {
    const { guest, code } = await setup();
    const initial = structuredClone(app.rooms.get(code)!.playback);
    for (const action of ["play", "pause", "seek"] as const)
      expect(
        (
          await request((ack) =>
            guest.emit("playback:control", { action, position: 99 }, ack),
          )
        ).ok,
      ).toBe(false);
    expect(
      (
        await request((ack) =>
          guest.emit("media:set", { url: "https://example.com/evil.mp4" }, ack),
        )
      ).ok,
    ).toBe(false);
    expect(app.rooms.get(code)!.playback).toEqual(initial);
  });
  it("promotes a remaining participant and permits new host controls", async () => {
    const { host, guest } = await setup();
    const state = nextState(guest);
    host.disconnect();
    expect((await state).hostId).toBe(guest.id);
    expect(
      (
        await request((ack) =>
          guest.emit("playback:control", { action: "play", position: 0 }, ack),
        )
      ).ok,
    ).toBe(true);
  });
  it("rejoins a disconnected participant without stealing host", async () => {
    const { host, guest, code } = await setup();
    const state = nextState(guest);
    host.disconnect();
    await state;
    const reconnected = await connect();
    const result = await request<Room>((ack) =>
      reconnected.emit("room:join", { name: "Host", code }, ack),
    );
    expect(result.ok && result.data.hostId).toBe(guest.id);
    expect(result.ok && result.data.participants.length).toBe(2);
  });
  it("replaces a stale same-browser participant instead of duplicating it", async () => {
    const first = await connect();
    const created = await request<Room>((ack) =>
      first.emit(
        "room:create",
        { name: "Same person", clientId: "browser-client-123" },
        ack,
      ),
    );
    if (!created.ok) throw new Error(created.error);
    const second = await connect();
    const joined = await request<Room>((ack) =>
      second.emit(
        "room:join",
        {
          name: "Same person",
          code: created.data.code,
          clientId: "browser-client-123",
        },
        ack,
      ),
    );
    expect(joined.ok).toBe(true);
    if (joined.ok) {
      expect(joined.data.participants).toHaveLength(1);
      expect(joined.data.participants[0]?.id).toBe(second.id);
      expect(joined.data.hostId).toBe(second.id);
    }
  });
  it("shares chat and history while rejecting empty messages", async () => {
    const { host, guest, code } = await setup();
    const state = nextState(guest);
    expect(
      (
        await request((ack) =>
          host.emit("chat:send", { text: "Hello, world" }, ack),
        )
      ).ok,
    ).toBe(true);
    expect((await state).messages[0]?.text).toBe("Hello, world");
    expect(
      (await request((ack) => guest.emit("chat:send", { text: " " }, ack))).ok,
    ).toBe(false);
    const late = await connect();
    const joined = await request<Room>((ack) =>
      late.emit("room:join", { name: "Late", code }, ack),
    );
    expect(joined.ok && joined.data.messages[0]?.text).toBe("Hello, world");
  });
  it("validates malformed runtime payloads, room codes and nonfinite positions", async () => {
    const { host } = await setup();
    expect(
      (
        await request((ack) =>
          host.emit("playback:control", { action: "seek", position: NaN }, ack),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await request<Room>((ack) =>
          host.emit("room:join", { name: "", code: "bad" }, ack),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await request((ack) =>
          host.emit("media:set", { url: "javascript:alert(1)" }, ack),
        )
      ).ok,
    ).toBe(false);
    const malformed = undefined as unknown as { name: string };
    expect(
      (await request<Room>((ack) => host.emit("room:create", malformed, ack)))
        .ok,
    ).toBe(false);
  });
  it("deletes empty rooms and answers health checks", async () => {
    const { host, guest, code } = await setup();
    await request((ack) => host.emit("room:leave", ack));
    await request((ack) => guest.emit("room:leave", ack));
    expect(app.rooms.has(code)).toBe(false);
    const response = await fetch(`${base}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});

describe("production edges", () => {
  it("looks up a room without exposing its chat, names or media", async () => {
    const { code } = await setup();
    const response = await fetch(`${base}/api/rooms/${code.toLowerCase()}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      code,
      participants: 2,
      capacity: 24,
    });
    expect((await fetch(`${base}/api/rooms/invalid`)).status).toBe(400);
    expect((await fetch(`${base}/api/rooms/ZZZZZZ`)).status).toBe(404);
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("https://www.youtube.com");
    expect(csp).toContain("object-src 'none'");
  });
  it("recovers the socket identity after an unexpected transport close without reclaiming host", async () => {
    const { host, guest, code } = await setup();
    const identity = host.id;
    const promoted = nextState(guest, (room) => room.hostId === guest.id);
    host.io.reconnection(true);
    const restored = new Promise<void>((resolve) =>
      host.once("connect", resolve),
    );
    host.io.engine.close();
    await promoted;
    await restored;
    expect(host.recovered).toBe(true);
    expect(host.id).toBe(identity);
    const result = await request<Room>((ack) =>
      host.emit("room:join", { name: "Host", code }, ack),
    );
    expect(result.ok && result.data.hostId).toBe(guest.id);
    expect(
      result.ok &&
        result.data.participants.filter((p) => p.id === identity).length,
    ).toBe(1);
  });
  it("rate limits room creation across socket connections", async () => {
    const client = await connect();
    for (let count = 0; count < 10; count++)
      expect(
        (
          await request<Room>((ack) =>
            client.emit("room:create", { name: "Host" }, ack),
          )
        ).ok,
      ).toBe(true);
    const another = await connect();
    const limited = await request<Room>((ack) =>
      another.emit("room:create", { name: "Host" }, ack),
    );
    expect(limited.ok).toBe(false);
    if (!limited.ok) expect(limited.error).toContain("Too many");
  });
  it("returns a 404 for an unknown page and shuts down cleanly", async () => {
    expect((await fetch(`${base}/lost-channel`)).status).toBe(404);
    await app.shutdown();
    expect(app.http.listening).toBe(false);
  });
});

describe("room collaboration", () => {
  it("emits ephemeral validated reactions and enforces burst limits", async () => {
    const { host, guest, code } = await setup();
    const symbol = "\uD83D\uDD25";
    const reaction = new Promise<unknown>((resolve) =>
      guest.once("reaction", resolve),
    );
    expect(
      (await request((ack) => host.emit("reaction:send", { symbol }, ack))).ok,
    ).toBe(true);
    expect(await reaction).toMatchObject({ senderId: host.id, symbol });
    expect(app.rooms.get(code)!.messages).toHaveLength(0);
    for (let n = 0; n < 7; n++)
      expect(
        (await request((ack) => host.emit("reaction:send", { symbol }, ack)))
          .ok,
      ).toBe(true);
    expect(
      (await request((ack) => host.emit("reaction:send", { symbol }, ack))).ok,
    ).toBe(false);
    expect(
      (
        await request((ack) =>
          guest.emit("reaction:send", { symbol: "<script>" }, ack),
        )
      ).ok,
    ).toBe(false);
  });
  it("uses shared chat history and validation for GIFs", async () => {
    const { host, code } = await setup();
    const url = "https://media.giphy.com/media/example/giphy.gif";
    expect(
      (
        await request((ack) =>
          host.emit("chat:send", { text: url, kind: "gif" }, ack),
        )
      ).ok,
    ).toBe(true);
    expect(app.rooms.get(code)!.messages[0]).toMatchObject({
      kind: "gif",
      text: url,
      name: "Host",
    });
    expect(
      (
        await request((ack) =>
          host.emit(
            "chat:send",
            { text: "https://evil.com/image.gif", kind: "gif" },
            ack,
          ),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await request((ack) =>
          host.emit("chat:send", { text: "<script>alert(1)</script>" }, ack),
        )
      ).ok,
    ).toBe(true);
    expect(app.rooms.get(code)!.messages.at(-1)!.kind).toBe("text");
  });
  it("routes audio signaling only to the intended joined peer in the same room", async () => {
    const { host, guest, code } = await setup();
    const third = await connect();
    await request<Room>((ack) =>
      third.emit("room:join", { code, name: "Third" }, ack),
    );
    const outside = await connect();
    await request<Room>((ack) =>
      outside.emit("room:create", { name: "Outside" }, ack),
    );
    const active = { joined: true, muted: false, speaking: false };
    for (const client of [host, guest, third, outside])
      await request((ack) => client.emit("voice:state", active, ack));
    const received: string[] = [];
    third.on("voice:signal", () => received.push("third"));
    outside.on("voice:signal", () => received.push("outside"));
    host.on("voice:signal", () => received.push("host"));
    const signal = {
      kind: "description" as const,
      type: "offer" as const,
      sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
    };
    const routed = new Promise<unknown>((resolve) =>
      guest.once("voice:signal", resolve),
    );
    expect(
      (
        await request((ack) =>
          host.emit("voice:signal", { targetId: guest.id!, signal }, ack),
        )
      ).ok,
    ).toBe(true);
    expect(await routed).toMatchObject({ fromId: host.id, signal });
    expect(
      (
        await request((ack) =>
          host.emit("voice:signal", { targetId: outside.id!, signal }, ack),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await request((ack) =>
          host.emit("voice:signal", { targetId: host.id!, signal }, ack),
        )
      ).ok,
    ).toBe(false);
    expect(received).toEqual([]);
    await request((ack) =>
      guest.emit(
        "voice:state",
        { joined: false, muted: true, speaking: false },
        ack,
      ),
    );
    expect(
      (
        await request((ack) =>
          host.emit("voice:signal", { targetId: guest.id!, signal }, ack),
        )
      ).ok,
    ).toBe(false);
  });
  it("resets mic state on disconnect/rejoin and exposes only ICE configuration", async () => {
    const { host, guest, code } = await setup();
    const presence = new Promise<unknown>((resolve) =>
      guest.once("voice:presence", resolve),
    );
    await request((ack) =>
      host.emit(
        "voice:state",
        { joined: true, muted: false, speaking: true },
        ack,
      ),
    );
    expect(await presence).toMatchObject({
      id: host.id,
      state: { joined: true, speaking: true },
    });
    const left = nextState(guest, (room) => room.participants.length === 1);
    host.disconnect();
    await left;
    const back = await connect();
    const result = await request<Room>((ack) =>
      back.emit("room:join", { code, name: "Host" }, ack),
    );
    expect(
      result.ok &&
        result.data.participants.find((p) => p.id === back.id)!.voice,
    ).toEqual({ joined: false, muted: true, speaking: false });
    const config = await fetch(`${base}/api/rtc-config`);
    expect(config.status).toBe(200);
    expect(await config.json()).toHaveProperty("iceServers");
  });
});

it("keeps signup-free identity and rejects capability-disabled commands before any room mutation", async () => {
  const { host, guest, code } = await setup();
  for (const [url, actions] of [
    ["https://kick.com/streamer", ["play", "pause", "seek"]],
    ["https://twitch.tv/twitchdev", ["seek"]],
    ["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", ["seek"]],
  ] as const) {
    await request((ack) => host.emit("media:set", { url }, ack));
    const before = structuredClone(app.rooms.get(code)!);
    for (const action of actions) {
      const result = await request((ack) =>
        host.emit("playback:control", { action, position: 20 }, ack),
      );
      expect(result.ok).toBe(false);
      expect(app.rooms.get(code)).toEqual(before);
      const denied = await request((ack) =>
        guest.emit("playback:control", { action, position: 20 }, ack),
      );
      expect(denied).toMatchObject({
        ok: false,
        error: "Only the host and moderators can control playback.",
      });
      expect(app.rooms.get(code)).toEqual(before);
    }
  }
  expect(app.rooms.get(code)!.participants.map((p) => p.name)).toEqual([
    "Host",
    "Guest",
  ]);
});
it("live play/pause stays host-authoritative without an invented timeline", async () => {
  const { host, guest, code } = await setup();
  await request((ack) =>
    host.emit("media:set", { url: "https://twitch.tv/twitchdev" }, ack),
  );
  expect(
    (
      await request((ack) =>
        host.emit("playback:control", { action: "play", position: 0 }, ack),
      )
    ).ok,
  ).toBe(true);
  expect(
    currentPosition(app.rooms.get(code)!.playback, Date.now() + 100000),
  ).toBe(0);
  const denied = await request((ack) =>
    guest.emit("playback:control", { action: "pause", position: 0 }, ack),
  );
  expect(denied.ok).toBe(false);
});

describe("local file room protocol", () => {
  const fingerprint = "a".repeat(64);
  const otherFingerprint = "b".repeat(64);
  const metadata = {
    fingerprint,
    name: "movie.webm",
    size: 17_829,
    durationSec: 3.25,
  };

  async function localRoom() {
    const host = await connect();
    const guest = await connect();
    const created = await request<Room>((ack) =>
      host.emit("room:create", { name: "Host" }, ack),
    );
    if (!created.ok) throw new Error(created.error);
    const code = created.data.code;
    await request<Room>((ack) =>
      guest.emit("room:join", { name: "Guest", code }, ack),
    );
    return { host, guest, code };
  }

  it("lets only a controller set metadata-only local sources", async () => {
    const { host, guest, code } = await localRoom();
    expect(
      (
        await request((ack) =>
          guest.emit("room:setLocalSource", metadata, ack),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await request((ack) =>
          host.emit(
            "room:setLocalSource",
            { ...metadata, fingerprint: "A".repeat(64) },
            ack,
          ),
        )
      ).ok,
    ).toBe(false);

    const changed = nextState(
      guest,
      (room) => room.playback.media?.kind === "local",
    );
    expect(
      (
        await request((ack) =>
          host.emit(
            "room:setLocalSource",
            { ...metadata, name: "folder/movie.webm" },
            ack,
          ),
        )
      ).ok,
    ).toBe(true);
    const room = await changed;
    expect(room.playback.media).toEqual({
      kind: "local",
      id: fingerprint,
      url: "",
      local: { ...metadata, name: "foldermovie.webm" },
    });
    expect(JSON.stringify(app.rooms.get(code))).not.toContain("folder/movie.webm");
    expect(room.participants.every((person) => person.hasFile === false)).toBe(true);
  });

  it("tracks exact and explicitly accepted near copies and clears them on source change", async () => {
    const { host, guest, code } = await localRoom();
    await request((ack) => host.emit("room:setLocalSource", metadata, ack));

    let changed = nextState(
      guest,
      (room) => room.participants.find((p) => p.id === host.id)?.hasFile === true,
    );
    expect(
      (
        await request((ack) =>
          host.emit("source:ready", { fingerprint }, ack),
        )
      ).ok,
    ).toBe(true);
    expect(
      (await changed).participants.find((p) => p.id === host.id)?.hasFile,
    ).toBe(true);

    expect(
      (
        await request((ack) =>
          guest.emit("source:ready", { fingerprint: otherFingerprint }, ack),
        )
      ).ok,
    ).toBe(true);
    expect(
      app.rooms.get(code)!.participants.find((p) => p.id === guest.id)?.hasFile,
    ).toBe(false);

    changed = nextState(
      host,
      (room) => room.participants.find((p) => p.id === guest.id)?.hasFile === true,
    );
    expect(
      (
        await request((ack) =>
          guest.emit(
            "source:ready",
            { fingerprint: otherFingerprint, acceptedNearMatch: true },
            ack,
          ),
        )
      ).ok,
    ).toBe(true);
    await changed;

    const cleared = nextState(
      guest,
      (room) =>
        room.playback.media?.kind === "local" &&
        room.playback.media.id === otherFingerprint,
    );
    await request((ack) =>
      host.emit(
        "room:setLocalSource",
        { ...metadata, fingerprint: otherFingerprint, name: "next.webm" },
        ack,
      ),
    );
    expect((await cleared).participants.every((p) => p.hasFile === false)).toBe(
      true,
    );
  });

  it("rate limits local readiness updates per socket", async () => {
    const { host } = await localRoom();
    await request((ack) => host.emit("room:setLocalSource", metadata, ack));
    const results = [];
    for (let i = 0; i < 6; i++)
      results.push(
        await request((ack) =>
          host.emit(
            "source:ready",
            { fingerprint: i % 2 ? null : fingerprint },
            ack,
          ),
        ),
      );
    expect(results.slice(0, 5).every((result) => result.ok)).toBe(true);
    expect(results[5]?.ok).toBe(false);
  });
});
