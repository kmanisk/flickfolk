import express from "express";
import compression from "compression";
import { installGifRoutes } from "./gifs.js";
import { applyControl, applyLocalSource } from "./roomControls.js";
import { ControlRequests } from "./controlRequests.js";
import { createLimiter } from "./limits.js";
import { log } from "./log.js";
import helmet from "helmet";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  VOICE_OFF,
  FEATURES,
  MAX_VOICE_PEERS,
  cleanVoiceState,
  cleanSignal,
  cleanReaction,
  cleanLocalSource,
  gifUrl,
  CODE,
  can,
  promoteHost,
  cleanControlIntent,
  checkRequestLimit,
  type Role,
  type Permission,
  type ControlRequest,
  cleanChat,
  cleanName,
  normalizeCode,
  type Ack,
  type ClientEvents,
  type Room,
  type ServerEvents,
} from "@watchparty/shared";
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(compression());
  app.use((_req, res, next) => {
    res.set("Permissions-Policy", "camera=(), microphone=(self)");
    next();
  });
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  const allow = createLimiter();
  let shuttingDown = false;
  if (process.env.NODE_ENV === "production")
    app.use((req, res, next) => {
      const started = performance.now();
      res.on("finish", () =>
        log("http", {
          method: req.method,
          status: res.statusCode,
          durationMs: Math.round(performance.now() - started),
        }),
      );
      next();
    });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "https://www.youtube.com",
            "https://s.ytimg.com",
            "https://player.twitch.tv",
            "https://w.soundcloud.com",
          ],
          frameSrc: [
            "'self'",
            "https://www.youtube.com",
            "https://player.twitch.tv",
            "https://w.soundcloud.com",
            "https://open.spotify.com",
            "https://player.kick.com",
          ],
          mediaSrc: [
            "'self'",
            "https:",
            ...(process.env.NODE_ENV === "production" ? [] : ["http:"]),
            "blob:",
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:", "https://www.youtube.com"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  installGifRoutes(app, allow);
  app.get("/healthz", (_req, res) =>
    res
      .status(shuttingDown ? 503 : 200)
      .json({ status: shuttingDown ? "shutting_down" : "ok" }),
  );
  const http = createServer(app);
  const io = new Server<ClientEvents, ServerEvents>(http, {
    maxHttpBufferSize: 8192,
    connectionStateRecovery: {
      maxDisconnectionDuration: 30_000,
      skipMiddlewares: false,
    },
    cors: { origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" },
  });
  const rooms = new Map<string, Room>();
  const clientSessions = new Map<
    string,
    { roomCode: string; socketId: string }
  >();
  app.get("/api/rtc-config", (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!allow(`rtc:${req.ip}`, 60)) {
      res.status(429).json({ error: "Try voice again shortly." });
      return;
    }
    const urls = (value: string) =>
      value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    const stun = urls(
      process.env.STUN_URLS ?? "stun:stun.l.google.com:19302",
    ).filter((v) => /^stuns?:[^\s]+$/.test(v));
    const turn = urls(process.env.TURN_URLS ?? "").filter((v) =>
      /^turns?:[^\s]+$/.test(v),
    );
    const iceServers: {
      urls: string[];
      username?: string;
      credential?: string;
    }[] = stun.length ? [{ urls: stun }] : [];
    if (turn.length && process.env.TURN_USERNAME && process.env.TURN_PASSWORD)
      iceServers.push({
        urls: turn,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_PASSWORD,
      });
    res.json({ iceServers });
  });
  app.get("/api/rooms/:code", (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!allow(`lookup:${req.ip}`, 120)) {
      res.status(429).json({ error: "Too many lookups. Try again shortly." });
      return;
    }
    const code = req.params.code.toUpperCase();
    if (!CODE.test(code)) {
      res.status(400).json({ error: "Invalid room code." });
      return;
    }
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: "No signal." });
      return;
    }
    res.json({
      code: room.code,
      participants: room.participants.length,
      capacity: 24,
    });
  });
  const requests = new ControlRequests(
    rooms,
    (id, queue) => io.to(id).emit("control:requests", queue),
    (id, requestId) =>
      io
        .to(id)
        .emit("control:result", {
          requestId,
          approved: false,
          error: "Request expired.",
        }),
  );
  http.on("close", () => requests.close());
  const recovery = new Map<
    string,
    { code: string; role: Role; expiresAt: number }
  >();
  const broadcast = (room: Room) => {
    io.to(room.code).emit("room:state", room);
    requests.publish(room);
  };
  io.on("connection", (socket) => {
    let code: string | undefined;
    let clientId: string | undefined;
    const forwarded = socket.handshake.headers["x-forwarded-for"];
    const address =
      process.env.TRUST_PROXY === "1" && typeof forwarded === "string"
        ? forwarded.split(",").at(-1)!.trim()
        : socket.handshake.address;
    function limit(action: string, capacity: number) {
      if (!allow(`${action}:${address}`, capacity))
        throw new Error("Too many requests. Try again shortly.");
    }
    let allowance = 40;
    let replenished = Date.now();
    function guard<T>(ack: Ack<T>, run: () => T, mutation = true) {
      if (typeof ack !== "function") return;
      allowance = Math.min(40, allowance + (Date.now() - replenished) / 250);
      replenished = Date.now();
      if (mutation && allowance < 1) {
        ack({ ok: false, error: "Please slow down." });
        return;
      }
      if (mutation) allowance--;
      try {
        ack({ ok: true, data: run() });
      } catch (error) {
        ack({
          ok: false,
          error: error instanceof Error ? error.message : "Invalid request.",
        });
      }
    }
    function cleanClientId(value: unknown) {
      if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,64}$/.test(value))
        throw new Error("Invalid client identity.");
      return value;
    }
    function removeDuplicateClient(
      room: Room,
      nextClientId: string,
    ): Role | undefined {
      const previous = clientSessions.get(nextClientId);
      if (!previous || previous.socketId === socket.id) return;
      const previousRoom = rooms.get(previous.roomCode);
      const oldPerson = previousRoom?.participants.find(
        (p) => p.id === previous.socketId,
      );
      const role =
        previousRoom?.code === room.code ? oldPerson?.role : undefined;
      if (previousRoom) {
        previousRoom.participants = previousRoom.participants.filter(
          (p) => p.id !== previous.socketId,
        );
        if (previousRoom.hostId === previous.socketId) {
          if (previousRoom.code === room.code) previousRoom.hostId = socket.id;
          else promoteHost(previousRoom);
        }
        if (previousRoom.code !== room.code) {
          if (!previousRoom.participants.length) {
            rooms.delete(previousRoom.code);
            requests.delete(previousRoom.code);
          } else broadcast(previousRoom);
        }
      }
      void io.sockets.sockets.get(previous.socketId)?.leave(previous.roomCode);
      clientSessions.delete(nextClientId);
      return role;
    }
    function rememberClient(room: Room, nextClientId: string) {
      for (const [key, saved] of recovery)
        if (saved.expiresAt <= Date.now()) recovery.delete(key);
      clientId = nextClientId;
      recovery.delete(nextClientId);
      clientSessions.set(nextClientId, {
        roomCode: room.code,
        socketId: socket.id,
      });
    }
    function member() {
      const room = code ? rooms.get(code) : undefined;
      if (!room || !room.participants.some((p) => p.id === socket.id))
        throw new Error("Join a room first.");
      return room;
    }
    function authorize(action: Permission) {
      const room = member();
      const sender = room.participants.find((p) => p.id === socket.id)!;
      if (!can(sender.role, action))
        throw new Error(
          action === "play" ||
            action === "pause" ||
            action === "seek" ||
            action === "setVideo"
            ? "Only the host and moderators can control playback."
            : "Only the host can manage participants.",
        );
      return room;
    }
    function target(room: Room, userId: unknown) {
      if (typeof userId !== "string" || userId.length > 64)
        throw new Error("Invalid participant.");
      const person = room.participants.find((p) => p.id === userId);
      if (!person) throw new Error("Participant not found.");
      if (person.id === socket.id || person.role === "host")
        throw new Error("You cannot target the host or yourself.");
      return person;
    }
    function leave(disconnected = false) {
      if (!code) return;
      const room = rooms.get(code);
      void socket.leave(code);
      code = undefined;
      const person = room?.participants.find((p) => p.id === socket.id);
      if (clientId && clientSessions.get(clientId)?.socketId === socket.id) {
        if (disconnected && room && person) {
          if (recovery.size >= 1000)
            recovery.delete(recovery.keys().next().value!);
          recovery.set(clientId, {
            code: room.code,
            role: person.role === "host" ? "moderator" : person.role,
            expiresAt: Date.now() + 30_000,
          });
        }
        clientSessions.delete(clientId);
      }
      clientId = undefined;
      if (!room || !person) return;
      room.participants = room.participants.filter((p) => p.id !== socket.id);
      if (!room.participants.length) {
        rooms.delete(room.code);
        requests.delete(room.code);
        return;
      }
      if (room.hostId === socket.id) promoteHost(room);
      broadcast(room);
    }
    socket.on("room:create", (payload, ack) =>
      guard(ack, () => {
        limit("create", 10);
        const name = cleanName(payload?.name);
        const nextClientId = cleanClientId(payload?.clientId ?? socket.id);
        if (rooms.size >= 1000)
          throw new Error("Room capacity reached. Try again later.");
        let next: string;
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        do {
          next = Array.from(
            randomBytes(6),
            (b) => alphabet[b % alphabet.length],
          ).join("");
        } while (rooms.has(next));
        leave();
        code = next;
        const room: Room = {
          code,
          hostId: socket.id,
          participants: [
            { id: socket.id, name, role: "host", voice: { ...VOICE_OFF }, hasFile: false },
          ],
          messages: [],
          playback: {
            media: null,
            playing: false,
            position: 0,
            updatedAt: Date.now(),
            revision: 0,
          },
        };
        removeDuplicateClient(room, nextClientId);
        rememberClient(room, nextClientId);
        rooms.set(code, room);
        void socket.join(code);
        broadcast(room);
        return room;
      }),
    );
    socket.on("room:join", (payload, ack) =>
      guard(ack, () => {
        limit("join", 60);
        const name = cleanName(payload?.name);
        const nextClientId = cleanClientId(payload?.clientId ?? socket.id);
        if (typeof payload?.code !== "string")
          throw new Error("Enter a room code.");
        const next = normalizeCode(payload.code);
        if (!CODE.test(next))
          throw new Error("Room codes contain 6 letters or numbers.");
        const room = rooms.get(next);
        if (!room)
          throw new Error("Room not found. Ask your friend for a new invite.");
        if (
          code === next &&
          room.participants.some((p) => p.id === socket.id)
        ) {
          rememberClient(room, nextClientId);
          return room;
        }
        const previous = clientSessions.get(nextClientId);
        const replacesMember =
          previous?.roomCode === room.code &&
          room.participants.some((p) => p.id === previous.socketId);
        if (room.participants.length - (replacesMember ? 1 : 0) >= 24)
          throw new Error("This room is full (24 people).");
        const saved = recovery.get(nextClientId);
        const restored =
          saved?.code === room.code && saved.expiresAt > Date.now()
            ? saved.role
            : undefined;
        const role =
          removeDuplicateClient(room, nextClientId) ??
          restored ??
          "participant";
        leave();
        code = next;
        rememberClient(room, nextClientId);
        room.participants.push({
          id: socket.id,
          name,
          role,
          voice: { ...VOICE_OFF },
          hasFile: false,
        });
        void socket.join(code);
        broadcast(room);
        return room;
      }),
    );
    socket.on("room:leave", (ack) =>
      guard(ack, () => {
        leave();
      }),
    );
    socket.on("media:set", (payload, ack) =>
      guard(ack, () => {
        const room = authorize("setVideo");
        applyControl(room, {
          action: "setVideo",
          payload: { url: payload?.url },
        });
        broadcast(room);
      }),
    );
    socket.on("room:setLocalSource", (payload, ack) =>
      guard(ack, () => {
        if (!FEATURES.localFile) throw new Error("Local files are disabled.");
        const room = authorize("setVideo");
        applyLocalSource(room, cleanLocalSource(payload));
        broadcast(room);
      }),
    );
    socket.on("source:ready", (payload, ack) =>
      guard(ack, () => {
        if (!FEATURES.localFile) throw new Error("Local files are disabled.");
        const room = member();
        if (!allow(`local-ready:${socket.id}`, 5, 3000))
          throw new Error("Local file updates are too fast.");
        if (
          !payload ||
          (payload.fingerprint !== null &&
            (typeof payload.fingerprint !== "string" ||
              !/^[a-f0-9]{64}$/.test(payload.fingerprint))) ||
          (payload.acceptedNearMatch !== undefined &&
            typeof payload.acceptedNearMatch !== "boolean")
        )
          throw new Error("Invalid local file readiness.");
        const person = room.participants.find((p) => p.id === socket.id)!;
        const source = room.playback.media;
        const ready =
          source?.kind === "local" &&
          payload.fingerprint !== null &&
          (payload.fingerprint === source.local?.fingerprint ||
            payload.acceptedNearMatch === true);
        if (person.hasFile !== ready) {
          person.hasFile = ready;
          broadcast(room);
        }
      }),
    );
    socket.on("playback:control", (payload, ack) =>
      guard(ack, () => {
        const room = authorize(payload?.action);
        applyControl(room, {
          action: payload?.action,
          payload: { position: payload?.position },
        });
        broadcast(room);
      }),
    );
    socket.on("role:assign", (payload, ack) =>
      guard(ack, () => {
        const room = authorize("assignRole");
        const person = target(room, payload?.userId);
        if (payload?.role !== "moderator" && payload?.role !== "participant")
          throw new Error("Invalid role.");
        if (person.role === payload.role) return;
        const wasReviewer = can(person.role, "resolveRequest");
        person.role = payload.role;
        if (wasReviewer) io.to(person.id).emit("control:requests", []);
        broadcast(room);
        io.to(room.code).emit("role:assigned", {
          userId: person.id,
          username: person.name,
          role: person.role,
        });
      }),
    );
    socket.on("participant:remove", (payload, ack) =>
      guard(ack, () => {
        const room = authorize("removeParticipant");
        const person = target(room, payload?.userId);
        io.to(person.id).emit("participant:removed", {
          userId: person.id,
          reason: "removed_by_host",
        });
        void io.sockets.sockets.get(person.id)?.leave(room.code);
        for (const [key, session] of clientSessions)
          if (session.socketId === person.id) {
            clientSessions.delete(key);
            recovery.delete(key);
          }
        room.participants = room.participants.filter((p) => p.id !== person.id);
        broadcast(room);
      }),
    );
    socket.on("control:requests", (ack) =>
      guard(
        ack,
        () => {
          const room = authorize("resolveRequest");
          limit("request-queue", 120);
          requests.publish(room);
          return requests.current(room);
        },
        false,
      ),
    );
    socket.on("control:request", (payload, ack) =>
      guard(ack, () => {
        const room = member();
        const person = room.participants.find((p) => p.id === socket.id)!;
        if (person.role !== "participant")
          throw new Error("Use the playback controls directly.");
        limit("control-request", 60);
        const intent = cleanControlIntent(payload, room);
        const queue = requests.current(room);
        checkRequestLimit(queue, person.id, intent.action);
        const request: ControlRequest = {
          ...intent,
          id: randomUUID(),
          requesterId: person.id,
          requesterName: person.name,
          createdAt: Date.now(),
          sourceRevision: room.playback.revision,
        };
        requests.replace(room, [...queue, request]);
        return { requestId: request.id };
      }),
    );
    socket.on("control:resolve", (payload, ack) =>
      guard(ack, () => {
        const room = authorize("resolveRequest");
        if (
          typeof payload?.requestId !== "string" ||
          typeof payload?.approve !== "boolean"
        )
          throw new Error("Invalid request resolution.");
        const queue = requests.current(room);
        const request = queue.find((r) => r.id === payload.requestId);
        if (!request) {
          requests.publish(room);
          throw new Error("Request expired.");
        }
        // Remove before mutation so its successful resolution cannot also expire it.
        requests.replace(
          room,
          queue.filter((r) => r.id !== request.id),
        );
        if (payload.approve) {
          try {
            applyControl(room, request);
          } catch (error) {
            io.to(request.requesterId).emit("control:result", {
              requestId: request.id,
              approved: false,
              error: error instanceof Error ? error.message : "Request failed.",
            });
            throw error;
          }
          broadcast(room);
        }
        io.to(request.requesterId).emit("control:result", {
          requestId: request.id,
          approved: payload.approve,
        });
      }),
    );
    socket.on("chat:send", (payload, ack) =>
      guard(ack, () => {
        limit("chat", 120);
        const room = member();
        const text = cleanChat(payload?.text);
        if (
          payload.kind !== undefined &&
          payload.kind !== "text" &&
          payload.kind !== "gif"
        )
          throw new Error("Invalid message type.");
        const image =
          payload.kind === "gif" ||
          /^https?:\/\/\S+\.(gif|png|jpe?g|webp|avif)([?#]\S*)?$/i.test(text);
        const kind = image ? "gif" : "text";
        const content = image ? gifUrl(text) : text;
        room.messages.push({
          senderId: socket.id,
          id: randomUUID(),
          name: room.participants.find((p) => p.id === socket.id)!.name,
          text: content,
          kind,
          at: Date.now(),
        });
        room.messages = room.messages.slice(-100);
        broadcast(room);
      }),
    );
    socket.on("voice:state", (payload, ack) =>
      guard(
        ack,
        () => {
          limit("presence", 2400);
          if (!allow(`presence:${socket.id}`, 8, 1000))
            throw new Error("Microphone updates are too fast.");
          const room = member();
          const state = cleanVoiceState(payload);
          const person = room.participants.find((p) => p.id === socket.id)!;
          if (
            state.joined &&
            !person.voice.joined &&
            room.participants.filter((p) => p.voice.joined).length >=
              MAX_VOICE_PEERS
          )
            throw new Error(
              "Voice is full (8 people). Video and chat are still available.",
            );
          person.voice = state;
          io.to(room.code).emit("voice:presence", { id: socket.id, state });
        },
        false,
      ),
    );
    socket.on("voice:signal", (payload, ack) =>
      guard(
        ack,
        () => {
          limit("signal", 1200);
          const room = member();
          const from = room.participants.find((p) => p.id === socket.id)!;
          const to = room.participants.find((p) => p.id === payload?.targetId);
          if (!from.voice.joined || !to?.voice.joined || to.id === socket.id)
            throw new Error("Voice peer unavailable.");
          const signal = cleanSignal(payload?.signal);
          io.to(to.id).emit("voice:signal", { fromId: socket.id, signal });
        },
        false,
      ),
    );
    socket.on("reaction:send", (payload, ack) =>
      guard(ack, () => {
        const room = member();
        if (!allow(`reaction:${socket.id}`, 8, 3000))
          throw new Error("Reactions are too fast.");
        const symbol = cleanReaction(payload?.symbol);
        const clientId = payload.clientId;
        if (
          clientId !== undefined &&
          (typeof clientId !== "string" ||
            !/^[a-zA-Z0-9_-]{1,64}$/.test(clientId))
        )
          throw new Error("Invalid reaction identifier.");
        io.volatile.to(room.code).emit("reaction", {
          id: randomUUID(),
          senderId: socket.id,
          symbol,
          ...(clientId ? { clientId } : {}),
        });
      }),
    );
    socket.on("clock", (ack) => {
      if (typeof ack === "function") ack(Date.now());
    });
    socket.on("disconnect", () => leave(true));
  });
  const client = fileURLToPath(new URL("../../client/dist/", import.meta.url));
  // The official Spotify bootstrap needs eval; confine that exception to this frame.
  app.get(
    "/spotify-bridge.html",
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: [
            "'self'",
            "'unsafe-eval'",
            "https://open.spotify.com",
            "https://embed-cdn.spotifycdn.com",
          ],
          frameSrc: ["https://open.spotify.com"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["https://open.spotify.com"],
          frameAncestors: ["'self'"],
          baseUri: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
    }),
    (_req, res) =>
      res
        .set("Cache-Control", "no-cache")
        .sendFile("spotify-bridge.html", { root: client }),
  );
  app.use(
    "/assets",
    express.static(`${client}/assets`, { immutable: true, maxAge: "1y" }),
  );
  app.use(
    express.static(client, {
      index: false,
      setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
  app.get("/{*path}", (req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const entry =
      req.path === "/" || /^\/room\/[A-HJ-NP-Z2-9]{6}\/?$/i.test(req.path);
    res
      .set("Cache-Control", "no-cache")
      .status(entry ? 200 : 404)
      .sendFile("index.html", { root: client });
  });
  return {
    app,
    http,
    io,
    rooms,
    shutdown() {
      shuttingDown = true;
      requests.close();
      return new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
