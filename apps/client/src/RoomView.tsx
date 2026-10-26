import { registerShortcuts } from "./lib/shortcuts.js";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Headphones,
  Keyboard,
  Link2,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  Share2,
  Sparkles,
  Users,
} from "lucide-react";
import {
  VOICE_OFF,
  type Ack,
  type Action,
  type ClientEvents,
  type Room,
  type ServerEvents,
} from "@watchparty/shared";
import type { Socket } from "socket.io-client";
import type { VoiceApi } from "./VoiceBridge.js";
import { AudioLevels } from "./AudioLevels.js";
import {
  AccentPicker,
  Brand,
  Button,
  Chip,
  IconButton,
  Kbd,
  Popover,
  Tabs,
  Toast,
} from "./ui/index.js";
import { ProviderBadge } from "./ProviderBadge.js";
import { Player, type PlaybackMetrics } from "./Player.js";
import { SyncStatusline } from "./SyncStatusline.js";
import { ParticipantRow } from "./ParticipantRow.js";
import { ChatPanel } from "./ChatPanel.js";
import { usePresence } from "./usePresence.js";
import { useReactions } from "./useReactions.js";
const VoiceBridge = lazy(() => import("./VoiceBridge.js"));
export interface RoomViewProps {
  socket: Socket<ServerEvents, ClientEvents>;
  room: Room;
  connected: boolean;
  status: string;
  effects: boolean;
  setEffects: (value: boolean | ((previous: boolean) => boolean)) => void;
  leave: () => void;
  control: (action: Action, position: number) => void;
  load: (url: string) => void;
  sendChat: (text: string, kind: "text" | "gif", done: Ack) => void;
}
export default function RoomView({
  socket,
  room,
  connected,
  status,
  effects,
  setEffects,
  leave,
  control,
  load,
  sendChat,
}: RoomViewProps) {
  const [tab, setTab] = useState("chat");
  const [unread, setUnread] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [popup, setPopup] = useState<"settings" | "keys" | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [url, setUrl] = useState(room.playback.media?.url ?? "");
  const [startedMedia, setStartedMedia] = useState<string | null>(null);
  const mediaKey = room.playback.media
    ? `${room.playback.media.kind}:${room.playback.media.id}`
    : null;
  const canEffects = Boolean(mediaKey && startedMedia === mediaKey);
  const [copied, setCopied] = useState<"code" | "invite" | null>(null);
  const [toast, setToast] = useState("");
  const [voiceStarted, setVoiceStarted] = useState(false);
  const [voice, setVoice] = useState<VoiceApi | null>(null);
  const fallbackLevels = useRef(new AudioLevels()).current;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const localVoice = voice?.state ?? VOICE_OFF;
  const levels = voice?.levels ?? fallbackLevels;
  const [ducking, setDucking] = useState(() => {
    try {
      return localStorage.getItem("afterglow-ducking") !== "off";
    } catch {
      return true;
    }
  });
  const [metrics, setMetrics] = useState<PlaybackMetrics>({
    state: "waiting",
    driftMs: null,
  });
  const chatInput = useRef<HTMLTextAreaElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const keysButton = useRef<HTMLButtonElement>(null);
  const sourceButton = useRef<HTMLButtonElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const host = room.hostId === socket.id;
  const departed = usePresence(room.participants, room.code);
  const reactionState = useReactions(socket, room.code, effects);
  const speakers = room.participants.map((p) => ({
    id: p.id,
    name: p.name,
    speaking:
      connected &&
      (p.id === socket.id
        ? localVoice.speaking
        : p.voice.joined &&
          !p.voice.muted &&
          (voice?.remoteSpeaking[p.id] ?? p.voice.speaking)),
  }));
  const remoteSpeaking =
    connected && Object.values(voice?.remoteSpeaking ?? {}).some(Boolean);
  useEffect(() => {
    if (voice?.error) setToast(voice.error);
  }, [voice?.error]);
  useEffect(() => {
    if (room.playback.media) setSourceOpen(false);
  }, [room.playback.media?.url]);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );
  async function copy(codeOnly = false) {
    const value = codeOnly ? room.code : `${location.origin}/room/${room.code}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(codeOnly ? "code" : "invite");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 1500);
    } catch {
      setToast(`Copy ${codeOnly ? "this code" : "this invite"}: ${value}`);
    }
  }
  function mic(permissionClick = false) {
    if (permissionClick) setToast("");
    if (!voiceStarted) {
      if (permissionClick) setVoiceStarted(true);
      else setToast("Click Mic to allow microphone access first.");
    } else void voiceRef.current?.toggle(permissionClick);
  }
  const actions = useRef({
    copy,
    mic,
    setTab,
    setCollapsed,
    setEffects,
    effects,
    canEffects,
  });
  actions.current = {
    copy,
    mic,
    setTab,
    setCollapsed,
    setEffects,
    effects,
    canEffects,
  };
  useEffect(
    () =>
      registerShortcuts({
        f: () => setPopup(null),
        x: () => {
          if (actions.current.canEffects)
            actions.current.setEffects((value) => !value);
        },
        m: () => actions.current.mic(),
        c: () => {
          void actions.current.copy();
        },
        t: () => actions.current.setCollapsed((value) => !value),
        "/": () => {
          actions.current.setCollapsed(false);
          actions.current.setTab("chat");
          setTimeout(() => chatInput.current?.focus(), 0);
        },
      }),
    [],
  );
  function openSource() {
    setUrl(room.playback.media?.url ?? "");
    setSourceOpen((value) => (room.playback.media ? !value : true));
  }
  const micLabel = !localVoice.joined
    ? "Enable microphone"
    : localVoice.muted
      ? "Unmute microphone"
      : "Mute microphone";
  const micText = !localVoice.joined
    ? "Join voice"
    : localVoice.muted
      ? "Muted"
      : "Mic on";
  const sourceForm = (
    <form
      className="media-form"
      onSubmit={(event) => {
        event.preventDefault();
        load(url);
      }}
    >
      <label className="sr-only" htmlFor="media-url">
        Video URL
      </label>
      <Link2 aria-hidden="true" />
      <input
        id="media-url"
        aria-label="Video URL"
        placeholder="Paste a video, music or stream link"
        value={url}
        maxLength={2048}
        onChange={(event) => setUrl(event.target.value)}
        autoFocus
      />
      <Button variant="primary" type="submit" disabled={!connected}>
        Load video
      </Button>
    </form>
  );
  return (
    <div
      className={`room-page ${collapsed ? "rail-collapsed" : ""}`}
      data-fx={effects ? "on" : "off"}
    >
      {voiceStarted && (
        <Suspense fallback={null}>
          <VoiceBridge
            socket={socket}
            code={room.code}
            connected={connected}
            people={room.participants}
            onChange={setVoice}
          />
        </Suspense>
      )}
      <header className="topbar room-topbar">
        <Brand
          onClick={() => {
            voiceRef.current?.stop();
            leave();
          }}
        />
        <div className="room-identity" aria-label={`Room ${room.code}`}>
          <span className="room-identity-label">ROOM</span>
          <button
            type="button"
            className={`room-code-compact${copied === "code" ? " is-copied" : ""}`}
            onClick={() => void copy(true)}
            aria-label={
              copied === "code"
                ? "Room code copied"
                : `Copy room code ${room.code}`
            }
          >
            <span>{room.code}</span>
            {copied === "code" ? (
              <Check aria-hidden="true" />
            ) : (
              <Copy aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="topbar-actions">
          <Button
            className="invite-button"
            variant="primary"
            onClick={() => void copy()}
            aria-label={copied === "invite" ? "Copied!" : "Copy invite"}
          >
            {copied === "invite" ? (
              <Check aria-hidden="true" />
            ) : (
              <Share2 aria-hidden="true" />
            )}
            <span>{copied === "invite" ? "Copied" : "Invite"}</span>
          </Button>
          <div className="popover-anchor desktop-action">
            <IconButton
              ref={keysButton}
              aria-label="Keyboard shortcuts"
              data-tooltip="Keyboard shortcuts"
              title="Keyboard shortcuts"
              aria-expanded={popup === "keys"}
              onClick={() => setPopup(popup === "keys" ? null : "keys")}
            >
              <Keyboard aria-hidden="true" />
            </IconButton>
            {popup === "keys" && (
              <Popover
                label="Keyboard shortcuts"
                onClose={() => setPopup(null)}
                triggerRef={keysButton}
              >
                <h3>Make yourself at home</h3>
                {[
                  ["Space / K", "Play / pause"],
                  ["J / L", "Back / forward 10s"],
                  ["F", "Fullscreen"],
                  ["X", "Effects"],
                  ["M", "Microphone"],
                  ["/", "Focus chat"],
                  ["C", "Copy invite"],
                  ["T", "Toggle sidebar"],
                ].map(([key, label]) => (
                  <div className="shortcut" key={key}>
                    <span>{label}</span>
                    <Kbd>{key}</Kbd>
                  </div>
                ))}
                <Button variant="ghost" onClick={() => setPopup(null)}>
                  Close
                </Button>
              </Popover>
            )}
          </div>
          <div className="popover-anchor desktop-action">
            <IconButton
              ref={settingsButton}
              aria-label="Audio settings"
              data-tooltip="Settings"
              title="Settings"
              aria-expanded={popup === "settings"}
              onClick={() => setPopup(popup === "settings" ? null : "settings")}
            >
              <Settings aria-hidden="true" />
            </IconButton>
            {popup === "settings" && (
              <Popover
                label="Room settings"
                onClose={() => setPopup(null)}
                triggerRef={settingsButton}
              >
                <h3>Room settings</h3>
                <AccentPicker inline />
                {canEffects && (
                  <Button
                    variant="ghost"
                    aria-label={effects ? "Effects on" : "Effects off"}
                    aria-pressed={effects}
                    onClick={() => setEffects((value) => !value)}
                  >
                    <Sparkles aria-hidden="true" />
                    Effects {effects ? "on" : "off"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  aria-pressed={ducking}
                  onClick={() => {
                    const value = !ducking;
                    setDucking(value);
                    try {
                      localStorage.setItem(
                        "afterglow-ducking",
                        value ? "on" : "off",
                      );
                    } catch {
                      /* Storage is optional. */
                    }
                  }}
                >
                  Voice ducking: {ducking ? "On" : "Off"}
                  {ducking && <Check aria-hidden="true" />}
                </Button>
              </Popover>
            )}
          </div>
          <Button
            className={`voice-pill ${localVoice.speaking ? "is-speaking" : ""} ${localVoice.joined && !localVoice.muted ? "is-live" : ""}`}
            variant="ghost"
            aria-label={micLabel}
            aria-pressed={localVoice.joined && !localVoice.muted}
            disabled={!connected || voice?.busy}
            onClick={() => mic(true)}
          >
            {!localVoice.joined ? (
              <Headphones aria-hidden="true" />
            ) : localVoice.muted ? (
              <MicOff aria-hidden="true" />
            ) : (
              <Mic aria-hidden="true" />
            )}
            <span>{micText}</span>
            {localVoice.joined && !localVoice.muted && <i className="voice-live-dot" aria-hidden="true" />}
          </Button>
          <IconButton
            className="leave-button"
            aria-label="Leave room"
            data-tooltip="Leave room"
            title="Leave room"
            onClick={() => {
              voiceRef.current?.stop();
              leave();
            }}
          >
            <LogOut aria-hidden="true" />
          </IconButton>
        </div>
      </header>
      <main className="room-main">
        <section className="watch-column" aria-label={`Room ${room.code}`}>
          <h1 className="sr-only">Room {room.code}</h1>
          <div className="stage-wrap">
            <Player
              playback={room.playback}
              host={host}
              connected={connected}
              control={control}
              onMetrics={setMetrics}
              reactions={reactionState.items}
              onReactionEnd={reactionState.remove}
              remoteSpeaking={remoteSpeaking}
              ducking={ducking}
              speakers={speakers}
              levels={levels}
              onReaction={reactionState.send}
              effects={effects}
              onStarted={() => {
                if (room.playback.media)
                  setStartedMedia(
                    `${room.playback.media.kind}:${room.playback.media.id}`,
                  );
              }}
            />
          </div>
          <span className="sr-only">
            {host
              ? "You have the remote"
              : `${room.participants.find((p) => p.id === room.hostId)?.name ?? "Your host"} has the remote`}
          </span>
        </section>
        <aside className="social-column">
          <div className="rail-header">
            <Tabs
              items={[
                {
                  id: "chat",
                  label: "Chat",
                  icon: <MessageSquare aria-hidden="true" />,
                  count: unread ? `${unread} new` : undefined,
                },
                {
                  id: "people",
                  label: "People",
                  icon: <Users aria-hidden="true" />,
                  count: room.participants.length,
                },
              ]}
              value={tab}
              onChange={setTab}
            />
            <IconButton
              className="rail-toggle"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? (
                <PanelRightOpen aria-hidden="true" />
              ) : (
                <PanelRightClose aria-hidden="true" />
              )}
            </IconButton>
          </div>
          <section
            hidden={tab !== "people"}
            id="people-panel"
            className="people"
            role="tabpanel"
            aria-labelledby="people-tab"
          >
            <div className="people-heading">
              <h2>Good company</h2>
              <IconButton
                className="mobile-only"
                aria-label="Room settings"
                onClick={() =>
                  setPopup(popup === "settings" ? null : "settings")
                }
              >
                <Settings aria-hidden="true" />
              </IconButton>
              <Chip>{room.participants.length}</Chip>
            </div>
            <div className="participant-list">
              {room.participants.map((p) => (
                <ParticipantRow
                  key={p.id}
                  person={p}
                  levels={levels}
                  connected={connected}
                  self={p.id === socket.id}
                  host={p.id === room.hostId}
                  voice={p.id === socket.id ? localVoice : p.voice}
                  speaking={
                    speakers.find((s) => s.id === p.id)?.speaking ?? false
                  }
                />
              ))}
              {departed.map((p) => (
                <div
                  className="participant-leaving"
                  key={p.id}
                  aria-hidden="true"
                >
                  <ParticipantRow
                    person={p}
                    levels={levels}
                    self={false}
                    host={false}
                    voice={VOICE_OFF}
                    speaking={false}
                  />
                </div>
              ))}
            </div>
          </section>
          <div className="chat-tab-content" hidden={tab !== "chat"}>
            <ChatPanel
              messages={room.messages}
              connected={connected}
              inputRef={chatInput}
              onSend={sendChat}
              onUnread={setUnread}
              visible={tab === "chat" && !collapsed}
              selfId={socket.id}
              onCopyInvite={() => void copy()}
              participantCount={room.participants.length}
              roomCode={room.code}
            />
          </div>
        </aside>
      </main>
      <SyncStatusline
        room={room}
        connected={connected}
        status={status}
        phase={metrics.state}
        host={host}
        debug={new URLSearchParams(location.search).get("debug") === "1"}
        onSource={host ? openSource : undefined}
        sourceOpen={sourceOpen && host}
        sourceTriggerRef={sourceButton}
        sourceEditor={
          sourceOpen && host ? (
            <Popover
              label="Video source"
              className="source-popover"
              triggerRef={sourceButton}
              onClose={() => setSourceOpen(false)}
            >
              <h2>What are we watching?</h2>
              <ProviderBadge url={url} />
              {sourceForm}
              <Button
                variant="ghost"
                onClick={() =>
                  load("https://media.w3.org/2010/05/bunny/trailer.mp4")
                }
              >
                Try a sample film
              </Button>
            </Popover>
          ) : null
        }
        onReaction={reactionState.send}
      />
      {voice?.needsAudio && (
        <div className="voice-enable">
          <Button
            variant="primary"
            onClick={() => voiceRef.current?.enableAudio()}
          >
            Enable voice audio
          </Button>
        </div>
      )}
      <Toast message={toast} onDismiss={() => setToast("")} />
    </div>
  );
}
