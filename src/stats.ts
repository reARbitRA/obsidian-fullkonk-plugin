// src/stats.ts
//
// Pure helpers for tracking a build session's cost/throughput profile: how
// many tokens each pipeline stage produced, which provider/model served it,
// and how long it took. The view owns a mutable `SessionStats` instance and
// records one entry per stage; `summarize()` derives the aggregate numbers
// shown in the UI strip and persisted into the chat-history note.
//
// Kept dependency-free (no imports from `obsidian`) so this module is trivially
// unit-testable and safe to import from anywhere.

import { PipelineStage } from "./types";

export interface StageStat {
  /** Pipeline stage this entry describes (never "idle"/"done"/"error" in practice). */
  stage: PipelineStage;
  /** Human-readable provider name (e.g. "Groq"), or "" if unknown. */
  provider: string;
  /** Human-readable model label (e.g. "Llama 3.3 70B"), or "" if unknown. */
  model: string;
  /** Estimated tokens streamed during the stage. */
  tokens: number;
  /** Wall-clock duration of the stage in milliseconds. */
  durationMs: number;
  /** True when the stage ended in an error or was aborted mid-stream. */
  failed?: boolean;
}

export interface SessionStats {
  startedAt: number | null;
  endedAt: number | null;
  stages: StageStat[];
}

export interface SessionSummary {
  stageCount: number;
  failedStageCount: number;
  totalTokens: number;
  totalDurationMs: number;
  /** Estimated output tokens per second across every stage. */
  averageTps: number;
}

/** A fresh, empty session. */
export function createSessionStats(): SessionStats {
  return { startedAt: null, endedAt: null, stages: [] };
}

/** Mark the session as started (called once per build, before the first stage). */
export function startSession(stats: SessionStats, now: number = Date.now()): SessionStats {
  stats.startedAt = now;
  stats.endedAt = now;
  stats.stages = [];
  return stats;
}

/** Append a completed stage. Mutates and returns `stats` for convenient chaining. */
export function recordStage(stats: SessionStats, entry: StageStat): SessionStats {
  stats.stages.push(entry);
  stats.endedAt = Date.now();
  return stats;
}

/**
 * Rough token estimate for streamed text. Streaming APIs rarely report usage
 * per chunk, so the plugin counts ~4 characters per token — the same heuristic
 * the live tok/s meter has always used.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function totalTokens(stats: SessionStats): number {
  return stats.stages.reduce((sum, stage) => sum + stage.tokens, 0);
}

export function totalDurationMs(stats: SessionStats): number {
  return stats.stages.reduce((sum, stage) => sum + stage.durationMs, 0);
}

export function averageTps(stats: SessionStats): number {
  const seconds = totalDurationMs(stats) / 1000;
  if (seconds <= 0) return 0;
  return totalTokens(stats) / seconds;
}

export function summarize(stats: SessionStats): SessionSummary {
  return {
    stageCount: stats.stages.length,
    failedStageCount: stats.stages.filter((s) => s.failed).length,
    totalTokens: totalTokens(stats),
    totalDurationMs: totalDurationMs(stats),
    averageTps: averageTps(stats),
  };
}

// ─── FORMATTING ─────────────────────────────────────────────────────────────

export function formatTokens(tokens: number): string {
  return Math.round(tokens).toLocaleString("en-US");
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatTps(tps: number): string {
  if (!Number.isFinite(tps) || tps <= 0) return "0 tok/s";
  return tps < 10 ? `${tps.toFixed(1)} tok/s` : `${Math.round(tps)} tok/s`;
}

/** One-line aggregate shown in the view's stats strip. */
export function formatSummaryLine(summary: SessionSummary): string {
  if (summary.stageCount === 0) return "Σ no stages yet";
  const parts = [
    `Σ ${formatTokens(summary.totalTokens)} tok`,
    formatTps(summary.averageTps),
    formatDuration(summary.totalDurationMs),
    `${summary.stageCount} stage${summary.stageCount === 1 ? "" : "s"}`,
  ];
  if (summary.failedStageCount > 0) {
    parts.push(`${summary.failedStageCount} failed`);
  }
  return parts.join(" · ");
}

/** Tab-separated breakdown row, used by the per-stage UI list. */
export function formatStageLine(stat: StageStat): string {
  const who = stat.provider ? `${stat.provider}${stat.model ? ` / ${stat.model}` : ""}` : "unknown provider";
  const status = stat.failed ? " (failed)" : "";
  return `${stat.stage.toUpperCase()}${status} — ${formatTokens(stat.tokens)} tok · ${formatDuration(
    stat.durationMs
  )} · ${who}`;
}
