import { usePresence } from "./usePresence.js";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import {
  type Ack as CollaborationAck,
  CODE,
  cleanName,
  normalizeCode,
  parseMedia,
  type Action,
  type Ack,
  type ClientEvents,
  type Result,
  type Room,
  type ServerEvents,
} from "@watchparty/shared";
import { ParticipantRow } from "./ParticipantRow.js";
import { ChatPanel } from "./ChatPanel.js";
import { useReactions } from "./useReactions.js";
import { useVoice } from "./useVoice.js";
import { Player, type PlaybackMetrics } from "./Player.js";
import { TestCard } from "./TestCard.js";
import { useRoomLookup } from "./useRoomLookup.js";
import "./style.css";
const socket: Socket<ServerEvents, ClientEvents> = io({ autoConnect: false });
const demo = "https://media.w3.org/2010/05/bunny/trailer.mp4";
function storedName() {
  try {
    return localStorage.getItem("afterglow-name") || "";
  } catch {
    return "";
  }
}
function App() {
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<"chat" | "people">("chat");
  const [effects, setEffects] = useState(true);
  const [ducking, setDucking] = useState(() => {
    try {
      return localStorage.getItem("afterglow-ducking") !== "off";
    } catch {
      return true;
    }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notFound, setNotFound] = useState(
    () =>
      location.pathname !== "/" &&
      !/^\/room\/[A-HJ-NP-Z2-9]{6}\/?$/i.test(location.pathname),
  );
  const [rtt, setRtt] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<PlaybackMetrics>({
    driftMs: null,
    state: "waiting",
  });
  const chatInput = useRef<HTMLTextAreaElement>(null);
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
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const offset = useRef(0);
  const connected = status === "Connected";
  const host = room?.hostId === socket.id;
  const voice = useVoice(
    socket,
    room?.code,
    connected,
    room?.participants ?? [],
  );
  const departed = usePresence(room?.participants ?? [], room?.code);
  const reactionState = useReactions(socket, room?.code, effects);
  const remoteSpeaking = Object.values(voice.remoteSpeaking).some(Boolean);
  const speakers = room?.participants.map((p) => ({
    id: p.id, name: p.name,
    speaking: p.id === socket.id ? voice.state.speaking : p.voice.joined && !p.voice.muted && (voice.remoteSpeaking[p.id] ?? p.voice.speaking),
  })) ?? [];
  const debug = new URLSearchParams(location.search).get("debug") === "1";
  const [sourceOpen, setSourceOpen] = useState(false);
  useEffect(() => { setSourceOpen(false); }, [room?.playback.media?.url]);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add("reveal-visible"); observer.unobserve(entry.target);
      }
    }, { threshold: .08 });
    document.querySelectorAll(".home-display, .home-notes").forEach((element) => { element.classList.add("reveal-ready"); observer.observe(element); });
    return () => observer.disconnect();
  }, [!!room]);
  function accept(next: Room) {
    roomRef.current = next;
    setRoom(next);
  }
  function ack(result: Result) {
    if (!result.ok) setError(result.error);
  }
  useEffect(() => {
    function clock() {
      if (!socket.connected) return;
      const started = Date.now();
      const monotonic = performance.now();
      socket.timeout(5000).emit("clock", (err: Error | null, now: number) => {
        if (!err) {
          offset.current = now - (started + Date.now()) / 2;
          setRtt(Math.round(performance.now() - monotonic));
        } else setRtt(null);
      });
    }
    function connect() {
      clock();
      const previous = roomRef.current;
      if (previous) {
        setStatus("Rejoining");
        socket
          .timeout(5000)
          .emit(
            "room:join",
            { name: nameRef.current, code: previous.code },
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
      setRtt(null);
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
    const timer = window.setInterval(clock, 15000);
    return () => {
      window.clearInterval(timer);
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
      if (!create && !CODE.test(normalizeCode(joinCode)))
        throw new Error("Enter a 6-character room code or invite URL.");
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
        setError(result.error);
        return;
      }
      try {
        localStorage.setItem("afterglow-name", clean);
      } catch {
        /* Storage is optional. */
      }
      setName(clean);
      accept(result.data);
      history.pushState(null, "", `/room/${result.data.code}${debug ? "?debug=1" : ""}`);
    };
    if (create)
      socket.timeout(7000).emit("room:create", { name: clean }, response);
    else
      socket
        .timeout(7000)
        .emit(
          "room:join",
          { name: clean, code: normalizeCode(joinCode) },
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
    voice.stop();
    setUnread(0);
    if (socket.connected) socket.emit("room:leave", ack);
    roomRef.current = null;
    setRoom(null);
    setError("");
    setUrl("");
    setNotFound(false);
    setMetrics({ driftMs: null, state: "waiting" });
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
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/room/${room?.code}`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`Copy this invite: ${location.origin}/room/${room?.code}`);
    }
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
  const react = reactionState.send;
  useEffect(() => {
    if (!room) return;
    const key = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
          ))
      )
        return;
      if (event.key.toLowerCase() === "x") {
        event.preventDefault();
        setEffects((value) => !value);
      }
      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        void voice.toggle();
      }
      if (event.key === "/") {
        event.preventDefault();
        setTab("chat");
        window.requestAnimationFrame(() => chatInput.current?.focus());
      }
      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        void copy();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const hostName =
    room?.participants.find((p) => p.id === room.hostId)?.name ?? "--";
  const syncState = !connected
    ? status.toLowerCase()
    : !room
      ? "standby"
      : metrics.state;
  return (
    <div className={`app ${effects ? "fx-on" : "fx-off"}`}>
      <header className="site-header">
        <a
          className="brand"
          href="/"
          aria-label="Afterglow home"
          onClick={(e) => {
            e.preventDefault();
            leave();
          }}
        >
          <span className="brand-icon" aria-hidden="true">
            ◈
          </span>
          afterglow<span className="brand-period">.</span>
        </a>
        <span className="header-caption">
          {room
            ? `PRIVATE SCREENING / ${room.code}`
            : "INDEPENDENT WATCHING, TOGETHER."}
        </span>
        <div className="header-right">
          <span
            className={`connection ${connected ? "online" : ""}`}
            role="status"
          >
            <i />
            {status}
          </span>
          <button
            className="fx-toggle"
            aria-pressed={effects}
            title="Toggle visual effects (reduced motion always wins)"
            onClick={() => setEffects((value) => !value)}
          >
            [fx{effects ? "" : " off"}]
          </button>
          {room && (
            <button
              className={`mic-button ${voice.state.speaking ? "is-speaking" : ""}`}
              aria-label={
                !voice.state.joined
                  ? "Enable microphone"
                  : voice.state.muted
                    ? "Unmute microphone"
                    : "Mute microphone"
              }
              aria-pressed={voice.state.joined && !voice.state.muted}
              disabled={!connected || voice.busy}
              onClick={() => void voice.toggle(true)}
            >
              {voice.busy
                ? "Mic…"
                : voice.state.joined && !voice.state.muted
                  ? "Mic on"
                  : voice.state.joined
                    ? "Mic muted"
                    : "Mic off"}
            </button>
          )}
          {room && (
            <div className="settings-control">
              <button
                className="settings-toggle"
                aria-label="Audio settings"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((value) => !value)}
              >
                ⋯
              </button>
              {settingsOpen && (
                <div className="settings-menu popup-surface">
                  <button
                    aria-pressed={ducking}
                    onClick={() => {
                      const next = !ducking;
                      setDucking(next);
                      try {
                        localStorage.setItem(
                          "afterglow-ducking",
                          next ? "on" : "off",
                        );
                      } catch {
                        /* Local preference storage is optional. */
                      }
                    }}
                  >
                    Voice ducking: {ducking ? "On" : "Off"} {ducking && "✓"}
                  </button>
                </div>
              )}
            </div>
          )}
          {voice.needsAudio && (
            <button className="mic-button" onClick={voice.enableAudio}>
              Enable voice audio
            </button>
          )}
          {room && (
            <button className="text-button" onClick={leave}>
              Leave room ↗
            </button>
          )}
        </div>
      </header>
      {room && voice.error && (
        <p className="voice-error" role="alert">
          {voice.error}
        </p>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {notFound ? (
        <main className="no-signal">
          <span className="eyebrow">404 / CHANNEL NOT FOUND</span>
          <h1>No signal.</h1>
          <p>This frequency is empty. Let’s get you back to your people.</p>
          <button className="primary" onClick={leave}>
            Back to the station ↗
          </button>
        </main>
      ) : !room ? (
        <main className="home">
          <section className="home-hero">
            <div className="eyebrow">
              <i /> A LITTLE CLOSER, FROM ANYWHERE.
            </div>
            <h1>
              Same movie.
              <br />
              <em>Same second.</em>
            </h1>
            <div className="hero-bottom">
              <p>
                For the friends on the other side of town.
                <br />
                Or the other side of the world. Tune in together.
              </p>
              <span className="edition">
                NO. 001
                <br />
                THE SHARED SCREEN ISSUE
              </span>
            </div>
          </section>
          <section className="ticket" aria-label="Create or join a room">
            <div className="ticket-top">
              <span>ADMIT YOUR PEOPLE</span>
              <span>01 / ∞</span>
            </div>
            <div className="ticket-body">
              <span className="eyebrow">YOUR EVENING STARTS HERE</span>
              <h2>Take your seat.</h2>
              <label htmlFor="name">What should we call you?</label>
              <input
                id="name"
                autoComplete="nickname"
                maxLength={32}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your display name"
              />
              <button
                className="primary full"
                disabled={!connected || busy}
                onClick={() => enter(true)}
              >
                {busy ? "Getting your seat…" : "Create a room"}
                <span>↗</span>
              </button>
              <p className="field-hint">
                No sign-up. No downloads. Just good company.
              </p>
            </div>
            <div className="ticket-perforation">
              <span>OR TUNE INTO A FRIEND’S ROOM</span>
            </div>
            <form
              className="ticket-join"
              onSubmit={(e) => {
                e.preventDefault();
                enter(false);
              }}
            >
              <label htmlFor="code">Room code or invite link</label>
              <div className="join-row">
                <input
                  id="code"
                  maxLength={2048}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="ABC234"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button className="secondary" disabled={!connected || busy}>
                  Join →
                </button>
              </div>
              <div
                className={`lookup lookup-${lookup.state}`}
                aria-live="polite"
                data-testid="room-lookup"
              >
                <i />
                <span>
                  {lookup.state === "waiting"
                    ? "waiting"
                    : lookup.state === "tuning"
                      ? "tuning…"
                      : lookup.state === "found"
                        ? `room found / ${lookup.count} ${lookup.count === 1 ? "person" : "people"} on this channel`
                        : "no signal"}
                </span>
              </div>
              {lookup.detail && (
                <p className="lookup-detail">{lookup.detail}</p>
              )}
            </form>
            <div className="ticket-stub">
              <span>ONE LINK. EVERYONE IN SYNC.</span>
              <div className="barcode" aria-hidden="true" />
            </div>
          </section>
          <section className="home-display">
            <div className="crt-label">
              <span>MONITOR 01</span>
              <span>LIVE ROOM FREQUENCY</span>
            </div>
            <div className="crt-bezel">
              <div className="crt-screen">
                <TestCard
                  channel={normalizeCode(joinCode).slice(0, 6) || "--"}
                  state={lookup.state}
                />
                <div className="screen-fx" aria-hidden="true" />
              </div>
              <div className="crt-chin">
                <span className="crt-wordmark">afterglow</span>
                <span>
                  <i /> COLOR / STEREO
                </span>
                <div className="crt-knob" />
              </div>
            </div>
            <div className="display-caption">
              <span>THE DISTANCE IS OPTIONAL.</span>
              <span>THE COMMENTARY IS NOT. ↙</span>
            </div>
          </section>
          <section className="home-notes">
            <span>
              <b>01</b> Bring a YouTube or video link.
            </span>
            <span>
              <b>02</b> Share a room with your people.
            </span>
            <span>
              <b>03</b> Press play. Be there together.
            </span>
          </section>
        </main>
      ) : (
        <main className="room-layout">
          <div className="room-top">
            <div className="room-title">
              <span className="on-air">
                <i /> {connected ? "ON AIR" : "OFFLINE"}
              </span>
              <h1>
                Room <span>{room.code}</span>
              </h1>
              <span className="host-caption">HOST / {hostName}</span>
            </div>
            <button
              className="secondary copy-invite"
              onClick={() => void copy()}
            >
              {copied ? "Copied!" : "Copy invite ↗"}
            </button>
          </div>
          <section className="watch-column">
            <div className="bezel-top">
              <span>
                MONITOR 01 /{" "}
                {room.playback.media?.kind === "youtube"
                  ? "YOUTUBE"
                  : room.playback.media
                    ? "DIRECT VIDEO"
                    : "AWAITING SOURCE"}
              </span>
              <span>SHARED FREQUENCY</span>
            </div>
            <Player
              playback={room.playback}
              host={host}
              connected={connected}
              offset={offset}
              control={control}
              onMetrics={setMetrics}
              channel={room.code}
              reactions={reactionState.items}
              onReactionEnd={reactionState.remove}
              remoteSpeaking={remoteSpeaking}
              ducking={ducking}
              speakers={speakers}
              levels={voice.levels}
              onReaction={react}
              effects={effects}
            />
            <div className="screen-info">
              <span className="live-pill">
                <i />
                {room.playback.media ? "NOW SHOWING" : "READY WHEN YOU ARE"}
              </span>
              <span>
                {host ? "You have the remote" : `${hostName} has the remote`}
              </span>
            </div>
            <div
              className={`source-bar ${room.playback.media ? "source-loaded" : ""}`}
            >
              {room.playback.media && <button className="source-toggle" aria-expanded={sourceOpen} onClick={() => setSourceOpen((value) => !value)}><span>SOURCE / {room.playback.media.kind === "youtube" ? "YouTube" : "Direct video"}</span><span>{sourceOpen ? "Close" : "Edit source"} ↗</span></button>}
              <div className="source-editor" hidden={!!room.playback.media && !sourceOpen}>
              <div className="source-heading">
                <span>SOURCE /</span>
                <span>
                  {host
                    ? "YOUR ROOM. YOUR REMOTE."
                    : "HOST CONTROLLED PLAYBACK"}
                </span>
              </div>
              {host ? (
                <>
                  <form
                    className="media-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      load(url);
                    }}
                  >
                    <input
                      aria-label="Video URL"
                      placeholder="Paste a YouTube or .mp4 / .webm URL"
                      value={url}
                      maxLength={2048}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                    <button className="primary" disabled={!connected}>
                      Load video →
                    </button>
                  </form>
                  <button
                    className="text-button demo-button"
                    disabled={!connected}
                    onClick={() => {
                      setUrl(demo);
                      load(demo);
                    }}
                  >
                    Try a sample film ↗
                  </button>
                </>
              ) : (
                <p className="guest-source">
                  {room.playback.media?.url ||
                    "Waiting for your host to set the scene."}
                </p>
              )}
            </div>
              </div>
            <div className="keyboard-hints">
              <span>
                <kbd>SPACE</kbd> play/pause <kbd>F</kbd> fullscreen
              </span>
              <span>
                <kbd>/</kbd> chat <kbd>C</kbd> invite
              </span>
            </div>
          </section>
          <aside className="social-column">
            <div className="rail-tabs" role="tablist" aria-label="Room sidebar">
              <button
                id="chat-tab"
                role="tab"
                aria-selected={tab === "chat"}
                aria-controls="chat-panel"
                tabIndex={tab === "chat" ? 0 : -1}
                onClick={() => setTab("chat")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    setTab("people");
                    document.getElementById("people-tab")?.focus();
                  }
                }}
              >
                Chat{" "}
                <span>{unread ? `${unread} new` : room.messages.length}</span>
              </button>
              <button
                id="people-tab"
                role="tab"
                aria-selected={tab === "people"}
                aria-controls="people-panel"
                tabIndex={tab === "people" ? 0 : -1}
                onClick={() => setTab("people")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    setTab("chat");
                    document.getElementById("chat-tab")?.focus();
                  }
                }}
              >
                People <span>{room.participants.length}</span>
              </button>
            </div>
            <section
              hidden={tab !== "people"}
              id="people-panel"
              className="people"
              role="tabpanel"
              aria-labelledby="people-tab"
            >
              <div className="rail-caption">
                <span>THE COMPANY</span>
                <span>{room.participants.length} / 24</span>
              </div>
              <div className="participant-list">
                {room.participants.map((p) => (
                  <ParticipantRow
                    key={p.id}
                    person={p}
                    levels={voice.levels}
                    self={p.id === socket.id}
                    host={p.id === room.hostId}
                    voice={p.id === socket.id ? voice.state : p.voice}
                    speaking={
                      p.id === socket.id
                        ? voice.state.speaking
                        : p.voice.joined &&
                          !p.voice.muted &&
                          (voice.remoteSpeaking[p.id] ?? p.voice.speaking)
                    }
                  />
                ))}
                {departed.map((p) => <div className="participant-leaving" key={p.id} aria-hidden="true"><ParticipantRow person={p} levels={voice.levels} self={false} host={p.id === room.hostId} voice={{ joined: false, muted: true, speaking: false }} speaking={false} /></div>)}
              </div>
            </section>
            <div className="chat-tab-content" hidden={tab !== "chat"}>
              <ChatPanel
                messages={room.messages}
                connected={connected}
                inputRef={chatInput}
                onSend={sendChat}
                onReaction={react}
                onUnread={setUnread}
                visible={tab === "chat"}
              />
            </div>
          </aside>
        </main>
      )}
      {!room && (
        <footer className="site-footer">
          <span>MADE FOR THE MOMENTS BETWEEN THE MILES.</span>
          <span>WATCH TOGETHER. FEEL CLOSER.</span>
        </footer>
      )}
      <div className={`sync-statusline ${debug ? "debug-status" : ""}`} aria-label="Playback diagnostics">
        <span className="status-brand">AFTERGLOW</span>
        <span
          className={connected ? "status-connected" : "status-disconnected"}
        >
          {syncState}
        </span>
        <span
          className="status-secondary"
          data-testid="drift"
          title="Playback offset from the server timeline, not network latency. Positive means behind; offsets within 200 ms are in tolerance while playing."
        >
          offset{" "}
          {connected &&
          room &&
          metrics.driftMs !== null &&
          !["error", "blocked", "loading"].includes(metrics.state)
            ? `${metrics.driftMs > 0 ? "+" : ""}${Math.round(metrics.driftMs)}ms`
            : "--"}
        </span>
        <span className="status-secondary" data-testid="rtt">
          rtt {connected && rtt !== null ? `${rtt}ms` : "--"}
        </span>
        <span className="status-secondary">
          state {room ? `v${room.playback.revision}` : "--"}
        </span>
        <span className="status-host">host {hostName}</span>
        <span className="status-count">
          {room ? `${room.participants.length} ${room.participants.length === 1 ? "person" : "people"}` : "-- people"}
        </span>
        <span className="status-room">{room?.code ?? "STANDBY"}</span>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
