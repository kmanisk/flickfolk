import { memo, useEffect, useRef } from "react";
import { avatarIdentity } from "@watchparty/shared";
import type { AudioLevels } from "./AudioLevels.js";
export const Avatar = memo(function Avatar({ name, id, speaking = false, levels }: {
  name: string; id?: string; speaking?: boolean; levels?: AudioLevels;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const identity = avatarIdentity(name);
  useEffect(() => {
    if (!id || !levels) return;
    return levels.subscribe(id, (value) => element.current?.style.setProperty("--voice-level", String(value)));
  }, [id, levels]);
  return <span ref={element} className={`person-avatar avatar-tone-${identity.color} ${speaking ? "avatar-speaking" : ""}`} aria-hidden="true">{identity.initials}</span>;
});
