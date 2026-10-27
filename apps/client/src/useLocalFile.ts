import { useEffect, useMemo, useRef, useState } from "react";
import {
  FEATURES,
  cleanLocalSource,
  matchLocal,
  type ClientEvents,
  type LocalSourceMetadata,
  type Room,
  type ServerEvents,
} from "@watchparty/shared";
import type { Socket } from "socket.io-client";
import { fingerprintFile } from "./lib/fingerprint.js";
import { localVideoDuration } from "./lib/localFile.js";

export type LocalFileStatus =
  | "idle"
  | "hashing"
  | "near"
  | "mismatch"
  | "matched"
  | "error";

interface Candidate {
  file: File;
  fingerprint: string;
  durationSec: number;
}

interface Selection extends Candidate {
  sourceFingerprint: string;
  acceptedNearMatch: boolean;
}

export function useLocalFile(
  socket: Socket<ServerEvents, ClientEvents>,
  room: Room,
  notify: (message: string) => void,
) {
  const source =
    room.playback.media?.kind === "local"
      ? room.playback.media.local ?? null
      : null;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [status, setStatus] = useState<LocalFileStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const currentSource = useRef(source?.fingerprint ?? null);
  const message = useRef(notify);
  message.current = notify;

  useEffect(() => {
    const next = source?.fingerprint ?? null;
    if (currentSource.current === next) return;
    currentSource.current = next;
    setCandidate(null);
    setProgress(0);
    setError("");
    setSelection((selected) => {
      if (selected?.sourceFingerprint === next) return selected;
      setStatus("idle");
      return null;
    });
  }, [source?.fingerprint]);

  const ready = useMemo(
    () =>
      room.participants.filter((person) => person.hasFile).length,
    [room.participants],
  );

  useEffect(() => {
    const restore = () => {
      if (source && selection?.sourceFingerprint === source.fingerprint)
        sendReady(selection.fingerprint, selection.acceptedNearMatch);
    };
    socket.on("connect", restore);
    return () => {
      socket.off("connect", restore);
    };
  }, [socket, source?.fingerprint, selection]);

  function sendReady(
    fingerprint: string | null,
    acceptedNearMatch = false,
  ) {
    if (!socket.connected) return;
    socket.emit(
      "source:ready",
      { fingerprint, ...(acceptedNearMatch ? { acceptedNearMatch: true } : {}) },
      (result) => {
        if (!result.ok) message.current(result.error);
      },
    );
  }

  async function inspect(file: File): Promise<Candidate> {
    if (!FEATURES.localFile) throw new Error("Local files are disabled.");
    if (!(file instanceof File) || file.size < 1)
      throw new Error("Choose a non-empty video file.");
    setError("");
    setStatus("hashing");
    setProgress(0);
    const [durationSec, fingerprint] = await Promise.all([
      localVideoDuration(file),
      fingerprintFile(file, setProgress),
    ]);
    const metadata = cleanLocalSource({
      fingerprint,
      name: file.name,
      size: file.size,
      durationSec,
    });
    return { file, fingerprint: metadata.fingerprint, durationSec };
  }

  async function choose(file: File, setAsSource = false) {
    try {
      const next = await inspect(file);
      if (setAsSource) {
        const metadata: LocalSourceMetadata = cleanLocalSource({
          fingerprint: next.fingerprint,
          name: file.name,
          size: file.size,
          durationSec: next.durationSec,
        });
        socket.timeout(7000).emit(
          "room:setLocalSource",
          metadata,
          (socketError, result) => {
            if (socketError) {
              setStatus("error");
              setError("Local source request timed out.");
              return;
            }
            if (!result.ok) {
              setStatus("error");
              setError(result.error);
              return;
            }
            setCandidate(null);
            setSelection({
              ...next,
              sourceFingerprint: next.fingerprint,
              acceptedNearMatch: false,
            });
            setStatus("matched");
          },
        );
        return;
      }
      if (!source) throw new Error("The room is not using a local file.");
      const match = matchLocal(source, next);
      if (match === "exact") {
        setCandidate(null);
        setSelection({
          ...next,
          sourceFingerprint: source.fingerprint,
          acceptedNearMatch: false,
        });
        setStatus("matched");
      } else {
        setSelection(null);
        setCandidate(next);
        setStatus(match);
        sendReady(null);
      }
    } catch (reason) {
      setSelection(null);
      setCandidate(null);
      setStatus("error");
      setError(
        reason instanceof Error ? reason.message : "Could not use this local file.",
      );
      sendReady(null);
    }
  }

  function acceptNear() {
    if (!source || !candidate) return;
    setSelection({
      ...candidate,
      sourceFingerprint: source.fingerprint,
      acceptedNearMatch: true,
    });
    setCandidate(null);
    setStatus("matched");
  }

  function reset() {
    setSelection(null);
    setCandidate(null);
    setStatus("idle");
    setProgress(0);
    setError("");
    sendReady(null);
  }

  function mediaReady() {
    if (!source || !selection || selection.sourceFingerprint !== source.fingerprint)
      return;
    sendReady(selection.fingerprint, selection.acceptedNearMatch);
  }

  function mediaError() {
    setSelection(null);
    setStatus("error");
    setError(
      "Your browser can't play this file. Try MP4 (H.264) or WebM, or use Chrome or Edge.",
    );
    sendReady(null);
  }

  return {
    source,
    file: selection?.file ?? null,
    status,
    progress,
    error,
    candidate,
    ready,
    total: room.participants.length,
    choose,
    acceptNear,
    reset,
    mediaReady,
    mediaError,
  };
}
