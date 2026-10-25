import {
  ArrowRight,
  ArrowUpRight,
  Film,
  Link2,
  MessageSquare,
  Play,
  SmilePlus,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { brand, normalizeCode, REACTIONS } from "@watchparty/shared";
import { Brand, Button, Chip, IconButton } from "./ui/index.js";
import type { RoomLookup } from "./useRoomLookup.js";
interface HomeProps {
  name: string;
  setName: (name: string) => void;
  code: string;
  setCode: (code: string) => void;
  enter: (create: boolean) => void;
  connected: boolean;
  status: string;
  busy: boolean;
  effects: boolean;
  setEffects: (value: boolean) => void;
  lookup: RoomLookup;
  notFound: boolean;
  goHome: () => void;
}
export function Home({
  name,
  setName,
  code,
  setCode,
  enter,
  connected,
  status,
  busy,
  effects,
  setEffects,
  lookup,
  notFound,
  goHome,
}: HomeProps) {
  const lookupText =
    lookup.state === "tuning"
      ? "tuning…"
      : lookup.state === "found"
        ? `room found / ${lookup.count} ${lookup.count === 1 ? "person" : "people"} on this channel`
        : lookup.state === "missing"
          ? "no signal"
          : "waiting";
  return (
    <div className="home-page" data-fx={effects ? "on" : "off"}>
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <span
            className={`connection ${connected ? "online" : ""}`}
            role="status"
          >
            {connected ? (
              <Wifi aria-hidden="true" />
            ) : (
              <WifiOff aria-hidden="true" />
            )}
            {status}
          </span>
          <IconButton
            aria-label={effects ? "[fx]" : "[fx off]"}
            aria-pressed={effects}
            onClick={() => setEffects(!effects)}
          >
            <Sparkles aria-hidden="true" />
          </IconButton>
          <a
            className="source-link"
            href={brand.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Source
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
      </header>
      {notFound ? (
        <main className="no-signal">
          <Chip>No signal</Chip>
          <h1>No signal.</h1>
          <p>That room is off the map. Let’s find your people.</p>
          <Button variant="primary" onClick={goHome}>
            Back home
            <ArrowRight aria-hidden="true" />
          </Button>
        </main>
      ) : (
        <main className="home-main">
          <section className="home-intro">
            <Chip className="home-eyebrow">
              <span className="coral-dot" />A little closer, from anywhere
            </Chip>
            <h1>
              Same movie.
              <br />
              <span>Same second.</span>
            </h1>
            <p className="home-description">
              Watch together. Talk through the good bits.
              <br className="desktop-break" /> Make a night of it, wherever you
              are.
            </p>
            <section className="join-ticket" aria-label="Create or join a room">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  enter(true);
                }}
              >
                <label htmlFor="name">What should we call you?</label>
                <input
                  id="name"
                  autoComplete="nickname"
                  maxLength={32}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your display name"
                />
                <Button
                  variant="primary"
                  className="start-button"
                  type="submit"
                  disabled={!connected || busy}
                >
                  {busy ? "Finding your seats…" : "Start a room"}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </form>
              <div className="join-divider">
                <span>or join a friend’s room</span>
              </div>
              <label htmlFor="room-code">Room code or invite link</label>
              <div className="join-row">
                <Link2 aria-hidden="true" />
                <input
                  id="room-code"
                  aria-label="Room code or invite link"
                  value={code}
                  maxLength={2048}
                  placeholder="Paste a code or invite"
                  autoComplete="off"
                  onChange={(event) => setCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      enter(false);
                    }
                  }}
                />
                <Button
                  disabled={!connected || busy}
                  onClick={() => enter(false)}
                >
                  Join
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
              <div
                className={`lookup lookup-${lookup.state}`}
                role="status"
                aria-label="Room lookup"
                data-testid="room-lookup"
              >
                <i />
                {lookupText}
              </div>
              {lookup.detail && (
                <p className="lookup-detail">{lookup.detail}</p>
              )}
            </section>
            <p className="home-note">One link. Your people. No sign-up.</p>
          </section>
          <section className="home-preview" aria-label="Room preview">
            <div className="preview-caption">
              <span>A place to press play, together.</span>
              <Film aria-hidden="true" />
            </div>
            <div className="preview-shell">
              <div className="preview-topbar">
                <span className="preview-brand">
                  <Play fill="currentColor" aria-hidden="true" />
                  {brand.productName}
                </span>
                <Chip className="room-code">
                  {normalizeCode(code).slice(0, 6) || "YOUR ROOM"}
                </Chip>
              </div>
              <div className="preview-room">
                <div className={`preview-video lookup-${lookup.state}`}>
                  <div className="preview-orbit" />
                  <div className="preview-play">
                    <Play fill="currentColor" aria-hidden="true" />
                  </div>
                  <span>
                    {lookup.state === "found"
                      ? "Your people are here."
                      : lookup.state === "tuning"
                        ? "Tuning into your room…"
                        : lookup.state === "missing"
                          ? "Let’s find your room."
                          : "The best seat is next to your people."}
                  </span>
                  <div className="preview-timeline">
                    <Play aria-hidden="true" />
                    <i />
                    <Film aria-hidden="true" />
                  </div>
                </div>
                <div className="preview-rail">
                  <div>
                    <MessageSquare aria-hidden="true" />
                    Chat
                    <Users aria-hidden="true" />
                  </div>
                  <div className="preview-lines" aria-hidden="true">
                    <i />
                    <b />
                    <i />
                    <b />
                    <i />
                  </div>
                  <div className="preview-compose">
                    <SmilePlus aria-hidden="true" />
                    <i />
                    <ArrowRight aria-hidden="true" />
                  </div>
                </div>
              </div>
              <div className="preview-bottom">
                <Link2 aria-hidden="true" />
                <span>Bring a video link</span>
                <span>
                  {REACTIONS[0]} {REACTIONS[1]} {REACTIONS[5]}
                </span>
              </div>
            </div>
            <div className="preview-footnotes">
              <span>
                <Film aria-hidden="true" />
                YouTube & video links
              </span>
              <span>
                <Users aria-hidden="true" />
                Your own little crowd
              </span>
            </div>
          </section>
        </main>
      )}
      <footer className="home-footer">
        <span>Built with React, Socket.IO & WebRTC</span>
        <a href={brand.sourceUrl} target="_blank" rel="noopener noreferrer">
          Source
          <ArrowUpRight aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
