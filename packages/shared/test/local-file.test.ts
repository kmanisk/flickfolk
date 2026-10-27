import { describe, expect, it } from "vitest";
import { cleanLocalSource, matchLocal } from "../src/index.js";

const a = "a".repeat(64);
const b = "b".repeat(64);

describe("local file matching", () => {
  it.each([
    [a, 10, a, 10.4, "exact"],
    [a, 10, b, 10, "near"],
    [a, 10, b, 11.999, "near"],
    [a, 10, b, 12, "near"],
    [a, 10, b, 12.001, "mismatch"],
  ] as const)("matches fingerprint/duration rules", (hf, hd, mf, md, expected) => {
    expect(
      matchLocal(
        { fingerprint: hf, durationSec: hd },
        { fingerprint: mf, durationSec: md },
      ),
    ).toBe(expected);
  });

  it("validates and sanitizes local metadata", () => {
    expect(
      cleanLocalSource({
        fingerprint: a,
        name: "folder/movie.webm",
        size: 123,
        durationSec: 2.5,
      }),
    ).toEqual({
      fingerprint: a,
      name: "foldermovie.webm",
      size: 123,
      durationSec: 2.5,
    });
    for (const value of [
      { fingerprint: "A".repeat(64), name: "a", size: 1, durationSec: 1 },
      { fingerprint: a, name: "", size: 1, durationSec: 1 },
      { fingerprint: a, name: "a", size: 0, durationSec: 1 },
      { fingerprint: a, name: "a", size: 1, durationSec: 0 },
    ])
      expect(() => cleanLocalSource(value)).toThrow();
  });
});
