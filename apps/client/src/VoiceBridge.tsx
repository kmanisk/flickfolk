import { useEffect, useRef } from "react";
import { useVoice } from "./useVoice.js";
import type { Socket } from "socket.io-client";
import type {
  ClientEvents,
  ServerEvents,
  Participant,
} from "@watchparty/shared";
export type VoiceApi = ReturnType<typeof useVoice>;
export default function VoiceBridge({
  socket,
  code,
  connected,
  people,
  onChange,
}: {
  socket: Socket<ServerEvents, ClientEvents>;
  code: string;
  connected: boolean;
  people: Participant[];
  onChange: (voice: VoiceApi) => void;
}) {
  const voice = useVoice(socket, code, connected, people);
  const publish = useRef(onChange);
  publish.current = onChange;
  useEffect(() => {
    publish.current(voice);
  }, [
    voice.state,
    voice.remoteSpeaking,
    voice.error,
    voice.busy,
    voice.needsAudio,
  ]);
  useEffect(() => {
    void voice.toggle(true);
  }, []);
  return null;
}
