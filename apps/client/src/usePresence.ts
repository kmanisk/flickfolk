import { useEffect, useRef, useState } from "react";
import type { Participant } from "@watchparty/shared";
// Retain departed rows briefly for CSS exit feedback; never retain voice state.
export function usePresence(people: Participant[], code: string | undefined) {
  const [departed, setDeparted] = useState<Participant[]>([]);
  const previous = useRef(people);
  const timers = useRef(new Map<string, number>());
  useEffect(() => {
    const removed = previous.current.filter((person) => !people.some((next) => next.id === person.id));
    previous.current = people;
    if (removed.length) {
      setDeparted((current) => [...current, ...removed].slice(-24));
      for (const person of removed) {
        clearTimeout(timers.current.get(person.id));
        timers.current.set(person.id, window.setTimeout(() => {
        timers.current.delete(person.id);
        setDeparted((current) => current.filter((value) => value.id !== person.id));
      }, 140));
      }
    }
  }, [people]);
  useEffect(() => {
    setDeparted([]);
    return () => { for (const timer of timers.current.values()) clearTimeout(timer); timers.current.clear(); };
  }, [code]);
  return departed.filter((person) => !people.some((current) => current.id === person.id));
}
