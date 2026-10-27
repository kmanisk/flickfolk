import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import {
  type Ack,
  type ClientEvents,
  type ControlRequest,
  type Result,
  type Room,
  type ServerEvents,
} from "@watchparty/shared";
import { ControlRequests } from "../src/controlRequests.js";
import { createApp } from "../src/server.js";

type Client = Socket<ServerEvents, ClientEvents>;
let app: ReturnType<typeof createApp>,
  base: string,
  clients: Client[],
  host: Client,
  guest: Client,
  mod: Client,
  room: Room;
function send<T = void>(run: (ack: Ack<T>) => void): Promise<Result<T>> {
  return new Promise((resolve) => run(resolve));
}
function ok<T>(result: Result<T>): T {
  expect(result.ok, result.ok ? "" : result.error).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
async function connect() {
  const c: Client = io(base, {
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  });
  clients.push(c);
  await new Promise<void>((resolve, reject) => {
    c.once("connect", resolve);
    c.once("connect_error", reject);
  });
  return c;
}
async function join(c: Client, name: string, clientId?: string) {
  return ok(
    await send<Room>((ack) =>
      c.emit("room:join", { code: room.code, name, clientId }, ack),
    ),
  );
}
async function pending(c = host) {
  return ok(
    await send<ControlRequest[]>((ack) => c.emit("control:requests", ack)),
  );
}
async function ask(action: "play" | "pause" | "seek" = "pause", c = guest) {
  return ok(
    await send<{ requestId: string }>((ack) =>
      c.emit("control:request", { action, payload: { position: 23 } }, ack),
    ),
  ).requestId;
}
function state() {
  return app.rooms.get(room.code)!;
}
function invariant() {
  expect(
    state()
      .participants.filter((p) => p.role === "host")
      .map((p) => p.id),
  ).toEqual([state().hostId]);
}
beforeEach(async () => {
  app = createApp();
  clients = [];
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  base = `http://127.0.0.1:${(app.http.address() as AddressInfo).port}`;
  host = await connect();
  guest = await connect();
  mod = await connect();
  room = ok(
    await send<Room>((ack) =>
      host.emit(
        "room:create",
        { name: "Host", clientId: "host-client-123" },
        ack,
      ),
    ),
  );
  await join(guest, "Guest", "guest-client-123");
  await join(mod, "Mod", "mod-client-123");
  ok(
    await send((ack) =>
      host.emit("role:assign", { userId: mod.id!, role: "moderator" }, ack),
    ),
  );
  ok(
    await send((ack) =>
      host.emit("media:set", { url: "https://example.com/movie.mp4" }, ack),
    ),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  clients.forEach((c) => c.disconnect());
  await app.shutdown();
});

describe("server-enforced roles", () => {
  it("ignores client-supplied roles and invalidates replaced socket authority", async () => {
    const impostor = await connect();
    const payload = {
      code: room.code,
      name: "Impostor",
      role: "host",
      isHost: true,
    };
    const joined = ok(
      await send<Room>((ack) => impostor.emit("room:join", payload, ack)),
    );
    expect(joined.participants.find((p) => p.id === impostor.id)?.role).toBe(
      "participant",
    );
    const control = {
      action: "play" as const,
      position: 0,
      role: "host",
      isModerator: true,
    };
    expect(
      (await send((ack) => impostor.emit("playback:control", control, ack))).ok,
    ).toBe(false);
    const replacement = await connect();
    await join(replacement, "Host", "host-client-123");
    const before = structuredClone(state().playback);
    expect(
      (
        await send((ack) =>
          host.emit("playback:control", { action: "play", position: 0 }, ack),
        )
      ).ok,
    ).toBe(false);
    expect(state().playback).toEqual(before);
    invariant();
  });
  it.each(["play", "pause", "seek"] as const)(
    "rejects participant %s with no mutation or broadcast",
    async (action) => {
      const before = structuredClone(state().playback),
        broadcasts = vi.fn();
      host.on("room:state", broadcasts);
      expect(
        await send((ack) =>
          guest.emit("playback:control", { action, position: 20 }, ack),
        ),
      ).toMatchObject({ ok: false });
      expect(state().playback).toEqual(before);
      expect(broadcasts).not.toHaveBeenCalled();
      invariant();
    },
  );
  it("rejects participant sources, role spoofing and request queue reads", async () => {
    const before = structuredClone(state().playback);
    expect(
      (
        await send((ack) =>
          guest.emit(
            "media:set",
            { url: "https://example.com/other.mp4" },
            ack,
          ),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await send<ControlRequest[]>((ack) =>
          guest.emit("control:requests", ack),
        )
      ).ok,
    ).toBe(false);
    expect(state().playback).toEqual(before);
  });
  it("lets moderators play, pause, seek and change sources", async () => {
    for (const action of ["play", "pause", "seek"] as const)
      ok(
        await send((ack) =>
          mod.emit("playback:control", { action, position: 25 }, ack),
        ),
      );
    expect(state().playback.position).toBe(25);
    ok(
      await send((ack) =>
        mod.emit("media:set", { url: "https://youtu.be/dQw4w9WgXcQ" }, ack),
      ),
    );
    expect(state().playback.media?.kind).toBe("youtube");
    ok(
      await send((ack) =>
        host.emit("media:set", { url: "https://kick.com/channel" }, ack),
      ),
    );
    const before = structuredClone(state().playback);
    expect(
      (
        await send((ack) =>
          mod.emit("playback:control", { action: "seek", position: 3 }, ack),
        )
      ).ok,
    ).toBe(false);
    expect(state().playback).toEqual(before);
  });
  it("rejects moderator/participant management and invalid host assignments", async () => {
    for (const client of [mod, guest]) {
      expect(
        (
          await send((ack) =>
            client.emit(
              "role:assign",
              { userId: guest.id!, role: "moderator" },
              ack,
            ),
          )
        ).ok,
      ).toBe(false);
      expect(
        (
          await send((ack) =>
            client.emit("participant:remove", { userId: guest.id! }, ack),
          )
        ).ok,
      ).toBe(false);
    }
    for (const userId of [host.id!, "missing"])
      expect(
        (
          await send((ack) =>
            host.emit("role:assign", { userId, role: "participant" }, ack),
          )
        ).ok,
      ).toBe(false);
    expect(
      (
        await send((ack) =>
          host.emit(
            "role:assign",
            { userId: guest.id!, role: "host" as "moderator" },
            ack,
          ),
        )
      ).ok,
    ).toBe(false);
    invariant();
  });
  it("broadcasts promotion/demotion, and unchanged roles do not duplicate broadcasts", async () => {
    const event = new Promise<Parameters<ServerEvents["role:assigned"]>[0]>(
      (resolve) => guest.once("role:assigned", resolve),
    );
    ok(
      await send((ack) =>
        host.emit("role:assign", { userId: guest.id!, role: "moderator" }, ack),
      ),
    );
    expect(await event).toMatchObject({ userId: guest.id, role: "moderator" });
    expect(state().participants.find((p) => p.id === guest.id)?.role).toBe(
      "moderator",
    );
    const broadcasts = vi.fn();
    host.on("room:state", broadcasts);
    ok(
      await send((ack) =>
        host.emit("role:assign", { userId: guest.id!, role: "moderator" }, ack),
      ),
    );
    expect(broadcasts).not.toHaveBeenCalled();
    ok(
      await send((ack) =>
        host.emit(
          "role:assign",
          { userId: guest.id!, role: "participant" },
          ack,
        ),
      ),
    );
    expect(state().participants.find((p) => p.id === guest.id)?.role).toBe(
      "participant",
    );
    invariant();
  });
  it("removes a member, clears requests and blocks further controls/chat/signaling", async () => {
    await ask();
    const removed = new Promise((resolve) =>
      guest.once("participant:removed", resolve),
    );
    const changed = new Promise<Room>((resolve) =>
      mod.once("room:state", resolve),
    );
    const guestId = guest.id!;
    ok(
      await send((ack) =>
        host.emit("participant:remove", { userId: guestId }, ack),
      ),
    );
    expect(await removed).toEqual({
      userId: guestId,
      reason: "removed_by_host",
    });
    expect((await changed).participants.some((p) => p.id === guestId)).toBe(
      false,
    );
    expect(await pending()).toHaveLength(0);
    expect(
      (await send((ack) => guest.emit("chat:send", { text: "removed" }, ack)))
        .ok,
    ).toBe(false);
    expect(
      (
        await send((ack) =>
          guest.emit(
            "voice:signal",
            {
              targetId: mod.id!,
              signal: { kind: "description", type: "offer", sdp: "v=0" },
            },
            ack,
          ),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await send((ack) =>
          mod.emit(
            "voice:signal",
            {
              targetId: guestId,
              signal: { kind: "description", type: "offer", sdp: "v=0" },
            },
            ack,
          ),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await send((ack) =>
          host.emit("participant:remove", { userId: host.id! }, ack),
        )
      ).ok,
    ).toBe(false);
    await join(guest, "Guest");
    expect(state().participants.some((p) => p.id === guest.id)).toBe(true);
    invariant();
  });
  it("promotes a moderator first, and a participant if no moderator remains", async () => {
    host.disconnect();
    await expect.poll(() => state().hostId).toBe(mod.id);
    invariant();
    mod.disconnect();
    await expect.poll(() => state().hostId).toBe(guest.id);
    invariant();
  });
  it("replaces host/moderator sockets without duplicates and preserves valid roles on reconnect", async () => {
    const host2 = await connect();
    await join(host2, "Host", "host-client-123");
    expect(state().hostId).toBe(host2.id);
    expect(state().participants).toHaveLength(3);
    invariant();
    const mod2 = await connect();
    await join(mod2, "Mod", "mod-client-123");
    expect(state().participants.find((p) => p.id === mod2.id)?.role).toBe(
      "moderator",
    );
    mod2.disconnect();
    await expect.poll(() => state().participants.length).toBe(2);
    const mod3 = await connect();
    await join(mod3, "Mod", "mod-client-123");
    expect(state().participants.find((p) => p.id === mod3.id)?.role).toBe(
      "moderator",
    );
    invariant();
    host2.disconnect();
    await expect.poll(() => state().hostId).toBe(mod3.id);
    const host3 = await connect();
    await join(host3, "Host", "host-client-123");
    expect(state().participants.find((p) => p.id === host3.id)?.role).toBe(
      "moderator",
    );
    invariant();
  });
});

describe("participant approval flow", () => {
  it("delivers private reviewer queues; host approval runs the same seek mutation", async () => {
    const leaked = vi.fn();
    guest.on("control:requests", leaked);
    const id = await ask("seek");
    expect((await pending()).map((r) => r.id)).toEqual([id]);
    expect(await pending(mod)).toHaveLength(1);
    expect(leaked).not.toHaveBeenCalled();
    const result = new Promise((resolve) =>
      guest.once("control:result", resolve),
    );
    const before = state().playback.revision;
    ok(
      await send((ack) =>
        host.emit("control:resolve", { requestId: id, approve: true }, ack),
      ),
    );
    expect(await result).toMatchObject({ approved: true, requestId: id });
    expect(state().playback.position).toBe(23);
    expect(state().playback.revision).toBe(before + 1);
  });
  it("denial leaves playback unchanged and moderator approval executes", async () => {
    const id = await ask("play"),
      before = structuredClone(state().playback);
    const result = new Promise((resolve) =>
      guest.once("control:result", resolve),
    );
    ok(
      await send((ack) =>
        mod.emit("control:resolve", { requestId: id, approve: false }, ack),
      ),
    );
    expect(await result).toMatchObject({ approved: false });
    expect(state().playback).toEqual(before);
    const next = await ask("play");
    ok(
      await send((ack) =>
        mod.emit("control:resolve", { requestId: next, approve: true }, ack),
      ),
    );
    expect(state().playback.playing).toBe(true);
  });
  it("approves validated source requests and rejects malformed requests/resolutions", async () => {
    const { requestId } = ok(
      await send<{ requestId: string }>((ack) =>
        guest.emit(
          "control:request",
          {
            action: "setVideo",
            payload: { url: "https://youtu.be/dQw4w9WgXcQ" },
          },
          ack,
        ),
      ),
    );
    ok(
      await send((ack) =>
        mod.emit("control:resolve", { requestId, approve: true }, ack),
      ),
    );
    expect(state().playback.media?.kind).toBe("youtube");
    expect(
      (
        await send<{ requestId: string }>((ack) =>
          guest.emit(
            "control:request",
            { action: "seek", payload: { position: -1 } },
            ack,
          ),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await send((ack) =>
          host.emit(
            "control:resolve",
            { requestId: "missing", approve: "yes" as unknown as boolean },
            ack,
          ),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await send((ack) =>
          guest.emit(
            "control:resolve",
            { requestId: "missing", approve: true },
            ack,
          ),
        )
      ).ok,
    ).toBe(false);
  });
  it("bounds three requests per participant and deduplicates action", async () => {
    await ask("play");
    await ask("pause");
    await ask("seek");
    expect(
      (
        await send<{ requestId: string }>((ack) =>
          guest.emit(
            "control:request",
            { action: "play", payload: { position: 1 } },
            ack,
          ),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await send<{ requestId: string }>((ack) =>
          guest.emit(
            "control:request",
            {
              action: "setVideo",
              payload: { url: "https://example.com/next.mp4" },
            },
            ack,
          ),
        )
      ).ok,
    ).toBe(false);
    expect(await pending()).toHaveLength(3);
  });
  it("expires requests after 60s and rejects a stale resolution", async () => {
    // Age only the request clock; advancing global time expires real WebSocket heartbeats.
    const snapshot = vi.spyOn(ControlRequests.prototype, "current");
    const id = await ask();
    snapshot.mock.results.at(-1)!.value[0].createdAt = Date.now() - 60_001;
    const result = new Promise((resolve) =>
      guest.once("control:result", resolve),
    );
    expect(await pending()).toHaveLength(0);
    expect(await result).toMatchObject({
      approved: false,
      error: "Request expired.",
    });
    expect(
      (
        await send((ack) =>
          host.emit("control:resolve", { requestId: id, approve: true }, ack),
        )
      ).ok,
    ).toBe(false);
  });
  it("invalidates queues on source/revision, disconnect and promotion", async () => {
    await ask();
    ok(
      await send((ack) =>
        host.emit("media:set", { url: "https://example.com/next.mp4" }, ack),
      ),
    );
    expect(await pending()).toHaveLength(0);
    await ask();
    ok(
      await send((ack) =>
        mod.emit("playback:control", { action: "play", position: 0 }, ack),
      ),
    );
    expect(await pending()).toHaveLength(0);
    await ask();
    ok(
      await send((ack) =>
        host.emit("role:assign", { userId: guest.id!, role: "moderator" }, ack),
      ),
    );
    expect(await pending()).toHaveLength(0);
    ok(
      await send((ack) =>
        host.emit(
          "role:assign",
          { userId: guest.id!, role: "participant" },
          ack,
        ),
      ),
    );
    await ask();
    guest.disconnect();
    await expect.poll(() => state().participants.length).toBe(2);
    expect(await pending()).toHaveLength(0);
  });
  it("revalidates provider capability on approval instead of claiming success", async () => {
    const id = await ask("seek");
    // Simulate capability availability changing without a new source revision.
    state().playback.media = {
      kind: "kick",
      id: "channel",
      live: true,
      url: "https://player.kick.com/channel",
    };
    const result = new Promise((resolve) =>
        guest.once("control:result", resolve),
      ),
      before = structuredClone(state().playback);
    expect(
      (
        await send((ack) =>
          mod.emit("control:resolve", { requestId: id, approve: true }, ack),
        )
      ).ok,
    ).toBe(false);
    expect(await result).toMatchObject({
      approved: false,
      error: expect.stringContaining("support"),
    });
    expect(state().playback).toEqual(before);
  });
});
