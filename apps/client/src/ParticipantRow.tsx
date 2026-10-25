import { Avatar } from "./Avatar.js";
import type { AudioLevels } from "./AudioLevels.js";
import { memo } from "react";
import type { Participant, VoiceState } from "@watchparty/shared";
export const ParticipantRow = memo(function ParticipantRow({
  person,
  levels,
  self,
  host,
  voice,
  speaking,
}: {
  person: Participant;
  levels: AudioLevels;
  self: boolean;
  host: boolean;
  voice: VoiceState;
  speaking: boolean;
}) {
  const mic = !voice.joined ? "off" : voice.muted ? "muted" : "live";
  return (
    <div className={`participant ${speaking ? "is-speaking" : ""}`}>
      <Avatar name={person.name} id={person.id} speaking={speaking} levels={levels} />
      <span className="participant-name">
        <span>{person.name}</span>
        {self && <small> (you)</small>}
      </span>
      {host && <span className="host-badge">HOST</span>}
      <span
        className={`mic-state ${speaking ? "speaking" : ""}`}
        aria-label={`${person.name}: ${speaking ? "speaking" : mic}`}
      >
        {speaking ? "speaking" : mic}
        {speaking && <i className="speech-dot" aria-hidden="true" />}
      </span>
    </div>
  );
});
