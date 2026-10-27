import { HardDrive, Upload } from "lucide-react";
import type { ChangeEvent, DragEvent } from "react";
import type { LocalSourceMetadata } from "@watchparty/shared";
import { Button } from "./ui/index.js";
import { formatDuration, formatFileSize } from "./lib/localFile.js";
import type { LocalFileStatus } from "./useLocalFile.js";

function FileButton({
  label,
  onChoose,
}: {
  label: string;
  onChoose: (file: File) => void;
}) {
  function changed(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onChoose(file);
  }
  return (
    <label className="button button-primary local-file-button">
      <Upload aria-hidden="true" />
      {label}
      <input
        className="sr-only"
        type="file"
        accept="video/*,.mkv,.webm,.mp4"
        onChange={changed}
      />
    </label>
  );
}

export function LocalSourcePicker({
  status,
  progress,
  ready,
  total,
  error,
  onChoose,
}: {
  status: LocalFileStatus;
  progress: number;
  ready: number;
  total: number;
  error?: string;
  onChoose: (file: File) => void;
}) {
  return (
    <div className="local-source-picker">
      <div className="local-source-copy">
        <HardDrive aria-hidden="true" />
        <div>
          <strong>Play a file from each device</strong>
          <span>The video never uploads to Flickfolk.</span>
        </div>
      </div>
      <FileButton
        label={status === "hashing" ? "Fingerprinting…" : "Choose local file"}
        onChoose={onChoose}
      />
      {status === "error" && error && (
        <small className="local-source-error" role="alert">{error}</small>
      )}
      {status === "hashing" && (
        <div className="local-hash-progress" role="status">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
          <small>{Math.round(progress * 100)}%</small>
        </div>
      )}
      <small className="local-ready-count">
        {ready}/{total} have the file
      </small>
    </div>
  );
}

export default function LocalFilePanel({
  source,
  status,
  progress,
  error,
  candidateDuration,
  onChoose,
  onUseAnyway,
  onReset,
}: {
  source: LocalSourceMetadata;
  status: LocalFileStatus;
  progress: number;
  error: string;
  candidateDuration?: number;
  onChoose: (file: File) => void;
  onUseAnyway: () => void;
  onReset: () => void;
}) {
  const diff =
    candidateDuration === undefined
      ? 0
      : Math.abs(source.durationSec - candidateDuration);
  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) onChoose(file);
  }
  return (
    <div
      className="local-file-panel"
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
    >
      <HardDrive aria-hidden="true" />
      <h2>Host is playing {source.name}</h2>
      <p>
        {formatFileSize(source.size)} · {formatDuration(source.durationSec)}
      </p>
      {status === "hashing" ? (
        <>
          <strong>Checking your copy…</strong>
          <div className="local-hash-progress" role="status">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
            <small>{Math.round(progress * 100)}%</small>
          </div>
        </>
      ) : status === "near" ? (
        <div className="local-match-message" role="status">
          <strong>Length differs by {diff.toFixed(1)}s.</strong>
          <span>It may be another encode of the same video.</span>
          <div>
            <Button variant="primary" onClick={onUseAnyway}>
              Use anyway
            </Button>
            <Button variant="ghost" onClick={onReset}>
              Choose another
            </Button>
          </div>
        </div>
      ) : status === "mismatch" ? (
        <div className="local-match-message" role="alert">
          <strong>That looks like a different file.</strong>
          <Button variant="ghost" onClick={onReset}>
            Choose another
          </Button>
        </div>
      ) : status === "error" ? (
        <div className="local-match-message" role="alert">
          <strong>{error}</strong>
          <Button variant="ghost" onClick={onReset}>
            Choose another
          </Button>
        </div>
      ) : (
        <FileButton label="Select your copy" onChoose={onChoose} />
      )}
      <span className="local-drop-note">or drop the matching video here</span>
      <small>Your file never leaves your device.</small>
    </div>
  );
}
