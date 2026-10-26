import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import {
  CODE,
  cleanName,
  normalizeCode,
  parseMedia,
  type Ack as CollaborationAck,
  type Action,
  type Ack,
  type ClientEvents,
  type Result,
  type Room,
  type ServerEvents,
} from "@watchparty/shared";
import { startClock } from "./lib/syncRuntime.js";
import { Home } from "./Home.js";
import { Toast } from "./ui/index.js";
import { useRoomLookup } from "./useRoomLookup.js";
import { loadAccent } from "./accent.js";
import "./style.css";
import "./polish4.css";
loadAccent();
const RoomView = lazy(() => import("./RoomView.js"));
const socket: Socket<ServerEvents, ClientEvents> = io({
  autoConnect: false,
  transports: ["websocket", "polling"],
  tryAllTransports: true,
});
function storedName() {
  try {
    return localStorage.getItem("afterglow-name") || "";
  } catch {
    return "";
  }
}
function storedClientId() {
  try {
    const current = localStorage.getItem("flickfolk-client-id");
    if (current) return current;
    const next = crypto.randomUUID();
    localStorage.setItem("flickfolk-client-id", next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}
const clientId = storedClientId();
function App() {
  const [effects, setEffects] = useState(true);
  const [notFound, setNotFound] = useState(
    () =>
      location.pathname !== "/" &&
      !/^\/room\/[A-HJ-NP-Z2-9]{6}\/?$/i.test(location.pathname),
  );
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const [name, setName] = useState(storedName);
  const nameRef = useRef(name);
  nameRef.current = name;
  const [joinCode, setJoinCode] = useState(() =>
    location.pathname.startsWith("/room/") ? normalizeCode(location.href) : "",
  );
  const lookup = useRoomLookup(joinCode);
  const [status, setStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinInvalid, setJoinInvalid] = useState(false);
  const connected = status === "Connected";
  const debug = new URLSearchParams(location.search).get("debug") === "1";
  function accept(next: Room) {
    const current = roomRef.current;
    if (
      current?.code === next.code &&
      current.playback.revision > next.playback.revision
    )
      next = { ...next, playback: current.playback };
    roomRef.current = next;
    setRoom(next);
  }
  function ack(result: Result) {
    if (!result.ok) setError(result.error);
  }
  useEffect(() => {
    const stopClock = startClock(socket);
    function connect() {
      const previous = roomRef.current;
      if (previous) {
        setStatus("Rejoining");
        socket
          .timeout(5000)
          .emit(
            "room:join",
            { name: nameRef.current, code: previous.code, clientId },
            (err: Error | null, result: Result<Room>) => {
              setStatus("Connected");
              if (err || !result.ok) {
                roomRef.current = null;
                setRoom(null);
                setError(
                  err
                    ? "Could not rejoin. Try joining again."
                    : !result.ok
                      ? result.error
                      : "",
                );
                history.replaceState(null, "", "/");
              } else accept(result.data);
            },
          );
      } else setStatus("Connected");
    }
    socket.on("connect", connect);
    socket.on("disconnect", () => {
      setStatus("Reconnecting");
    });
    socket.on("connect_error", () => setStatus("Reconnecting"));
    socket.on("room:state", accept);
    socket.on("voice:presence", ({ id, state }) => {
      const current = roomRef.current;
      if (!current) return;
      accept({
        ...current,
        participants: current.participants.map((p) =>
          p.id === id ? { ...p, voice: state } : p,
        ),
      });
    });
    const offline = () => socket.io.engine?.close();
    const online = () => socket.connect();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    socket.connect();
    return () => {
      stopClock();
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    const pop = () => {
      if (!location.pathname.startsWith("/room/")) leave();
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  });
  function enter(create: boolean) {
    setError("");
    let clean: string;
    try {
      clean = cleanName(name);
      if (!create && !CODE.test(normalizeCode(joinCode))) {
        setJoinInvalid(true);
        return;
      }
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (!socket.connected || busy) return;
    setBusy(true);
    const response = (err: Error | null, result: Result<Room>) => {
      setBusy(false);
      if (err) {
        setError("Request timed out. Please try again.");
        return;
      }
      if (!result.ok) {
        if (!create && result.error.startsWith("Room not found"))
          setJoinInvalid(true);
        else setError(result.error);
        return;
      }
      try {
        localStorage.setItem("afterglow-name", clean);
      } catch {
        /* Storage is optional. */
      }
      setName(clean);
      accept(result.data);
      history.pushState(
        null,
        "",
        `/room/${result.data.code}${debug ? "?debug=1" : ""}`,
      );
    };
    if (create)
      socket
        .timeout(7000)
        .emit("room:create", { name: clean, clientId }, response);
    else
      socket
        .timeout(7000)
        .emit(
          "room:join",
          { name: clean, code: normalizeCode(joinCode), clientId },
          response,
        );
  }
  function request(send: (done: Ack) => void) {
    if (!socket.connected) {
      setError("Connection lost. Wait until you reconnect.");
      return;
    }
    setError("");
    const timer = window.setTimeout(
      () => setError("Request timed out. Please try again."),
      7000,
    );
    send((result) => {
      window.clearTimeout(timer);
      ack(result);
    });
  }
  function leave() {
    if (socket.connected) socket.emit("room:leave", ack);
    roomRef.current = null;
    setRoom(null);
    setError("");
    setNotFound(false);
    history.replaceState(null, "", "/");
  }
  function load(value: string) {
    try {
      parseMedia(value);
      request((done) => socket.emit("media:set", { url: value }, done));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function control(action: Action, position: number) {
    request((done) =>
      socket.emit("playback:control", { action, position }, done),
    );
  }
  function sendChat(
    text: string,
    kind: "text" | "gif",
    done: CollaborationAck,
  ) {
    if (!socket.connected) {
      done({ ok: false, error: "Wait until you reconnect." });
      return;
    }
    socket
      .timeout(7000)
      .emit("chat:send", { text, kind }, (err, result) =>
        done(err ? { ok: false, error: "Message timed out." } : result),
      );
  }
  return (
    <>
      <Suspense
        fallback={<div className="room-loading">Opening your room…</div>}
      >
        {room ? (
          <RoomView
            socket={socket}
            room={room}
            connected={connected}
            status={status}
            effects={effects}
            setEffects={setEffects}
            leave={leave}
            control={control}
            load={load}
            sendChat={sendChat}
          />
        ) : (
          <Home
            name={name}
            setName={setName}
            code={joinCode}
            setCode={(value) => {
              setJoinCode(value);
              setJoinInvalid(false);
            }}
            joinInvalid={joinInvalid}
            enter={enter}
            connected={connected}
            status={status}
            busy={busy}
            lookup={lookup}
            notFound={notFound}
            goHome={leave}
          />
        )}
      </Suspense>
      <Toast message={error} onDismiss={() => setError("")} />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
