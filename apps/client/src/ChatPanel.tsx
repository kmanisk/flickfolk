import { Avatar } from "./Avatar.js";
import { lazy, Suspense } from "react";
import {
  ArrowDown,
  Copy,
  Link2,
  MessageCircle,
  SendHorizontal,
  SmilePlus,
} from "lucide-react";
import { Button, IconButton } from "./ui/index.js";
import { SoloInviteCard } from "./SoloInviteCard.js";
const GifPicker = lazy(() =>
  import("./GifPicker.js").then((module) => ({ default: module.GifPicker })),
);
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  emojiOnlyCount,
  plainComposerText,
  REACTIONS,
  gifUrl,
  type Ack,
  type Message,
} from "@watchparty/shared";
const labels = ["heart", "laugh", "surprise", "cry", "applause", "fire"];
export function ChatPanel({
  messages,
  connected,
  inputRef,
  onSend,
  onUnread,
  visible,
  selfId,
  onCopyInvite,
  participantCount,
  roomCode,
}: {
  visible: boolean;
  selfId?: string;
  onCopyInvite: () => void;
  participantCount: number;
  roomCode: string;
  messages: Message[];
  connected: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSend: (text: string, kind: "text" | "gif", done: Ack) => void;
  onUnread: (count: number) => void;
}) {
  const [gifAvailable, setGifAvailable] = useState(false);
  const rendered = messages.slice(-200);
  const [text, setText] = useState("");
  const [gif, setGif] = useState("");
  const [gifOpen, setGifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const gifButton = useRef<HTMLButtonElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previous = useRef(messages.at(-1)?.id);
  const unreadChanged = useRef(onUnread);
  unreadChanged.current = onUnread;
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/gifs/status", { signal: abort.signal })
      .then((response) => response.json())
      .then(async (body: unknown) => {
        if (
          !body ||
          typeof body !== "object" ||
          !("available" in body) ||
          !body.available
        )
          return;
        const response = await fetch("/api/gifs/trending?limit=1", {
          signal: abort.signal,
        });
        if (!response.ok) return;
        const result: unknown = await response.json();
        if (
          !abort.signal.aborted &&
          result &&
          typeof result === "object" &&
          "gifs" in result &&
          Array.isArray(result.gifs)
        )
          setGifAvailable(true);
      })
      .catch(() => {});
    return () => abort.abort();
  }, []);
  function readAll() {
    nearBottom.current = true;
    setUnread(0);
    unreadChanged.current(0);
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }
  useLayoutEffect(() => {
    const newest = messages.at(-1)?.id;
    if (newest === previous.current) return;
    const index = messages.findIndex((m) => m.id === previous.current);
    const added = index < 0 ? messages.length : messages.length - index - 1;
    previous.current = newest;
    if (nearBottom.current && visible) readAll();
    else setUnread((value) => value + added);
  }, [messages, visible]);
  useEffect(() => {
    if (visible && nearBottom.current) readAll();
  }, [visible]);
  useEffect(() => {
    unreadChanged.current(unread);
  }, [unread]);
  const afterImage = useRef(() => {});
  afterImage.current = () => {
    if (nearBottom.current && visible) readAll();
  };
  const onImageLoad = useCallback(() => afterImage.current(), []);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${Math.min(96, Math.max(24, input.scrollHeight))}px`;
  }, [text, inputRef]);
  function closePopups() {
    setEmojiOpen(false);
    setGifOpen(false);
    setSearchOpen(false);
  }
  function send(event?: FormEvent, image = false) {
    event?.preventDefault();
    const value = image ? gif : text;
    if (!value.trim() || !connected) return;
    setError("");
    let content = value;
    if (image) {
      try {
        content = gifUrl(value);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    onSend(content, image ? "gif" : "text", (result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (image) {
        setGif((current) => (current === value ? "" : current));
        setGifOpen(false);
      } else setText((current) => (current === value ? "" : current));
      if (nearBottom.current && visible) readAll();
    });
  }
  function closeSearch() {
    setSearchOpen(false);
    gifButton.current?.focus();
  }
  return (
    <section
      id="chat-panel"
      className="chat"
      role="tabpanel"
      aria-labelledby="chat-tab"
    >
      <div
        ref={scroller}
        className="messages"
        role="log"
        aria-label="Room chat"
        aria-live="polite"
        onScroll={() => {
          const el = scroller.current!;
          nearBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (nearBottom.current && unread) {
            setUnread(0);
            onUnread(0);
          }
        }}
      >
        <SoloInviteCard roomCode={roomCode} visible={participantCount === 1} />
        {!messages.length && (
          <div className="empty-chat">
            <span className="empty-chat-icon">
              <MessageCircle aria-hidden="true" />
            </span>
            <h2>No messages yet</h2>
            <p>Say hi, or send the invite.</p>
            <Button onClick={onCopyInvite}>Copy invite</Button>
            <div className="chat-quick-sends">
              {["hey \u{1f44b}", "ready?", "play it"].map((message) => (
                <Button
                  key={message}
                  variant="ghost"
                  disabled={!connected}
                  onClick={() =>
                    onSend(message, "text", (result) => {
                      if (!result.ok) setError(result.error);
                    })
                  }
                >
                  {message}
                </Button>
              ))}
            </div>
          </div>
        )}
        {rendered.map((message, index) => (
          <ChatMessageRow
            key={message.id}
            message={message}
            grouped={
              index > 0 &&
              (message.senderId ?? message.name) ===
                (rendered[index - 1]!.senderId ?? rendered[index - 1]!.name) &&
              message.at - rendered[index - 1]!.at >= 0 &&
              message.at - rendered[index - 1]!.at <= 300000
            }
            self={message.senderId === selfId}
            onImageLoad={onImageLoad}
          />
        ))}
      </div>
      {unread > 0 && (
        <Button className="unread-button" onClick={readAll}>
          <ArrowDown aria-hidden="true" />
          {unread} new {unread === 1 ? "message" : "messages"}
        </Button>
      )}
      <div
        className="composer-dock"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            closePopups();
            inputRef.current?.focus();
          }
        }}
      >
        {error && (
          <p className="collab-error" role="alert">
            {error}
          </p>
        )}
        {searchOpen && gifAvailable && (
          <Suspense fallback={<div className="gif-loading">Loading GIFs…</div>}>
            <GifPicker
              onClose={closeSearch}
              triggerRef={gifButton}
              onSelect={(url) =>
                onSend(url, "gif", (result) => {
                  if (result.ok) closeSearch();
                  else setError(result.error);
                })
              }
            />
          </Suspense>
        )}
        {gifOpen && (
          <form
            className="gif-form popup-surface"
            onSubmit={(event) => send(event, true)}
          >
            <input
              autoFocus
              aria-label="GIF URL"
              type="url"
              placeholder="https://…/image.gif"
              maxLength={500}
              value={gif}
              onChange={(event) => setGif(event.target.value)}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={!connected || !gif.trim()}
            >
              Send GIF
            </Button>
          </form>
        )}
        {emojiOpen && (
          <div className="emoji-picker popup-surface" aria-label="Emoji picker">
            {REACTIONS.map((symbol, i) => (
              <IconButton
                key={symbol}
                aria-label={`Insert ${labels[i]}`}
                disabled={!connected}
                onClick={() => {
                  setText((value) => (value + symbol).slice(0, 500));
                  setEmojiOpen(false);
                  inputRef.current?.focus();
                }}
              >
                {symbol}
              </IconButton>
            ))}
            <Button
              variant="ghost"
              className="paste-link"
              aria-label="Paste GIF link"
              onClick={() => {
                closePopups();
                setGifOpen(true);
              }}
            >
              <Link2 aria-hidden="true" />
              Link
            </Button>
          </div>
        )}
        <form className="chat-form message-composer" onSubmit={send}>
          <IconButton
            aria-label="Emoji picker"
            aria-expanded={emojiOpen}
            onClick={() => {
              closePopups();
              setEmojiOpen(!emojiOpen);
            }}
          >
            <SmilePlus aria-hidden="true" />
          </IconButton>
          <textarea
            ref={inputRef}
            aria-label="Chat message"
            placeholder="Message the room…"
            rows={1}
            maxLength={500}
            value={text}
            disabled={!connected}
            onChange={(event) => setText(plainComposerText(event.target.value))}
            onPaste={(event) => {
              event.preventDefault();
              const input = event.currentTarget;
              const start = input.selectionStart;
              const pasted = plainComposerText(
                event.clipboardData.getData("text/plain"),
              );
              const next = plainComposerText(
                text.slice(0, start) + pasted + text.slice(input.selectionEnd),
              );
              setText(next);
              requestAnimationFrame(() =>
                input.setSelectionRange(
                  Math.min(start + pasted.length, next.length),
                  Math.min(start + pasted.length, next.length),
                ),
              );
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                send();
              }
            }}
          />
          {gifAvailable && (
            <Button
              ref={gifButton}
              variant="ghost"
              className="gif-toggle"
              aria-label="Search GIFs"
              aria-expanded={searchOpen}
              onClick={() => {
                closePopups();
                setSearchOpen(!searchOpen);
              }}
            >
              GIF
            </Button>
          )}
          <IconButton
            type="submit"
            className={`send-button ${text.trim() ? "has-text" : ""}`}
            aria-label="Send message"
            disabled={!connected || !text.trim()}
          >
            <SendHorizontal aria-hidden="true" />
          </IconButton>
        </form>
        {text.length > 449 && (
          <span className="composer-count">{text.length}/500</span>
        )}
      </div>
    </section>
  );
}
const ChatImage = memo(function ChatImage({
  url,
  onLoad,
}: {
  url: string;
  onLoad: () => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="image-unavailable">Image unavailable.</p>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="chat-image-link"
    >
      <img
        className="chat-image"
        src={url}
        alt="Shared GIF or image"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={onLoad}
        onError={() => setFailed(true)}
      />
    </a>
  );
});

const ChatMessageRow = memo(
  function ChatMessageRow({
    message,
    onImageLoad,
    grouped,
    self,
  }: {
    message: Message;
    onImageLoad: () => void;
    grouped: boolean;
    self: boolean;
  }) {
    const emojiCount =
      message.kind === "text" ? emojiOnlyCount(message.text) : 0;
    return (
      <div
        className={`message ${grouped ? "is-grouped" : ""} ${self ? "is-self" : ""}`}
        data-message-id={message.id}
      >
        {!grouped && <Avatar name={message.name} />}
        <div className="message-content">
          <div className="message-identity">
            <strong>{message.name}</strong>
            <time dateTime={new Date(message.at).toISOString()}>
              {new Date(message.at).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          </div>
          {message.kind === "gif" ? (
            <ChatImage url={message.text} onLoad={onImageLoad} />
          ) : (
            <p
              className={
                emojiCount ? `emoji-message emoji-count-${emojiCount}` : ""
              }
            >
              {message.text}
            </p>
          )}
        </div>
        <div className="message-actions">
          <IconButton
            aria-label="Copy message"
            onClick={() => {
              void navigator.clipboard.writeText(message.text).catch(() => {});
            }}
          >
            <Copy aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    );
  },
  (a, b) =>
    a.message.id === b.message.id &&
    a.onImageLoad === b.onImageLoad &&
    a.grouped === b.grouped &&
    a.self === b.self,
);
