import { memo, type CSSProperties } from "react";
import type { VisibleReaction } from "./useReactions.js";
export const ReactionOverlay = memo(function ReactionOverlay({
  items,
  onDone,
}: {
  items: VisibleReaction[];
  onDone: (id: string) => void;
}) {
  return (
    <div
      className="reaction-overlay"
      aria-label="Watch reactions"
      aria-live="polite"
    >
      {items.map((item) => (
        <span
          key={item.id}
          className={`floating-reaction ${item.compact ? "reaction-static" : ""}`}
          onAnimationEnd={() => onDone(item.id)}
          style={
            {
              "--reaction-x": `${item.drift}px`,
              "--reaction-rise": `${-item.rise}px`,
              "--reaction-rotation": `${item.rotation}deg`,
              right: `${item.slot}%`,
              animationDuration: `${item.duration}ms`,
            } as CSSProperties
          }
        >
          {item.symbol}
        </span>
      ))}
    </div>
  );
});
