import { AudioLevels } from "./AudioLevels.js";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  speechActivity,
  SILENT,
  type SpeechActivity,
  VOICE_OFF,
  type ClientEvents,
  type ServerEvents,
  type Participant,
  type VoiceSignal,
  type VoiceState,
} from "@watchparty/shared";
type Peer = {
  pc: RTCPeerConnection;
  pending: RTCIceCandidateInit[];
  audio: HTMLAudioElement;
  release?: () => void;
};
export function useVoice(
  socket: Socket<ServerEvents, ClientEvents>,
  code: string | undefined,
  connected: boolean,
  people: Participant[],
) {
  const levels = useRef(new AudioLevels()).current;
  const [state, setState] = useState<VoiceState>({ ...VOICE_OFF });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState<Record<string, boolean>>(
    {},
  );
  const audioContext = useRef<AudioContext | null>(null);
  const [needsAudio, setNeedsAudio] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const current = useRef({ code, connected, people });
  current.current = { code, connected, people };
  const stream = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, Peer>());
  const iceServers = useRef<RTCIceServer[]>([]);
  const generation = useRef(0);
  const releaseMeter = useRef<(() => void) | null>(null);
  const pending = useRef(false);
  function closePeer(id: string) {
    const peer = peers.current.get(id);
    if (!peer) return;
    peer.pc.ontrack = null;
    peer.pc.onicecandidate = null;
    peer.pc.onconnectionstatechange = null;
    peer.release?.();
    peer.pc.close();
    peer.audio.pause();
    peer.audio.srcObject = null;
    peer.audio.remove();
    peers.current.delete(id);
    setRemoteSpeaking((values) => {
      if (!(id in values)) return values;
      const next = { ...values };
      delete next[id];
      return next;
    });
  }
  function stop() {
    const wasJoined = stateRef.current.joined;
    stateRef.current = { ...VOICE_OFF };
    if (wasJoined && socket.connected && current.current.code)
      socket.emit("voice:state", { ...VOICE_OFF }, () => {});
    generation.current++;
    pending.current = false;
    setBusy(false);
    releaseMeter.current?.();
    releaseMeter.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    for (const id of peers.current.keys()) closePeer(id);
    stateRef.current = { ...VOICE_OFF };
    setState({ ...VOICE_OFF });
    setNeedsAudio(false);
    setRemoteSpeaking({});
    const context = audioContext.current;
    audioContext.current = null;
    if (context) void context.close().catch(() => {});
  }
  function announce(next: VoiceState) {
    stateRef.current = next;
    setState(next);
    if (!socket.connected || !current.current.code) return;
    const run = generation.current;
    socket.timeout(5000).emit("voice:state", next, (err, result) => {
      if (run !== generation.current) return;
      if (err || !result.ok) {
        setError(
          err
            ? "Voice connection interrupted."
            : !result.ok
              ? result.error
              : "Voice unavailable.",
        );
        stop();
      }
    });
  }
  function send(to: string, signal: VoiceSignal) {
    if (!socket.connected || !stream.current) return;
    const run = generation.current;
    socket
      .timeout(5000)
      .emit("voice:signal", { targetId: to, signal }, (err, result) => {
        if (run !== generation.current) return;
        if (err || !result.ok) {
          closePeer(to);
          setError(
            err
              ? "Voice connection interrupted."
              : !result.ok
                ? result.error
                : "Voice unavailable.",
          );
        }
      });
  }
  function context() {
    if (audioContext.current) return audioContext.current;
    try {
      audioContext.current = new AudioContext();
      return audioContext.current;
    } catch {
      return null;
    }
  }
  function meterStream(
    stream: MediaStream,
    report: (speaking: boolean) => void,
    enabled: () => boolean,
    id: string,
  ) {
    const ctx = context();
    if (!ctx) return () => {};
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let activity: SpeechActivity = { ...SILENT };
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      const rms = Math.sqrt(
        samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) /
          samples.length,
      );
      levels.publish(id, enabled() ? rms : 0);
      const next = speechActivity(activity, rms, performance.now(), enabled());
      if (next.speaking !== activity.speaking) report(next.speaking);
      activity = next;
    }, 60);
    return () => {
      clearInterval(timer);
      levels.publish(id, 0);
      source.disconnect();
      analyser.disconnect();
      report(false);
    };
  }
  function makePeer(id: string): Peer {
    const existing = peers.current.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: iceServers.current });
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.hidden = true;
    document.body.append(audio);
    const peer: Peer = { pc, pending: [], audio };
    peers.current.set(id, peer);
    for (const track of stream.current!.getAudioTracks())
      pc.addTrack(track, stream.current!);
    pc.onicecandidate = (event) => {
      if (event.candidate)
        send(id, {
          kind: "ice",
          candidate: event.candidate.toJSON() as {
            candidate: string;
            sdpMid: string | null;
            sdpMLineIndex: number | null;
          },
        });
    };
    pc.ontrack = (event) => {
      if (event.track.kind !== "audio") {
        event.track.stop();
        return;
      }
      const incoming = event.streams[0] ?? new MediaStream([event.track]);
      peer.release?.();
      // Keep the native WebRTC sink attached: Chromium may otherwise deliver
      // silence to Web Audio for remote tracks (crbug.com/40094084).
      audio.srcObject = incoming;
      audio.muted = true;
      void audio.play().catch(() => setNeedsAudio(true));
      const ctx = context();
      if (ctx) {
        try {
          const source = ctx.createMediaStreamSource(incoming);
          const compressor = ctx.createDynamicsCompressor();
          const gain = ctx.createGain();
          compressor.threshold.value = -24;
          compressor.knee.value = 18;
          compressor.ratio.value = 3;
          compressor.attack.value = 0.006;
          compressor.release.value = 0.18;
          gain.gain.value = 1;
          source.connect(compressor).connect(gain).connect(ctx.destination);
          const unmeter = meterStream(
            incoming,
            (speaking) =>
              setRemoteSpeaking((values) =>
                values[id] === speaking
                  ? values
                  : { ...values, [id]: speaking },
              ),
            () =>
              pc.connectionState === "connected" &&
              !event.track.muted &&
              event.track.readyState === "live",
            id,
          );
          const ended = () => {
            unmeter();
            source.disconnect();
            compressor.disconnect();
            gain.disconnect();
          };
          event.track.addEventListener("ended", ended, { once: true });
          peer.release = () => {
            event.track.removeEventListener("ended", ended);
            ended();
          };
          void ctx
            .resume()
            .then(() => {
              if (audioContext.current === ctx) setNeedsAudio(false);
            })
            .catch(() => {
              if (audioContext.current === ctx) setNeedsAudio(true);
            });
          if (ctx.state === "suspended") setNeedsAudio(true);
          return;
        } catch {
          /* Keep receiving voice if Web Audio is unsupported. */
        }
      }
      audio.muted = false;
      void audio.play().catch(() => setNeedsAudio(true));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        closePeer(id);
        setError(
          "A voice connection failed. Rejoin voice; TURN may be needed on this network.",
        );
      }
    };
    return peer;
  }
  // One deterministic offerer per pair avoids simultaneous offer collisions.
  const reconcile = useRef(() => {});
  reconcile.current = () => {
    if (!stream.current || !stateRef.current.joined || !socket.id) return;
    const active = current.current.people.filter(
      (p) => p.id !== socket.id && p.voice.joined,
    );
    for (const id of peers.current.keys())
      if (!active.some((p) => p.id === id)) closePeer(id);
    for (const person of active) {
      if (peers.current.has(person.id)) continue;
      try {
        const peer = makePeer(person.id);
        if (socket.id < person.id)
          void (async () => {
            await peer.pc.setLocalDescription(await peer.pc.createOffer());
            if (
              peer.pc.localDescription &&
              peers.current.get(person.id) === peer
            )
              send(person.id, {
                kind: "description",
                type: "offer",
                sdp: peer.pc.localDescription.sdp,
              });
          })().catch(() => {
            closePeer(person.id);
            setError("Voice negotiation failed.");
          });
      } catch {
        closePeer(person.id);
        setError("Voice is unavailable in this browser.");
      }
    }
  };
  useEffect(() => {
    reconcile.current();
  }, [people, state.joined]);
  useEffect(() => {
    const signal = ({
      fromId,
      signal,
    }: {
      fromId: string;
      signal: VoiceSignal;
    }) => {
      if (
        !stream.current ||
        !stateRef.current.joined ||
        !current.current.people.some((p) => p.id === fromId && p.voice.joined)
      )
        return;
      void (async () => {
        const peer = makePeer(fromId);
        if (signal.kind === "ice") {
          if (peer.pc.remoteDescription)
            await peer.pc.addIceCandidate(signal.candidate);
          else if (peer.pending.length < 64)
            peer.pending.push(signal.candidate);
          return;
        }
        await peer.pc.setRemoteDescription({
          type: signal.type,
          sdp: signal.sdp,
        });
        for (const candidate of peer.pending.splice(0))
          await peer.pc.addIceCandidate(candidate);
        if (signal.type === "offer") {
          await peer.pc.setLocalDescription(await peer.pc.createAnswer());
          send(fromId, {
            kind: "description",
            type: "answer",
            sdp: peer.pc.localDescription!.sdp,
          });
        }
      })().catch(() => {
        closePeer(fromId);
        setError("Voice negotiation failed.");
      });
    };
    socket.on("voice:signal", signal);
    return () => {
      socket.off("voice:signal", signal);
    };
  }, [socket]);
  useEffect(() => {
    stop();
    setError("");
    return stop;
  }, [code, connected]);
  function meter(local: MediaStream) {
    try {
      releaseMeter.current = meterStream(
        local,
        (speaking) => {
          if (speaking !== stateRef.current.speaking)
            announce({ ...stateRef.current, speaking });
        },
        () => stateRef.current.joined && !stateRef.current.muted,
        socket.id!,
      );
    } catch {
      /* Voice remains available without a level meter. */
    }
  }
  async function toggle(permissionClick = false) {
    if (pending.current || !current.current.code || !socket.connected) return;
    if (stream.current) {
      const muted = !stateRef.current.muted;
      stream.current.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
      announce({ joined: true, muted, speaking: false });
      return;
    }
    if (!permissionClick) {
      setError("Click Mic to allow microphone access first.");
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === "undefined"
    ) {
      setError(
        "Voice needs HTTPS or localhost and a browser with WebRTC audio.",
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    const run = generation.current;
    const ctx = context();
    if (ctx)
      void ctx
        .resume()
        .then(() => {
          if (audioContext.current === ctx) setNeedsAudio(false);
        })
        .catch(() => {
          if (audioContext.current === ctx) setNeedsAudio(true);
        });
    try {
      const response = await fetch("/api/rtc-config", { cache: "no-store" });
      if (!response.ok) throw new Error("Voice configuration is unavailable.");
      const config = (await response.json()) as { iceServers: RTCIceServer[] };
      iceServers.current = config.iceServers;
      if (run !== generation.current) return;
      const local = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (run !== generation.current || !socket.connected) {
        local.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = local;
      local.getAudioTracks().forEach((track) => {
        track.onended = () => {
          announce({ ...VOICE_OFF });
          stop();
        };
      });
      announce({ joined: true, muted: false, speaking: false });
      meter(local);
    } catch (e) {
      if (run === generation.current) {
        stop();
        setError(e instanceof Error ? e.message : "Microphone unavailable.");
      }
    } finally {
      if (run === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  function enableAudio() {
    setNeedsAudio(false);
    if (audioContext.current)
      void audioContext.current.resume().catch(() => setNeedsAudio(true));
    for (const peer of peers.current.values())
      if (peer.audio.srcObject)
        void peer.audio.play().catch(() => setNeedsAudio(true));
  }
  return {
    state,
    remoteSpeaking,
    levels,
    error,
    busy,
    needsAudio,
    enableAudio,
    toggle,
    stop,
  };
}
