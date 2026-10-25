import { GitHubIcon } from "./ui/GitHubIcon.js";
import {
  ArrowRight,
  Film,
  Link2,
  MessageSquare,
  Play,
  SmilePlus,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { brand, normalizeCode, REACTIONS } from "@watchparty/shared";
import { AccentPicker, Avatar, Brand, BrandMark, Button, Chip } from "./ui/index.js";
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
  lookup: RoomLookup;
  notFound: boolean;
  joinInvalid: boolean;
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
  lookup,
  notFound,
  joinInvalid,
  goHome,
}: HomeProps) {
  const invalid = joinInvalid || lookup.state === "missing";
  const lookupText = invalid
    ? "Room not found. Check the code."
    : lookup.state === "tuning"
      ? "Checking…"
      : lookup.state === "found"
        ? "Room found"
        : "waiting";
  return (
    <div className="home-page">
      <header className="topbar home-topbar">
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
          <AccentPicker />
          <a
            className="button button-ghost icon-button"
            href="https://github.com/kmanisk/flickfolk"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            title="GitHub"
          >
            <GitHubIcon />
          </a>
        </div>
      </header>
      {notFound ? (
        <main className="no-signal">
          <Chip>Room not found</Chip>
          <h1>Room not found.</h1>
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
              <div className={`join-row ${invalid ? "is-invalid" : ""}`}>
                <Link2 aria-hidden="true" />
                <input
                  id="room-code"
                  aria-invalid={invalid}
                  aria-describedby="room-validation"
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
                id="room-validation"
                className={`lookup lookup-${invalid ? "missing" : lookup.state}`}
                role="status"
                aria-label="Room lookup"
                data-testid="room-lookup"
              >
                <i />
                {lookupText}
              </div>
              {invalid && (
                <p className="lookup-detail">
                  Codes never contain 0, O, 1, I or L.
                </p>
              )}
            </section>
            <p className="home-note">One link. Your people. No sign-up.</p>
          </section>
          <section className="home-preview" aria-hidden="true">
            <div className="preview-caption">
              <span>A place to press play, together.</span>
              <Film />
            </div>
            <div className="preview-shell">
              <div className="preview-topbar">
                <span className="preview-brand">
                  <BrandMark className="preview-brand-mark" />
                  {brand.productName}
                </span>
                <Chip className="room-code">
                  {normalizeCode(code).slice(0, 6) || "YOUR ROOM"}
                </Chip>
              </div>
              <div className="preview-room">
                <div className="preview-video">
                  <div className="preview-sun" />
                  <div className="preview-horizon" />
                  <span className="preview-play">
                    <Play fill="currentColor" />
                  </span>
                  <div className="preview-reactions">
                    <span>{REACTIONS[0]}</span>
                    <span>{REACTIONS[1]}</span>
                    <span>{REACTIONS[5]}</span>
                  </div>
                  <div className="preview-timeline">
                    <Play />
                    <i />
                    <Film />
                  </div>
                </div>
                <div className="preview-rail">
                  <div>
                    <MessageSquare />
                    Chat
                    <Users />
                  </div>
                  <div className="preview-messages">
                    {[
                      ["Nora", "Made it!"],
                      ["Ari", "Best part coming up"],
                      ["You", "Ready when you are"],
                    ].map(([name, text]) => (
                      <div className="preview-message" key={name}>
                        <Avatar name={name!} size={24} />
                        <span>
                          <strong>{name}</strong>
                          <span>{text}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="preview-compose">
                    <SmilePlus />
                    <span>Message…</span>
                    <ArrowRight />
                  </div>
                </div>
              </div>
              <div className="preview-bottom">
                <Link2 />
                <span>Your shared screen</span>
                <span className="preview-synced">
                  <i />
                  synced
                </span>
              </div>
            </div>
            <div className="preview-footnotes">
              <span>
                <Film />
                YouTube & video links
              </span>
              <span>
                <Users />
                Your own little crowd
              </span>
            </div>
          </section>
        </main>
      )}
      <footer className="home-footer">
        <span>Built with React, Socket.IO & WebRTC</span>
      </footer>
    </div>
  );
}
