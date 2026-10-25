import { expect, it } from "vitest";
import { createReactionId } from "../src/useReactions.js";
it("creates a valid reaction nonce without secure-context randomUUID on LAN HTTP", () => {
  const getRandomValues = <T extends ArrayBufferView>(array: T): T => {
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(7);
    return array;
  };
  const id = createReactionId({ getRandomValues });
  expect(id).toBe("07".repeat(16));
  expect(id).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
});
