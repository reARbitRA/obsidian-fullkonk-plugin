/**
 * @jest-environment node
 */
import {
  averageTps,
  createSessionStats,
  estimateTokens,
  formatDuration,
  formatStageLine,
  formatSummaryLine,
  formatTokens,
  formatTps,
  recordStage,
  startSession,
  summarize,
  totalDurationMs,
  totalTokens,
  StageStat,
} from "../stats";

function stage(overrides: Partial<StageStat> = {}): StageStat {
  return {
    stage: "architect",
    provider: "Groq",
    model: "Llama 3.3 70B",
    tokens: 100,
    durationMs: 1000,
    ...overrides,
  };
}

describe("session tracking", () => {
  it("creates an empty session", () => {
    const stats = createSessionStats();
    expect(stats).toEqual({ startedAt: null, endedAt: null, stages: [] });
  });

  it("startSession resets stages and stamps start/end", () => {
    const stats = createSessionStats();
    recordStage(stats, stage());
    startSession(stats, 1234);

    expect(stats.startedAt).toBe(1234);
    expect(stats.endedAt).toBe(1234);
    expect(stats.stages).toEqual([]);
  });

  it("recordStage appends entries and refreshes endedAt", () => {
    const stats = createSessionStats();
    startSession(stats, 0);
    const before = Date.now();
    recordStage(stats, stage());
    recordStage(stats, stage({ stage: "frontend" }));

    expect(stats.stages).toHaveLength(2);
    expect(stats.stages[1].stage).toBe("frontend");
    expect(stats.endedAt).toBeGreaterThanOrEqual(before);
  });
});

describe("estimateTokens()", () => {
  it("is zero for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("approximates four characters per token, rounding up", () => {
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
    expect(estimateTokens("a".repeat(41))).toBe(11);
  });
});

describe("aggregates", () => {
  it("sums tokens and durations across stages", () => {
    const stats = createSessionStats();
    recordStage(stats, stage({ tokens: 100, durationMs: 1000 }));
    recordStage(stats, stage({ stage: "backend", tokens: 300, durationMs: 3000 }));

    expect(totalTokens(stats)).toBe(400);
    expect(totalDurationMs(stats)).toBe(4000);
    expect(averageTps(stats)).toBe(100);
  });

  it("returns zero throughput for an empty or zero-duration session", () => {
    expect(averageTps(createSessionStats())).toBe(0);
    const stats = createSessionStats();
    recordStage(stats, stage({ tokens: 500, durationMs: 0 }));
    expect(averageTps(stats)).toBe(0);
  });

  it("summarize reports stage counts, failures and totals", () => {
    const stats = createSessionStats();
    recordStage(stats, stage({ tokens: 50, durationMs: 500 }));
    recordStage(stats, stage({ stage: "verify", tokens: 150, durationMs: 500, failed: true }));

    expect(summarize(stats)).toEqual({
      stageCount: 2,
      failedStageCount: 1,
      totalTokens: 200,
      totalDurationMs: 1000,
      averageTps: 200,
    });
  });
});

describe("formatters", () => {
  it("formatTokens adds thousands separators", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(1337)).toBe("1,337");
    expect(formatTokens(1_234_567)).toBe("1,234,567");
  });

  it("formatDuration scales from ms to minutes", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(999)).toBe("999ms");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(75_400)).toBe("1m 15s");
  });

  it("formatTps keeps one decimal below 10 tok/s", () => {
    expect(formatTps(0)).toBe("0 tok/s");
    expect(formatTps(3.14)).toBe("3.1 tok/s");
    expect(formatTps(42.4)).toBe("42 tok/s");
    expect(formatTps(NaN)).toBe("0 tok/s");
  });

  it("formatSummaryLine renders a single line with failure count when needed", () => {
    const stats = createSessionStats();
    recordStage(stats, stage({ tokens: 1337, durationMs: 1000 }));

    expect(formatSummaryLine(summarize(stats))).toBe("Σ 1,337 tok · 1337 tok/s · 1.0s · 1 stage");

    recordStage(stats, stage({ stage: "verify", tokens: 0, durationMs: 1000, failed: true }));
    expect(formatSummaryLine(summarize(stats))).toContain("2 stages · 1 failed");
  });

  it("formatSummaryLine handles an empty session", () => {
    expect(formatSummaryLine(summarize(createSessionStats()))).toBe("Σ no stages yet");
  });

  it("formatStageLine includes stage, tokens, duration and provider/model", () => {
    expect(formatStageLine(stage({ tokens: 900, durationMs: 2000 }))).toBe(
      "ARCHITECT — 900 tok · 2.0s · Groq / Llama 3.3 70B"
    );
  });

  it("formatStageLine degrades gracefully without provider info and marks failures", () => {
    expect(formatStageLine(stage({ provider: "", model: "", failed: true }))).toBe(
      "ARCHITECT (failed) — 100 tok · 1.0s · unknown provider"
    );
  });
});
