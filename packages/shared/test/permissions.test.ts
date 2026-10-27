import { describe, expect, it } from "vitest";
import {
  can,
  setHost,
  promoteHost,
  cleanControlIntent,
  checkRequestLimit,
  requestIsCurrent,
  VOICE_OFF,
  parseMedia,
  type Permission,
  type Role,
  type Room,
  type ControlRequest,
} from "../src/index.js";
const actions: Permission[] = [
  "play",
  "pause",
  "seek",
  "setVideo",
  "resolveRequest",
  "assignRole",
  "removeParticipant",
  "transferHost",
];
describe("permission matrix", () => {
  for (const role of ["host", "moderator", "participant"] as Role[])
    it.each(actions)(`${role}: %s`, (action) => {
      expect(can(role, action)).toBe(
        role === "host" ||
          (role === "moderator" && actions.indexOf(action) < 5),
      );
    });
});
function room(): Room {
  return {
    code: "ABC234",
    hostId: "h",
    participants: [
      { id: "h", name: "Host", role: "host", voice: { ...VOICE_OFF } },
      { id: "p", name: "Person", role: "participant", voice: { ...VOICE_OFF } },
      { id: "m", name: "Mod", role: "moderator", voice: { ...VOICE_OFF } },
    ],
    messages: [],
    playback: {
      media: parseMedia("https://example.com/movie.mp4"),
      position: 0,
      playing: false,
      revision: 3,
      updatedAt: 0,
    },
  };
}
function request(action: ControlRequest["action"] = "pause"): ControlRequest {
  return {
    id: "r",
    requesterId: "p",
    requesterName: "Person",
    action: action as "pause",
    payload: { position: 5 },
    createdAt: 1000,
    sourceRevision: 3,
  };
}
it("transfers host atomically and rejects absent targets without mutation", () => {
  const r = room();
  setHost(r, "p");
  expect(r.hostId).toBe("p");
  expect(
    r.participants.filter((p) => p.role === "host").map((p) => p.id),
  ).toEqual(["p"]);
  expect(r.participants[0]!.role).toBe("moderator");
  const before = structuredClone(r);
  expect(() => setHost(r, "absent")).toThrow();
  expect(r).toEqual(before);
});
it("promotes a moderator before a participant, then falls back safely", () => {
  const r = room();
  r.participants.shift();
  promoteHost(r);
  expect(r.hostId).toBe("m");
  r.participants = r.participants.filter((p) => p.id !== "m");
  promoteHost(r);
  expect(r.hostId).toBe("p");
  expect(r.participants.filter((p) => p.role === "host")).toHaveLength(1);
});
it("validates and strips untrusted request fields using provider capabilities", () => {
  const r = room();
  expect(
    cleanControlIntent(
      { action: "seek", payload: { position: 4, role: "host" }, role: "host" },
      r,
    ),
  ).toEqual({ action: "seek", payload: { position: 4 } });
  for (const input of [
    null,
    {},
    { action: "destroy", payload: {} },
    { action: "seek", payload: { position: -1 } },
    { action: "setVideo", payload: { url: "javascript:alert(1)" } },
  ])
    expect(() => cleanControlIntent(input, r)).toThrow();
  r.playback.media = parseMedia("https://kick.com/channel");
  expect(() =>
    cleanControlIntent({ action: "seek", payload: { position: 4 } }, r),
  ).toThrow(/support/);
});
it("deduplicates by requester/action and bounds each participant to three", () => {
  const queue = [request("pause"), request("play"), request("seek")];
  expect(() => checkRequestLimit(queue, "p", "pause")).toThrow(/Already/);
  expect(() => checkRequestLimit(queue, "p", "setVideo")).toThrow(/3/);
  expect(() => checkRequestLimit(queue, "other", "pause")).not.toThrow();
});
it("expires at 60 seconds, on revision changes, promotion and departure", () => {
  const r = room(),
    q = request();
  expect(requestIsCurrent(q, r, 60_999)).toBe(true);
  expect(requestIsCurrent(q, r, 61_000)).toBe(false);
  r.playback.revision++;
  expect(requestIsCurrent(q, r, 2000)).toBe(false);
  r.playback.revision--;
  r.participants[1]!.role = "moderator";
  expect(requestIsCurrent(q, r, 2000)).toBe(false);
  r.participants.splice(1, 1);
  expect(requestIsCurrent(q, r, 2000)).toBe(false);
});
