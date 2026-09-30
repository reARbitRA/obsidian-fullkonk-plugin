/**
 * @jest-environment node
 */
import { getProviderById, PROVIDERS } from "../providers/registry";

describe("PROVIDERS registry", () => {
  it("has unique provider ids", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every provider defines at least one model and a priority for every task", () => {
    const tasks = ["architect", "frontend", "backend", "verify", "review"] as const;
    for (const provider of PROVIDERS) {
      expect(provider.models.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(typeof provider.priority[task]).toBe("number");
      }
      expect(provider.baseUrl.startsWith("https://")).toBe(true);
      expect(provider.capabilityScore).toBeGreaterThan(0);
      expect(provider.maxOutput).toBeGreaterThan(0);
    }
  });

  it("getProviderById returns the matching provider", () => {
    expect(getProviderById("groq").name).toBe("Groq");
  });

  it("getProviderById throws for an unknown id", () => {
    expect(() => getProviderById("nonexistent")).toThrow(/Unknown provider/);
  });
});
