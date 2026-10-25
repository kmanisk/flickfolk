import { useEffect, useRef, useState } from "react";
import { activeSpeakerIds } from "@watchparty/shared";
import { Avatar } from "./Avatar.js";
import type { AudioLevels } from "./AudioLevels.js";
export interface Speaker { id: string; name: string; speaking: boolean }
export function ActiveSpeakers({ people, levels }: { people: Speaker[]; levels: AudioLevels }) {
  const [visible, setVisible] = useState<string[]>([]);
  const shown = useRef<string[]>([]);
  const timers = useRef(new Map<string, number>());
  useEffect(() => {
    const active = new Set(activeSpeakerIds(people));
    const present = new Set(people.map((person) => person.id));
    for (const [id, timer] of timers.current) {
      if (active.has(id) || !present.has(id)) { clearTimeout(timer); timers.current.delete(id); }
    }
    const previous = shown.current;
    const next = [...active, ...previous.filter((id) => present.has(id) && !active.has(id))].slice(0, 3);
    for (const id of next) if (!active.has(id) && !timers.current.has(id)) {
      timers.current.set(id, window.setTimeout(() => {
        timers.current.delete(id);
        shown.current = shown.current.filter((value) => value !== id);
        setVisible(shown.current);
      }, 450));
    }
    if (next.join() !== previous.join()) { shown.current = next; setVisible(next); }
  }, [people]);
  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); timers.current.clear(); }, []);
  return <div className="active-speakers" aria-label="Speaking participants">{visible.map((id) => {
    const person = people.find((value) => value.id === id);
    return person && <div key={id} className={`active-speaker ${person.speaking ? "" : "speaker-release"}`}><Avatar {...person} levels={levels} /><span>{person.name}</span><i className="speaker-wave" aria-hidden="true"><b /><b /><b /></i></div>;
  })}</div>;
}
