/**
 * @jest-environment node
 */
import { DEFAULT_SETTINGS, sanitizeSettings } from "../types";

describe("sanitizeSettings()", () => {
  it("returns DEFAULT_SETTINGS when given null/undefined/garbage", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("not an object")).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it("preserves valid string API keys", () => {
    const result = sanitizeSettings({ groqApiKey: "sk-abc123", deepseekApiKey: "sk-def456" });
    expect(result.groqApiKey).toBe("sk-abc123");
    expect(result.deepseekApiKey).toBe("sk-def456");
  });

  it("ignores non-string values for string fields", () => {
    const result = sanitizeSettings({ groqApiKey: 12345 });
    expect(result.groqApiKey).toBe("");
  });

  it("only accepts a valid BuildMode for defaultMode", () => {
    expect(sanitizeSettings({ defaultMode: "backend" }).defaultMode).toBe("backend");
    expect(sanitizeSettings({ defaultMode: "not-a-mode" }).defaultMode).toBe("fullstack");
  });

  it("clamps temperature to [0, 1]", () => {
    expect(sanitizeSettings({ temperature: -5 }).temperature).toBe(0);
    expect(sanitizeSettings({ temperature: 5 }).temperature).toBe(1);
    expect(sanitizeSettings({ temperature: 0.42 }).temperature).toBe(0.42);
    expect(sanitizeSettings({ temperature: "0.9" }).temperature).toBe(DEFAULT_SETTINGS.temperature);
  });

  it("clamps maxTokens to [256, 65536] and rounds to an integer", () => {
    expect(sanitizeSettings({ maxTokens: 10 }).maxTokens).toBe(256);
    expect(sanitizeSettings({ maxTokens: 1_000_000 }).maxTokens).toBe(65_536);
    expect(sanitizeSettings({ maxTokens: 4096.6 }).maxTokens).toBe(4097);
  });

  it("clamps requestTimeoutMs to [5000, 600000]", () => {
    expect(sanitizeSettings({ requestTimeoutMs: 100 }).requestTimeoutMs).toBe(5_000);
    expect(sanitizeSettings({ requestTimeoutMs: 10_000_000 }).requestTimeoutMs).toBe(600_000);
  });

  it("preserves a valid boolean saveHistory flag", () => {
    expect(sanitizeSettings({ saveHistory: false }).saveHistory).toBe(false);
    expect(sanitizeSettings({ saveHistory: "false" }).saveHistory).toBe(true); // ignored, default kept
  });

  it("falls back to the default output folder when blank", () => {
    expect(sanitizeSettings({ outputFolder: "   " }).outputFolder).toBe(DEFAULT_SETTINGS.outputFolder);
    expect(sanitizeSettings({ outputFolder: "MyStuff" }).outputFolder).toBe("MyStuff");
  });

  it("never throws for deeply malformed input", () => {
    expect(() => sanitizeSettings({ groqApiKey: { nested: true }, temperature: NaN })).not.toThrow();
  });
});
