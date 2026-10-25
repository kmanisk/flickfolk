import { Avatar } from "./Avatar.js";
import { GifPicker } from "./GifPicker.js";
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
  type ReactionSymbol,
} from "@watchparty/shared";
const labels = ["heart", "laugh", "surprise", "cry", "applause", "fire"];
export function ChatPanel({
  messages,
  connected,
  inputRef,
  onSend,
  onReaction,
  onUnread,
  visible,
}: {
  visible: boolean;
  messages: Message[];
  connected: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSend: (text: string, kind: "text" | "gif", done: Ack) => void;
  onReaction: (symbol: ReactionSymbol) => void;
  onUnread: (count: number) => void;
}) {
  const [text, setText] = useState("");
  const [gif, setGif] = useState("");
  const [gifOpen, setGifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const gifButton = useRef<HTMLButtonElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previous = useRef(messages.at(-1)?.id);
  const unreadChanged = useRef(onUnread);
  unreadChanged.current = onUnread;
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
    setEmojiOpen(false); setMoreOpen(false); setReactionsOpen(false); setGifOpen(false); setSearchOpen(false);
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
        setGif((current) => current === value ? "" : current);
        setGifOpen(false);
      } else setText((current) => current === value ? "" : current);
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
      <div className="rail-caption">
        <span>SIDE CONVERSATIONS</span>
        <span>{connected ? "LIVE" : "OFFLINE"}</span>
      </div>
      <div
        ref={scroller}
        className="messages"
        role="log"
        aria-label="Room chat"
        aria-live="polite"
        onScroll={() => {
          const el = scroller.current!;
          nearBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          if (nearBottom.current && unread) {
            setUnread(0);
            onUnread(0);
          }
        }}
      >
        {!messages.length && <p className="quiet-chat">quiet in here.</p>}
        {messages.map((message) => (
          <ChatMessageRow
            key={message.id}
            message={message}
            onImageLoad={onImageLoad}
            onReaction={onReaction}
          />
        ))}
      </div>
      {unread > 0 && (
        <button className="unread-button" onClick={readAll}>
          {unread} new {unread === 1 ? "message" : "messages"} ↓
        </button>
      )}
      <div className="composer-dock" onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); closePopups(); inputRef.current?.focus(); }
      }}>
      {error && <p className="collab-error" role="alert">{error}</p>}
      {searchOpen && <GifPicker onClose={closeSearch} onSelect={(url) => onSend(url, "gif", (result) => {
        if (result.ok) closeSearch(); else setError(result.error);
      })} />}
      {gifOpen && <form className="gif-form popup-surface" onSubmit={(event) => send(event, true)}>
        <input aria-label="GIF URL" type="url" placeholder="https://…/image.gif" maxLength={500} value={gif} onChange={(e) => setGif(e.target.value)} />
        <button className="secondary" disabled={!connected || !gif.trim()}>Send GIF</button>
      </form>}
      {(reactionsOpen || emojiOpen) && <div className="reaction-picker popup-surface" aria-label={emojiOpen ? "Emoji picker" : "Quick reactions"}>
        {REACTIONS.map((symbol, i) => <button key={symbol} aria-label={`${emojiOpen ? "Insert" : "React"} ${labels[i]}`} disabled={!connected} onClick={() => {
          if (emojiOpen) { setText((value) => (value + symbol).slice(0, 500)); inputRef.current?.focus(); }
          else onReaction(symbol);
          setReactionsOpen(false); setEmojiOpen(false);
        }}>{symbol}</button>)}
      </div>}
      {moreOpen && <div className="composer-more popup-surface">
        <button aria-label="Reactions" onClick={() => { closePopups(); setReactionsOpen(true); }}>Reactions</button>
        <button aria-label="Paste GIF link" onClick={() => { closePopups(); setGifOpen(true); }}>Link</button>
      </div>}
      <form className="chat-form message-composer" onSubmit={send}>
        <button type="button" aria-label="More message actions" aria-expanded={moreOpen} onClick={() => { closePopups(); setMoreOpen(!moreOpen); }}>+</button>
        <textarea ref={inputRef} aria-label="Chat message" placeholder="Message the room…" rows={1} maxLength={500} value={text} disabled={!connected}
          onChange={(event) => setText(plainComposerText(event.target.value))}
          onPaste={(event) => {
            event.preventDefault();
            const input = event.currentTarget;
            const start = input.selectionStart;
            const pasted = plainComposerText(event.clipboardData.getData("text/plain"));
            const next = plainComposerText(text.slice(0, start) + pasted + text.slice(input.selectionEnd));
            setText(next);
            requestAnimationFrame(() => input.setSelectionRange(Math.min(start + pasted.length, next.length), Math.min(start + pasted.length, next.length)));
          }}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
        <button type="button" ref={gifButton} aria-label="Search GIFs" aria-expanded={searchOpen} onClick={() => { closePopups(); setSearchOpen(!searchOpen); }}>GIF</button>
        <button type="button" aria-label="Emoji picker" aria-expanded={emojiOpen} onClick={() => { closePopups(); setEmojiOpen(!emojiOpen); }}>☺</button>
        <button aria-label="Send message" disabled={!connected || !text.trim()}>↑</button>
      </form>
      {text.length > 449 && <span className="composer-count">{text.length}/500</span>}
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
    onReaction,
  }: {
    message: Message;
    onImageLoad: () => void;
    onReaction: (symbol: ReactionSymbol) => void;
  }) {
    const emojiCount = message.kind === "text" ? emojiOnlyCount(message.text) : 0;
    return (
      <div className="message">
        <Avatar name={message.name} />
        <div className="message-content">
        <div>
          <strong>{message.name}</strong>
          <time dateTime={new Date(message.at).toISOString()}>
            {new Date(message.at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
        {message.kind === "gif" ? (
          <ChatImage url={message.text} onLoad={onImageLoad} />
        ) : (
          <p className={emojiCount ? `emoji-message emoji-count-${emojiCount}` : ""}>{message.text}</p>
        )}
        </div>
        <div className="message-actions">
          <button aria-label={`React to ${message.name}'s message`} onClick={() => onReaction(REACTIONS[0]!)}>☺</button>
          <button aria-label="Copy message" onClick={() => { void navigator.clipboard.writeText(message.text).catch(() => {}); }}>Copy</button>
        </div>
      </div>
    );
  },
  (a, b) => a.message.id === b.message.id && a.onImageLoad === b.onImageLoad && a.onReaction === b.onReaction,
);
