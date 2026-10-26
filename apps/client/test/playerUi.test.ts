import { describe, expect, it } from "vitest";
import { endedOverlayMode } from "../src/lib/playerUi.js";

describe("ended overlay mode", () => {
  it("maps inactive, host and guest states", () => {
    expect(endedOverlayMode(false, true)).toBe("hidden");
    expect(endedOverlayMode(true, true)).toBe("restart");
    expect(endedOverlayMode(true, false)).toBe("waiting");
  });
});
