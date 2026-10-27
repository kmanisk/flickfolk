import { hashLocalFile } from "../lib/fingerprint.js";

type WorkerMessage =
  | { type: "progress"; progress: number }
  | { type: "result"; fingerprint: string }
  | { type: "error"; message: string };

const send = (message: WorkerMessage) =>
  (self as unknown as { postMessage: (value: WorkerMessage) => void }).postMessage(
    message,
  );

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    if (!globalThis.crypto?.subtle)
      throw new Error(
        "Secure file fingerprinting is unavailable here. Open Flickfolk over HTTPS or localhost.",
      );
    const file = event.data;
    if (!(file instanceof File) || file.size < 1)
      throw new Error("Choose a non-empty video file.");
    const fingerprint = await hashLocalFile(file, crypto.subtle, (progress) =>
      send({ type: "progress", progress }),
    );
    send({ type: "result", fingerprint });
  } catch (error) {
    send({
      type: "error",
      message: error instanceof Error ? error.message : "Could not fingerprint this file.",
    });
  }
};
