// src/providers/rateLimitTracker.ts
//
// Tracks per (provider, model) cooldowns using exponential backoff so the
// orchestrator can skip candidates that recently failed instead of hammering
// an exhausted free-tier quota. Implemented as a class (rather than bare
// module-level state) so tests can create isolated instances, while
// `defaultRateLimitTracker` provides the shared singleton used at runtime.

export type PenaltyType = "rate" | "error";

interface Penalty {
  until: number;
  failures: number;
}

export class RateLimitTracker {
  private readonly penalties = new Map<string, Penalty>();

  constructor(private readonly now: () => number = Date.now) {}

  private key(providerId: string, modelId: string): string {
    return `${providerId}::${modelId}`;
  }

  /** Whether a candidate is currently outside of its cooldown window. */
  isAvailable(providerId: string, modelId: string): boolean {
    const key = this.key(providerId, modelId);
    const entry = this.penalties.get(key);
    if (!entry) return true;
    if (this.now() > entry.until) {
      this.penalties.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Record a failure for a candidate. Rate-limit failures back off more
   * aggressively (base 60s, capped at 15m) than generic errors (base 30s,
   * capped at 5m), both using exponential growth per consecutive failure.
   * When a server supplies Retry-After, honor it if it exceeds our heuristic.
   */
  penalize(providerId: string, modelId: string, type: PenaltyType, explicitDelayMs?: number): void {
    const key = this.key(providerId, modelId);
    const existing = this.penalties.get(key);
    const failures = (existing?.failures ?? 0) + 1;
    const baseMs = type === "rate" ? 60_000 : 30_000;
    const capMs = type === "rate" ? 900_000 : 300_000;
    const computedMs = Math.min(baseMs * Math.pow(2, failures - 1), capMs);
    const delayMs =
      typeof explicitDelayMs === "number" && Number.isFinite(explicitDelayMs) && explicitDelayMs > 0
        ? Math.max(computedMs, explicitDelayMs)
        : computedMs;
    this.penalties.set(key, { until: this.now() + delayMs, failures });
  }

  /** Clear any cooldown after a successful call. */
  reward(providerId: string, modelId: string): void {
    this.penalties.delete(this.key(providerId, modelId));
  }

  /** Milliseconds remaining before a candidate becomes available again (0 if available now). */
  cooldownRemainingMs(providerId: string, modelId: string): number {
    const entry = this.penalties.get(this.key(providerId, modelId));
    if (!entry) return 0;
    return Math.max(0, entry.until - this.now());
  }

  /** Test/debug helper: wipe all tracked penalties. */
  reset(): void {
    this.penalties.clear();
  }
}

/** Process-wide tracker shared by the orchestrator at runtime. */
export const defaultRateLimitTracker = new RateLimitTracker();
