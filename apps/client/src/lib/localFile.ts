export async function localVideoDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const duration = await new Promise<number>((resolve, reject) => {
      const cleanup = () => {
        video.removeAttribute("src");
        video.load();
      };
      video.onloadedmetadata = () => {
        const value = video.duration;
        cleanup();
        if (Number.isFinite(value) && value >= 0.1) resolve(value);
        else reject(new Error("Could not read this video's duration."));
      };
      video.onerror = () => {
        cleanup();
        reject(
          new Error(
            "Your browser can't play this file. Try MP4 (H.264) or WebM, or use Chrome or Edge.",
          ),
        );
      };
      video.src = url;
    });
    return duration;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}
