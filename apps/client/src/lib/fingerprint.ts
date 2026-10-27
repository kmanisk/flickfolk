export const LOCAL_HASH_CHUNK = 1024 * 1024;

export interface ChunkRange {
  start: number;
  end: number;
}

export function localHashRanges(size: number): ChunkRange[] {
  if (!Number.isFinite(size) || size <= 0) return [];
  if (size < LOCAL_HASH_CHUNK * 3) return [{ start: 0, end: size }];
  const middle = Math.max(
    LOCAL_HASH_CHUNK,
    Math.min(
      size - LOCAL_HASH_CHUNK * 2,
      Math.floor((size - LOCAL_HASH_CHUNK) / 2),
    ),
  );
  return [
    { start: 0, end: LOCAL_HASH_CHUNK },
    { start: middle, end: middle + LOCAL_HASH_CHUNK },
    { start: size - LOCAL_HASH_CHUNK, end: size },
  ];
}

export async function hashLocalFile(
  file: Pick<File, "size" | "slice">,
  subtle: SubtleCrypto = crypto.subtle,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const ranges = localHashRanges(file.size);
  if (!ranges.length) throw new Error("Choose a non-empty video file.");
  const parts: Uint8Array[] = [];
  let total = 8;
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]!;
    const bytes = new Uint8Array(
      await file.slice(range.start, range.end).arrayBuffer(),
    );
    parts.push(bytes);
    total += bytes.byteLength;
    onProgress?.((i + 1) / ranges.length);
  }
  const input = new Uint8Array(total);
  new DataView(input.buffer).setBigUint64(0, BigInt(file.size), false);
  let offset = 8;
  for (const part of parts) {
    input.set(part, offset);
    offset += part.byteLength;
  }
  const digest = new Uint8Array(await subtle.digest("SHA-256", input));
  return Array.from(digest, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export function fingerprintFile(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/hash.worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<
      | { type: "progress"; progress: number }
      | { type: "result"; fingerprint: string }
      | { type: "error"; message: string }
    >) => {
      if (event.data.type === "progress") {
        onProgress?.(event.data.progress);
        return;
      }
      finish();
      if (event.data.type === "result") resolve(event.data.fingerprint);
      else reject(new Error(event.data.message));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("Could not fingerprint this file."));
    };
    worker.postMessage(file);
  });
}
