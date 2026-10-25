// Spotify's SDK currently needs eval. Its route has a separate CSP; the app does not.
import { loadScript } from "./sdk.js";
interface Update {
  data: {
    position: number;
    duration: number;
    isPaused: boolean;
    isBuffering: boolean;
  };
}
interface Controller {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  destroy(): void;
  addListener(event: string, handler: (event: Update) => void): void;
}
interface API {
  createController(
    element: HTMLElement,
    options: Record<string, unknown>,
    ready: (controller: Controller) => void,
  ): void;
}
let port: MessagePort | undefined, controller: Controller | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const id = decodeURIComponent(location.hash.slice(1));
function dispose() {
  clearTimeout(timer);
  try {
    controller?.destroy();
  } catch {
    /* Removing the frame still releases its document. */
  }
  controller = undefined;
  port?.close();
  port = undefined;
}
window.addEventListener("pagehide", dispose);
window.addEventListener("message", (event) => {
  if (
    event.source !== parent ||
    event.origin !== location.origin ||
    event.data !== "flickfolk:spotify:init" ||
    !event.ports[0] ||
    port
  )
    return;
  port = event.ports[0];
  const send = (value: unknown) => port?.postMessage(value);
  if (
    !/^(track|album|playlist|episode|show|artist):[a-zA-Z0-9]{22}$/.test(id)
  ) {
    send({ type: "error", message: "Unsupported Spotify link." });
    return;
  }
  timer = setTimeout(
    () =>
      send({
        type: "error",
        message: "Spotify could not become ready. Try another source.",
      }),
    15000,
  );
  port.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (!controller || !data || typeof data !== "object" || !("action" in data))
      return;
    try {
      if (data.action === "play") controller.play();
      else if (data.action === "pause") controller.pause();
      else if (
        data.action === "seek" &&
        id.startsWith("episode:") &&
        "position" in data &&
        typeof data.position === "number" &&
        Number.isFinite(data.position) &&
        data.position >= 0 &&
        data.position <= 604800
      )
        controller.seek(Math.floor(data.position));
      else if (data.action === "dispose") dispose();
    } catch {
      send({
        type: "error",
        message: "Spotify could not perform this operation.",
      });
    }
  };
  // The listener is installed before the SDK bootstrap loads its CDN implementation.
  (
    window as unknown as { onSpotifyIframeApiReady: (api: API) => void }
  ).onSpotifyIframeApiReady = (api) => {
    if (!port) return;
    const target = document.getElementById("spotify-player")!;
    api.createController(
      target,
      { uri: `spotify:${id}`, width: "100%", height: 352 },
      (value) => {
        if (!port) {
          value.destroy();
          return;
        }
        controller = value;
        value.addListener("ready", () => {
          clearTimeout(timer);
          send({ type: "ready" });
        });
        value.addListener("playback_update", (event) => {
          const d = event.data;
          if (d && Number.isFinite(d.position) && Number.isFinite(d.duration))
            send({
              type: "update",
              position: d.position / 1000,
              duration: d.duration / 1000,
              playing: !d.isPaused,
              buffering: Boolean(d.isBuffering),
            });
        });
      },
    );
  };
  void loadScript("https://open.spotify.com/embed/iframe-api/v1").catch(() => {
    clearTimeout(timer);
    send({
      type: "error",
      message: "Spotify could not load. Check your connection.",
    });
  });
});
