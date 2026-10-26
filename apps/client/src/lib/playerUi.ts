export type EndedOverlayMode = "hidden" | "restart" | "waiting";
export function endedOverlayMode(ended: boolean, host: boolean): EndedOverlayMode {
  if (!ended) return "hidden";
  return host ? "restart" : "waiting";
}
