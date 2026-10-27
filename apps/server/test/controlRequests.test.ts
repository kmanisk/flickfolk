import { afterEach, expect, it, vi } from "vitest";
import { ControlRequests } from "../src/controlRequests.js";
import { VOICE_OFF, type ControlRequest, type Room } from "@watchparty/shared";
afterEach(() => vi.useRealTimers());
it("expires automatically with one timer, notifies only requester/reviewers, and stops when empty", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const room: Room = {
    code: "ABC234",
    hostId: "h",
    messages: [],
    playback: {
      media: null,
      position: 0,
      playing: false,
      updatedAt: 1000,
      revision: 0,
    },
    participants: [
      { id: "h", name: "Host", role: "host", voice: VOICE_OFF },
      { id: "m", name: "Mod", role: "moderator", voice: VOICE_OFF },
      { id: "p", name: "Guest", role: "participant", voice: VOICE_OFF },
    ],
  };
  const queue = vi.fn(),
    expired = vi.fn(),
    store = new ControlRequests(new Map([[room.code, room]]), queue, expired);
  const request: ControlRequest = {
    id: "r",
    requesterId: "p",
    requesterName: "Guest",
    action: "pause",
    payload: { position: 1 },
    createdAt: 1000,
    sourceRevision: 0,
  };
  store.replace(room, [request, { ...request, id: "r2", action: "play" }]);
  expect(vi.getTimerCount()).toBe(1);
  expect(queue.mock.calls.map(([id]) => id)).toEqual(["h", "m"]);
  vi.advanceTimersByTime(59_999);
  expect(expired).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(expired.mock.calls).toEqual([
    ["p", "r"],
    ["p", "r2"],
  ]);
  expect(store.current(room)).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
  store.replace(room, [{ ...request, createdAt: Date.now() }]);
  store.close();
  expect(vi.getTimerCount()).toBe(0);
});
