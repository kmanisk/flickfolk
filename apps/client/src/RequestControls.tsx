import { useRef, useState } from "react";
import { Check, Hand, X } from "lucide-react";
import {
  currentPosition,
  mediaCapabilities,
  type ControlIntent,
  type ControlRequest,
  type Playback,
} from "@watchparty/shared";
import { Button, Popover } from "./ui/index.js";

export function RequestControls({
  reviewer,
  requests,
  playback,
  connected,
  onRequest,
  onResolve,
}: {
  reviewer: boolean;
  requests: ControlRequest[];
  playback: Playback;
  connected: boolean;
  onRequest: (intent: ControlIntent) => void;
  onResolve: (id: string, approve: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [seconds, setSeconds] = useState(0);
  const caps = playback.media ? mediaCapabilities(playback.media) : null;
  return (
    <div className="popover-anchor requests-anchor">
      <Button
        ref={trigger}
        variant="ghost"
        className="requests-button"
        disabled={!connected}
        aria-expanded={open}
        aria-label={
          reviewer
            ? `Requests (${requests.length})`
            : "Request playback control"
        }
        onClick={() => {
          setSeconds(Math.floor(currentPosition(playback, Date.now())));
          setOpen(!open);
        }}
      >
        <Hand aria-hidden="true" />
        <span>Requests</span>
        {reviewer && <span className="request-count">{requests.length}</span>}
      </Button>
      {open && (
        <Popover
          label={reviewer ? "Control requests" : "Request playback control"}
          className="requests-popover"
          triggerRef={trigger}
          onClose={() => setOpen(false)}
        >
          <h2>{reviewer ? "Control requests" : "Ask to control playback"}</h2>
          {!reviewer ? (
            <>
              <p className="permission-note">
                Only the host and moderators can control playback
              </p>
              <div className="request-playback-actions">
                <Button
                  disabled={!caps?.canPlay}
                  onClick={() =>
                    onRequest({
                      action: "play",
                      payload: { position: seconds },
                    })
                  }
                >
                  Request play
                </Button>
                <Button
                  disabled={!caps?.canPause}
                  onClick={() =>
                    onRequest({
                      action: "pause",
                      payload: { position: seconds },
                    })
                  }
                >
                  Request pause
                </Button>
              </div>
              {caps?.canSeek && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onRequest({
                      action: "seek",
                      payload: { position: seconds },
                    });
                  }}
                >
                  <label htmlFor="request-position">Seek to (seconds)</label>
                  <div className="request-seek-row">
                    <input
                      id="request-position"
                      type="number"
                      min="0"
                      max="604800"
                      step="1"
                      required
                      value={seconds}
                      onChange={(e) => setSeconds(Number(e.target.value))}
                    />
                    <Button type="submit">Request seek</Button>
                  </div>
                </form>
              )}
            </>
          ) : requests.length ? (
            <ul className="control-request-list">
              {requests.map((request) => (
                <li key={request.id}>
                  <div>
                    <strong>{request.requesterName}</strong>
                    <span>
                      {request.action === "setVideo"
                        ? "Change source"
                        : request.action === "seek"
                          ? `Seek to ${request.payload.position}s`
                          : request.action === "play"
                            ? "Play"
                            : "Pause"}
                    </span>
                    {request.action === "setVideo" && (
                      <span className="request-url">{request.payload.url}</span>
                    )}
                  </div>
                  <div className="request-decisions">
                    <Button
                      aria-label={`Approve ${request.requesterName}'s request`}
                      onClick={() => onResolve(request.id, true)}
                    >
                      <Check aria-hidden="true" />
                      Approve
                    </Button>
                    <Button
                      aria-label={`Deny ${request.requesterName}'s request`}
                      onClick={() => onResolve(request.id, false)}
                    >
                      <X aria-hidden="true" />
                      Deny
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No pending requests</p>
          )}
        </Popover>
      )}
    </div>
  );
}
