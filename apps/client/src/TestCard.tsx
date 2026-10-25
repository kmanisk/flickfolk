export function TestCard({
  channel = "--",
  state = "waiting",
  caption = "YOUR NEXT SHARED MEMORY",
}: {
  channel?: string;
  state?: string;
  caption?: string;
}) {
  return (
    <div
      className="test-card"
      role="img"
      aria-label={`CRT test card. Channel ${channel}. ${state}`}
    >
      <div className="test-grid" />
      <div className="test-bars">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="test-circle">
        <span>AFTERGLOW BROADCAST SYSTEM</span>
        <strong>
          {state === "found"
            ? "SIGNAL FOUND"
            : state === "missing"
              ? "NO SIGNAL"
              : "STAY TUNED"}
        </strong>
        <span>{caption}</span>
        <div className="test-frequency" />
        <b>CH / {channel}</b>
      </div>
      <div className="test-bottom">
        <span>STEREO · TOGETHER</span>
        <span>
          {state === "tuning" ? "TUNING…" : "AFTERGLOW / PRIVATE SCREENING"}
        </span>
      </div>
    </div>
  );
}
