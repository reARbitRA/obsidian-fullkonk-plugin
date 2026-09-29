/**
 * @jest-environment node
 */
import { RateLimitTracker } from "../providers/rateLimitTracker";

describe("RateLimitTracker", () => {
  it("reports a fresh candidate as available", () => {
    const tracker = new RateLimitTracker();
    expect(tracker.isAvailable("groq", "llama-3.3-70b-versatile")).toBe(true);
    expect(tracker.cooldownRemainingMs("groq", "llama-3.3-70b-versatile")).toBe(0);
  });

  it("marks a candidate unavailable after a rate-limit penalty", () => {
    let now = 1_000_000;
    const tracker = new RateLimitTracker(() => now);

    tracker.penalize("groq", "llama-3.3-70b-versatile", "rate");
    expect(tracker.isAvailable("groq", "llama-3.3-70b-versatile")).toBe(false);
    expect(tracker.cooldownRemainingMs("groq", "llama-3.3-70b-versatile")).toBe(60_000);

    now += 60_001;
    expect(tracker.isAvailable("groq", "llama-3.3-70b-versatile")).toBe(true);
  });

  it("applies exponential backoff across consecutive rate-limit failures, capped at 15 minutes", () => {
    let now = 0;
    const tracker = new RateLimitTracker(() => now);

    tracker.penalize("groq", "m", "rate"); // 60s
    expect(tracker.cooldownRemainingMs("groq", "m")).toBe(60_000);
    now += 60_000;

    tracker.penalize("groq", "m", "rate"); // 120s
    expect(tracker.cooldownRemainingMs("groq", "m")).toBe(120_000);
    now += 120_000;

    tracker.penalize("groq", "m", "rate"); // 240s
    expect(tracker.cooldownRemainingMs("groq", "m")).toBe(240_000);
    now += 240_000;

    tracker.penalize("groq", "m", "rate"); // 480s
    expect(tracker.cooldownRemainingMs("groq", "m")).toBe(480_000);
    now += 480_000;

    tracker.penalize("groq", "m", "rate"); // would be 960s, capped at 900s
    expect(tracker.cooldownRemainingMs("groq", "m")).toBe(900_000);
  });

  it("uses a shorter, 5-minute-capped backoff for generic errors", () => {
    const tracker = new RateLimitTracker(() => 0);
    tracker.penalize("deepseek", "deepseek-chat", "error");
    expect(tracker.cooldownRemainingMs("deepseek", "deepseek-chat")).toBe(30_000);
  });

  it("clears the cooldown immediately on reward", () => {
    const tracker = new RateLimitTracker();
    tracker.penalize("groq", "m", "rate");
    expect(tracker.isAvailable("groq", "m")).toBe(false);
    tracker.reward("groq", "m");
    expect(tracker.isAvailable("groq", "m")).toBe(true);
  });

  it("tracks (provider, model) pairs independently", () => {
    const tracker = new RateLimitTracker();
    tracker.penalize("groq", "model-a", "rate");
    expect(tracker.isAvailable("groq", "model-a")).toBe(false);
    expect(tracker.isAvailable("groq", "model-b")).toBe(true);
    expect(tracker.isAvailable("cerebras", "model-a")).toBe(true);
  });

  it("reset() clears every tracked penalty", () => {
    const tracker = new RateLimitTracker();
    tracker.penalize("groq", "m", "rate");
    tracker.penalize("cerebras", "n", "error");
    tracker.reset();
    expect(tracker.isAvailable("groq", "m")).toBe(true);
    expect(tracker.isAvailable("cerebras", "n")).toBe(true);
  });
});
