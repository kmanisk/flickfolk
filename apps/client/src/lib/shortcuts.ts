// One dispatcher for room and player shortcuts; focused controls stay usable.
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const field = target.closest("input, textarea");
  if (field?.tagName === "TEXTAREA") return true;
  if (field instanceof HTMLInputElement)
    return [
      "text",
      "search",
      "url",
      "email",
      "password",
      "number",
      "tel",
    ].includes(field.type);
  return (
    (target instanceof HTMLElement && target.isContentEditable) ||
    Boolean(target.closest('[role="textbox"]'))
  );
}
type Shortcuts = Record<string, () => void>;
const listeners = new Set<Shortcuts>();
function dispatch(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  const key = event.key.toLowerCase();
  // Popover Escape handlers run on document capture; leave those the first turn.
  if (key === "escape" && document.querySelector('[role="dialog"]')) return;
  if (key !== "escape" && isTextEntryTarget(event.target)) return;
  const actions = [...listeners].flatMap((map) =>
    Object.hasOwn(map, key) ? [map[key]!] : [],
  );
  if (!actions.length) return;
  event.preventDefault();
  actions.forEach((action) => action());
}
export function registerShortcuts(shortcuts: Shortcuts): () => void {
  if (!listeners.size) window.addEventListener("keydown", dispatch, true);
  listeners.add(shortcuts);
  return () => {
    listeners.delete(shortcuts);
    if (!listeners.size) window.removeEventListener("keydown", dispatch, true);
  };
}
