import {
  can,
  requestIsCurrent,
  REQUEST_TTL,
  type ControlRequest,
  type Room,
} from "@watchparty/shared";

// One expiry timer per nonempty room, never one per request. No idle polling.
export class ControlRequests {
  private queues = new Map<string, ControlRequest[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(
    private rooms: Map<string, Room>,
    private sendQueue: (id: string, requests: ControlRequest[]) => void,
    private expired: (id: string, requestId: string) => void,
  ) {}
  current(room: Room): ControlRequest[] {
    const queue = this.queues.get(room.code) ?? [];
    const current = queue.filter((r) => requestIsCurrent(r, room, Date.now()));
    for (const r of queue)
      if (!current.includes(r)) this.expired(r.requesterId, r.id);
    this.queues.set(room.code, current);
    return current;
  }
  replace(room: Room, queue: ControlRequest[]) {
    this.queues.set(room.code, queue);
    this.publish(room);
  }
  publish(room: Room) {
    const queue = this.current(room);
    for (const p of room.participants)
      if (can(p.role, "resolveRequest")) this.sendQueue(p.id, queue);
    this.clearTimer(room.code);
    if (!queue.length) {
      this.queues.delete(room.code);
      return;
    }
    const timer = setTimeout(
      () => {
        const latest = this.rooms.get(room.code);
        if (latest) this.publish(latest);
        else this.delete(room.code);
      },
      Math.max(
        1,
        Math.min(...queue.map((r) => r.createdAt + REQUEST_TTL)) - Date.now(),
      ),
    );
    timer.unref();
    this.timers.set(room.code, timer);
  }
  private clearTimer(code: string) {
    clearTimeout(this.timers.get(code));
    this.timers.delete(code);
  }
  delete(code: string) {
    this.clearTimer(code);
    this.queues.delete(code);
  }
  close() {
    for (const code of this.timers.keys()) this.clearTimer(code);
    this.queues.clear();
  }
}
