import type { Media } from "@watchparty/shared";

const streamError = (kind: "hls" | "dash") =>
  `${kind === "hls" ? "HLS" : "MPEG-DASH"} stream could not load. Check the stream URL, CORS policy and codecs.`;

export async function attachAdaptiveMedia(
  video: HTMLVideoElement,
  media: Media,
  signal: AbortSignal,
  onError: (message: string) => void,
): Promise<() => void> {
  if (media.kind !== "video" || !media.stream) return () => {};

  if (media.stream === "hls") {
    // Safari and some platform browsers support HLS directly.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = media.url;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }
    const { default: Hls } = await import("hls.js");
    if (signal.aborted) return () => {};
    if (!Hls.isSupported()) {
      onError("This browser cannot play HLS streams on this device.");
      return () => {};
    }
    const hls = new Hls({ enableWorker: true });
    const failed = (_event: string, data: { fatal: boolean }) => {
      if (data.fatal && !signal.aborted) onError(streamError("hls"));
    };
    hls.on(Hls.Events.ERROR, failed);
    hls.attachMedia(video);
    hls.loadSource(media.url);
    return () => {
      hls.off(Hls.Events.ERROR, failed);
      hls.destroy();
    };
  }

  const dash = await import("dashjs");
  if (signal.aborted) return () => {};
  if (!dash.supportsMediaSource()) {
    onError("This browser cannot play MPEG-DASH streams on this device.");
    return () => {};
  }
  const player = dash.MediaPlayer().create();
  const failed = () => {
    if (!signal.aborted) onError(streamError("dash"));
  };
  player.on(dash.MediaPlayer.events.ERROR, failed);
  player.initialize(video, media.url, false);
  return () => {
    player.off(dash.MediaPlayer.events.ERROR, failed);
    player.reset();
  };
}
