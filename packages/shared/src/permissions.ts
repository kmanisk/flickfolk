import type { Participant } from "./index.js";

export type Role = "host" | "moderator" | "participant";
export type Permission =
  | "play"
  | "pause"
  | "seek"
  | "setVideo"
  | "resolveRequest"
  | "assignRole"
  | "removeParticipant"
  | "transferHost";
export function can(role: Role, action: Permission): boolean {
  return (
    role === "host" ||
    (role === "moderator" &&
      ["play", "pause", "seek", "setVideo", "resolveRequest"].includes(action))
  );
}

// Update both sides of the host invariant in one operation.
export function setHost(
  room: { hostId: string; participants: Participant[] },
  id: string,
) {
  if (!room.participants.some((p) => p.id === id))
    throw new Error("Participant not found.");
  for (const person of room.participants) {
    if (person.id === id) person.role = "host";
    else if (person.role === "host") person.role = "moderator";
  }
  room.hostId = id;
}
export function promoteHost(room: {
  hostId: string;
  participants: Participant[];
}) {
  const next =
    room.participants.find((p) => p.role === "moderator") ??
    room.participants[0];
  if (next) setHost(room, next.id);
}
