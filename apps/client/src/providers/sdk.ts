const scripts = new Map<string, Promise<void>>();
export function loadScript(src: string): Promise<void> {
  const cached = scripts.get(src);
  if (cached) return cached;
  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    const timeout = setTimeout(failed, 15000);
    function failed() {
      clearTimeout(timeout);
      scripts.delete(src);
      script.remove();
      reject(
        new Error(
          "The provider could not load. Check your connection or try another source.",
        ),
      );
    }
    script.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    script.onerror = failed;
    document.head.append(script);
  });
  scripts.set(src, pending);
  return pending;
}
export function assertActive(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Source changed", "AbortError");
}
export function iframe(container: HTMLElement, src: string, title: string) {
  const frame = document.createElement("iframe");
  frame.src = src;
  frame.title = title;
  frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
  frame.allowFullscreen = true;
  container.replaceChildren(frame);
  return frame;
}
