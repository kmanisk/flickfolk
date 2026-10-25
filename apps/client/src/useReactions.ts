import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  addReaction,
  type ClientEvents,
  type ServerEvents,
  type Reaction,
  type ReactionSymbol,
} from "@watchparty/shared";
export interface VisibleReaction extends Reaction {
  duration: number;
  drift: number;
  rise: number;
  rotation: number;
  slot: number;
  compact: boolean;
}
export function useReactions(
  socket: Socket<ServerEvents, ClientEvents>,
  code: string | undefined,
  effects: boolean,
) {
  const [items, setItems] = useState<VisibleReaction[]>([]);
  const values = useRef<VisibleReaction[]>([]);
  const seen = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, number>());
  const cooldown = useRef(-Infinity);
  const current = useRef({ code, effects });
  current.current = { code, effects };
  const remove = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    values.current = values.current.filter((item) => item.id !== id);
    setItems(values.current);
  }, []);
  const show = useRef((reaction: Reaction) => {
    void reaction;
  });
  show.current = (reaction) => {
    if (!current.current.code) return;
    const key = `${reaction.senderId}:${reaction.clientId ?? reaction.id}`;
    for (const [id, at] of seen.current)
      if (performance.now() - at > 15000) seen.current.delete(id);
    if (
      seen.current.has(key) ||
      addReaction(values.current, reaction) === values.current
    )
      return;
    if (seen.current.size >= 256)
      seen.current.delete(seen.current.keys().next().value!);
    seen.current.set(key, performance.now());
    const compact =
      !current.current.effects ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next: VisibleReaction = {
      ...reaction,
      compact,
      duration: compact ? 600 : 1400 + Math.round(Math.random() * 400),
      drift: Math.round(Math.random() * 70 - 35),
      rise: 90 + Math.round(Math.random() * 70),
      rotation: Math.round(Math.random() * 30 - 15),
      slot: Math.round(Math.random() * 80),
    };
    const survivors = [...values.current.slice(-11), next];
    for (const item of values.current)
      if (!survivors.includes(item)) {
        clearTimeout(timers.current.get(item.id));
        timers.current.delete(item.id);
      }
    values.current = survivors;
    setItems(survivors);
    timers.current.set(
      next.id,
      window.setTimeout(() => remove(next.id), next.duration),
    );
  };
  useEffect(() => {
    const handler = (reaction: Reaction) => show.current(reaction);
    const reset = () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
      seen.current.clear();
      values.current = [];
      setItems([]);
    };
    socket.on("reaction", handler);
    socket.on("disconnect", reset);
    return () => {
      socket.off("reaction", handler);
      socket.off("disconnect", reset);
      reset();
    };
  }, [socket, code]);
  const send = useCallback(
    (symbol: ReactionSymbol) => {
      if (
        !socket.connected ||
        !current.current.code ||
        performance.now() - cooldown.current < 400
      )
        return;
      cooldown.current = performance.now();
      const id = crypto.randomUUID();
      show.current({ id, clientId: id, senderId: socket.id!, symbol });
      socket
        .timeout(5000)
        .emit("reaction:send", { symbol, clientId: id }, (err, result) => {
          if (err || !result.ok) remove(id);
        });
    },
    [socket, remove],
  );
  useEffect(() => {
    const reduce = () => {
      if (
        current.current.effects &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        return;
      values.current = values.current.map((item) => {
        clearTimeout(timers.current.get(item.id));
        timers.current.set(
          item.id,
          window.setTimeout(() => remove(item.id), 600),
        );
        return { ...item, compact: true, duration: 600 };
      });
      setItems(values.current);
    };
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", reduce);
    reduce();
    return () => media.removeEventListener("change", reduce);
  }, [effects, remove]);
  return { items, send, remove };
}
