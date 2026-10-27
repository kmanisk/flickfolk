import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  LOCAL_HASH_CHUNK,
  hashLocalFile,
  localHashRanges,
} from "../src/lib/fingerprint.js";

describe("local file fingerprinting", () => {
  it("uses the entire small file exactly once", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const slice = vi.fn(() => new Blob([bytes]));
    const hash = await hashLocalFile(
      { size: bytes.length, slice } as unknown as Pick<File, "size" | "slice">,
      webcrypto.subtle as unknown as SubtleCrypto,
    );
    expect(slice).toHaveBeenCalledOnce();
    expect(slice).toHaveBeenCalledWith(0, bytes.length);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reads only first, middle and last MiB for large files", async () => {
    const size = 10 * 1024 * 1024;
    const ranges = localHashRanges(size);
    expect(ranges).toHaveLength(3);
    expect(ranges[0]).toEqual({ start: 0, end: LOCAL_HASH_CHUNK });
    expect(ranges[2]).toEqual({
      start: size - LOCAL_HASH_CHUNK,
      end: size,
    });
    const slice = vi.fn((start: number, end: number) =>
      new Blob([new Uint8Array(end - start)]),
    );
    const progress: number[] = [];
    await hashLocalFile(
      { size, slice } as unknown as Pick<File, "size" | "slice">,
      webcrypto.subtle as unknown as SubtleCrypto,
      (value) => progress.push(value),
    );
    expect(slice).toHaveBeenCalledTimes(3);
    expect(progress.at(-1)).toBe(1);
  });
});
