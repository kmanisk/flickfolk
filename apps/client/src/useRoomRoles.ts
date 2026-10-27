import { useEffect, useRef, useState } from "react";
import {
  can,
  type Ack,
  type ClientEvents,
  type ControlIntent,
  type ControlRequest,
  type Room,
  type ServerEvents,
} from "@watchparty/shared";
import type { Socket } from "socket.io-client";

export function useRoomRoles(
  socket: Socket<ServerEvents, ClientEvents>,
  room: Room,
  notify: (message: string) => void,
) {
  const role =
    room.participants.find((p) => p.id === socket.id)?.role ?? "participant";
  const [queue, setQueue] = useState<ControlRequest[]>([]);
  const previousRole = useRef(role);
  const message = useRef(notify);
  message.current = notify;
  useEffect(() => {
    if (previousRole.current !== role)
      message.current(
        `You are now ${role === "host" ? "the host" : `a ${role}`}`,
      );
    previousRole.current = role;
  }, [role]);
  useEffect(() => {
    const known = new Set<string>();
    let ready = false;
    const update = (items: ControlRequest[]) => {
      if (!can(role, "resolveRequest")) return;
      if (ready && items.some((r) => !known.has(r.id)))
        message.current("New control request");
      known.clear();
      items.forEach((r) => known.add(r.id));
      setQueue(items);
    };
    const refresh = () => {
      if (can(role, "resolveRequest"))
        socket.emit("control:requests", (result) => {
          if (result.ok) update(result.data);
          ready = true;
        });
    };
    const result: ServerEvents["control:result"] = (value) =>
      message.current(
        value.error ?? (value.approved ? "Approved" : "Declined"),
      );
    socket.on("control:requests", update);
    socket.on("control:result", result);
    socket.on("connect", refresh);
    refresh();
    return () => {
      socket.off("control:requests", update);
      socket.off("control:result", result);
      socket.off("connect", refresh);
    };
  }, [socket, room.code, role]);
  const done: Ack = (result) => {
    if (!result.ok) message.current(result.error);
  };
  function request(intent: ControlIntent) {
    if (!socket.connected) {
      message.current("Wait until you reconnect.");
      return;
    }
    socket.timeout(7000).emit("control:request", intent, (error, result) => {
      message.current(
        error
          ? "Request timed out. Please try again."
          : result.ok
            ? "Waiting for approval"
            : result.error,
      );
    });
  }
  return {
    role,
    queue: can(role, "resolveRequest") ? queue : [],
    request,
    resolve: (requestId: string, approve: boolean) =>
      socket.emit("control:resolve", { requestId, approve }, done),
    assign: (userId: string, next: "moderator" | "participant") =>
      socket.emit("role:assign", { userId, role: next }, done),
    remove: (userId: string) =>
      socket.emit("participant:remove", { userId }, done),
  };
}
