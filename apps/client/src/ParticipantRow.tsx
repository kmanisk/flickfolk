import { memo } from "react";
import { Crown, Mic, MicOff } from "lucide-react";
import { Avatar, Chip } from "./ui/index.js";
import type { AudioLevels } from "./AudioLevels.js";
import type { Participant, VoiceState } from "@watchparty/shared";
export const ParticipantRow = memo(function ParticipantRow({
  person,
  self,
  host,
  voice,
  speaking,
  levels,
  connected = true,
}: {
  person: Participant;
  self: boolean;
  host: boolean;
  voice: VoiceState;
  speaking: boolean;
  levels: AudioLevels;
  connected?: boolean;
}) {
  const mic = !voice.joined ? "off" : voice.muted ? "muted" : "live";
  return (
    <div className={`participant ${speaking ? "is-speaking" : ""}`}>
      <Avatar
        name={person.name}
        id={person.id}
        speaking={speaking}
        levels={levels}
        online={connected}
        size={40}
      />
      <div className="participant-name">
        <strong>
          {person.name}
          {self && <small> (you)</small>}
        </strong>
        <span className="participant-presence">
          {speaking ? "Speaking" : voice.joined ? "In voice" : "In the room"}
        </span>
      </div>
      {host && (
        <Chip className="host-badge">
          <Crown aria-hidden="true" />
          HOST
        </Chip>
      )}
      <span
        className="mic-state"
        aria-label={`${person.name}: ${speaking ? "speaking" : mic}`}
      >
        {voice.joined && !voice.muted ? (
          <Mic aria-hidden="true" />
        ) : (
          <MicOff aria-hidden="true" />
        )}
      </span>
    </div>
  );
});
