import type { Reaction } from "./collaboration.js";
export function addReaction(items: Reaction[], next: Reaction): Reaction[] {
  if (
    items.some(
      (item) =>
        item.id === next.id ||
        (next.clientId &&
          item.clientId === next.clientId &&
          item.senderId === next.senderId),
    )
  )
    return items;
  return [...items.slice(-29), next];
}
