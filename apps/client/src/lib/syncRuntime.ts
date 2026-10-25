import type { Socket } from "socket.io-client";
import {
  ClockSync,
  type ClientEvents,
  type ServerEvents,
} from "@watchparty/shared";
import { ClockSampler } from "./clockSampling.js";
import { createSyncStore } from "./syncStore.js";
export const clockSync = new ClockSync();
export const syncStore = createSyncStore();
const resync = new Set<() => void>();
export function subscribeResync(listener: () => void) {
  resync.add(listener);
  return () => {
    resync.delete(listener);
  };
}
export function startClock(socket: Socket<ServerEvents, ClientEvents>) {
  const sampler = new ClockSampler(
    clockSync,
    {
      ping: () =>
        new Promise((resolve, reject) => {
          if (!socket.connected) {
            reject(new Error("Offline"));
            return;
          }
          socket
            .timeout(3000)
            .emit("clock", (error: Error | null, now: number) =>
              error ? reject(error) : resolve(now),
            );
        }),
    },
    () =>
      syncStore.update({
        offsetMs: clockSync.offsetMs,
        rttMs: socket.connected ? clockSync.rttMs : null,
      }),
  );
  const notify = () => {
    if (socket.connected) resync.forEach((listener) => listener());
  };
  const connect = () => {
    void sampler.start().then((accepted) => {
      if (accepted) notify();
    });
  };
  const disconnect = () => {
    sampler.stop();
    syncStore.update({ state: "offline", driftMs: null, rttMs: null });
  };
  const refresh = () => {
    if (socket.connected && !document.hidden)
      void sampler.sample(3).then((accepted) => {
        if (accepted) notify();
      });
  };
  socket.on("connect", connect);
  socket.on("disconnect", disconnect);
  window.addEventListener("online", refresh);
  document.addEventListener("visibilitychange", refresh);
  if (socket.connected) connect();
  return () => {
    sampler.stop();
    socket.off("connect", connect);
    socket.off("disconnect", disconnect);
    window.removeEventListener("online", refresh);
    document.removeEventListener("visibilitychange", refresh);
  };
}
