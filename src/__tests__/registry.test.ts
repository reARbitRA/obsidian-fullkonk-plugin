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

  it("ships the twelve documented free-tier providers", () => {
    expect(PROVIDERS).toHaveLength(12);
    expect(PROVIDERS.map((p) => p.id).sort()).toEqual([
      "cerebras",
      "deepseek",
      "fireworks",
      "gemini",
      "github",
      "groq",
      "huggingface",
      "mistral",
      "nvidia",
      "openrouter",
      "sambanova",
      "together",
    ]);
  });

  it("points every provider at an OpenAI-compatible /chat/completions base URL", () => {
    for (const provider of PROVIDERS) {
      expect(provider.baseUrl).not.toMatch(/\/chat\/completions/);
      expect(provider.baseUrl.endsWith("/")).toBe(false);
    }
  });

  it("assigns every provider a distinct API-key settings field", () => {
    const keys = PROVIDERS.map((p) => p.settingsKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("getProviderById returns the matching provider", () => {
    expect(getProviderById("groq").name).toBe("Groq");
    expect(getProviderById("mistral").name).toBe("Mistral");
    expect(getProviderById("together").name).toBe("Together AI");
    expect(getProviderById("fireworks").name).toBe("Fireworks AI");
  });

  it("getProviderById throws for an unknown id", () => {
    expect(() => getProviderById("nonexistent")).toThrow(/Unknown provider/);
  });
});
