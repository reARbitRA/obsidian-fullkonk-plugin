/**
 * @jest-environment node
 */
import { generateId } from "../utils/uuid";

describe("generateId()", () => {
  it("produces RFC-4122-v4-shaped identifiers", () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("produces unique ids across many calls", () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateId()));
    expect(ids.size).toBe(200);
  });

  it("falls back to a manual v4 generator when crypto.randomUUID is unavailable", () => {
    const original = globalThis.crypto;
    delete (globalThis as { crypto?: unknown }).crypto;
    try {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});
