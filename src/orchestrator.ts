// src/orchestrator.ts
//
// Provider-agnostic chat orchestration: scores every configured
// (provider, model) candidate for the requested task, then streams the
// completion from the highest ranked candidate that is not currently in a
// rate-limit cooldown. On failure (HTTP 429, non-2xx, network error, or an
// empty completion) it penalizes that candidate and transparently fails over
// to the next one, invoking `onFailover` so the UI can surface what happened.

import { PROVIDERS } from "./providers/registry";
import { RateLimitTracker, defaultRateLimitTracker } from "./providers/rateLimitTracker";
import { logger } from "./utils/logger";
import {
  AllProvidersFailedError,
  EmptyCompletionError,
  NoProvidersConfiguredError,
  ProviderRequestError,
  RateLimitError,
} from "./errors";
import {
  ChatMessage,
  FullKonkSettings,
  ModelDef,
  OrchestratorCallbacks,
  ProviderDef,
  TaskType,
} from "./types";

export { PROVIDERS };

// ─── SCORING ────────────────────────────────────────────────────────────────

const WEIGHTS: Record<TaskType, { cap: number; think: number; speed: number }> = {
  architect: { cap: 0.4, think: 0.4, speed: 0.2 },
  frontend: { cap: 0.5, think: 0.2, speed: 0.3 },
  backend: { cap: 0.5, think: 0.3, speed: 0.2 },
  verify: { cap: 0.4, think: 0.4, speed: 0.2 },
  review: { cap: 0.4, think: 0.4, speed: 0.2 },
};

/** Weighted capability/thinking/speed score for a provider on a given task. */
export function score(provider: ProviderDef, task: TaskType): number {
  const w = WEIGHTS[task];
  return provider.capabilityScore * w.cap + provider.thinkingScore * w.think + provider.speedScore * w.speed;
}

export interface Candidate {
  provider: ProviderDef;
  model: ModelDef;
  score: number;
}

/**
 * Build the ranked list of usable (provider, model) candidates for a task:
 * only providers with a non-empty API key configured, only models that are
 * not currently in a rate-limit cooldown, ranked by weighted score, with the
 * provider's task-specific `priority` used as an ascending tie-breaker.
 */
export function buildCandidates(
  settings: FullKonkSettings,
  task: TaskType,
  tracker: RateLimitTracker = defaultRateLimitTracker,
  providers: ProviderDef[] = PROVIDERS
): Candidate[] {
  const out: Candidate[] = [];

  for (const provider of providers) {
    const apiKey = settings[provider.settingsKey];
    if (!apiKey || !apiKey.trim()) continue;

    for (const model of provider.models) {
      if (!tracker.isAvailable(provider.id, model.id)) continue;
      out.push({ provider, model, score: score(provider, task) });
    }
  }

  return out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.provider.priority[task] - b.provider.priority[task];
  });
}

// ─── STREAMING ──────────────────────────────────────────────────────────────

interface ChatCompletionChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

function combineSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (!a) return b;
  if (!b) return a;
  const anyCtor = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyCtor === "function") return anyCtor([a, b]);
  // Fallback for runtimes without AbortSignal.any: bridge manually.
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  if (a.aborted || b.aborted) controller.abort();
  return controller.signal;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Stream a single candidate's completion. Returns the fully accumulated text.
 * Throws `RateLimitError` on HTTP 429 and `ProviderRequestError` on any other
 * non-2xx response; both mark the candidate's cooldown via `tracker`.
 */
export async function streamCandidate(
  candidate: Candidate,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  apiKey: string,
  callbacks: Pick<OrchestratorCallbacks, "onChunk" | "onMetrics">,
  tracker: RateLimitTracker,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
  timeoutMs = 120_000
): Promise<string> {
  const { provider, model } = candidate;
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);
  const combinedSignal = combineSignals(signal, timeoutController.signal);

  let response: Response;
  try {
    response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://konkred.xyz",
        "X-Title": "fullKONK_> Obsidian Plugin",
      },
      body: JSON.stringify({
        model: model.id,
        messages,
        temperature,
        max_tokens: Math.min(maxTokens, provider.maxOutput),
        stream: true,
      }),
      signal: combinedSignal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    if (response.status === 429) {
      tracker.penalize(provider.id, model.id, "rate");
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
      throw new RateLimitError(provider.id, model.id, retryAfterMs);
    }
    tracker.penalize(provider.id, model.id, "error");
    throw new ProviderRequestError(provider.id, model.id, response.status, errText);
  }

  if (!response.body) {
    // Some fetch polyfills (or misconfigured mocks) may not implement streaming;
    // still support returning a fully-buffered payload gracefully.
    const text = await response.text();
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let tokensSinceLastTick = 0;
  let lastTick = Date.now();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkText = decoder.decode(value, { stream: true });
      for (const line of chunkText.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;

        let parsed: ChatCompletionChunk;
        try {
          parsed = JSON.parse(raw) as ChatCompletionChunk;
        } catch {
          continue;
        }

        const text = parsed.choices?.[0]?.delta?.content ?? "";
        if (text) {
          full += text;
          tokensSinceLastTick += Math.ceil(text.length / 4);
          callbacks.onChunk(text);
        }

        const now = Date.now();
        const elapsed = now - lastTick;
        if (elapsed > 500) {
          callbacks.onMetrics(Math.round((tokensSinceLastTick / elapsed) * 1000), tokensSinceLastTick);
          lastTick = now;
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  return full;
}

// ─── ORCHESTRATE ────────────────────────────────────────────────────────────

export interface OrchestrateOptions {
  tracker?: RateLimitTracker;
  fetchImpl?: FetchLike;
  providers?: ProviderDef[];
}

/**
 * Route a chat request to the best available provider/model for `task`,
 * transparently failing over across every configured candidate until one
 * succeeds. Throws `NoProvidersConfiguredError` if no API key is set, or
 * `AllProvidersFailedError` if every candidate fails.
 */
export async function orchestrate(
  task: TaskType,
  messages: ChatMessage[],
  settings: FullKonkSettings,
  callbacks: OrchestratorCallbacks,
  signal?: AbortSignal,
  options: OrchestrateOptions = {}
): Promise<string> {
  const tracker = options.tracker ?? defaultRateLimitTracker;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);

  if (!fetchImpl) {
    throw new Error("No `fetch` implementation available in this runtime.");
  }
  if (!messages || messages.length === 0) {
    throw new Error("orchestrate() requires at least one message.");
  }

  const candidates = buildCandidates(settings, task, tracker, options.providers);
  if (candidates.length === 0) {
    throw new NoProvidersConfiguredError();
  }

  let lastErrorMessage = "";

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    callbacks.onProvider(candidate.provider.name, candidate.model.label);

    if (i > 0) {
      const prev = candidates[i - 1];
      callbacks.onFailover(
        `${prev.provider.name} / ${prev.model.label}`,
        `${candidate.provider.name} / ${candidate.model.label}`
      );
    }

    const apiKey = settings[candidate.provider.settingsKey];

    try {
      const result = await streamCandidate(
        candidate,
        messages,
        settings.temperature,
        settings.maxTokens,
        apiKey,
        callbacks,
        tracker,
        fetchImpl,
        signal,
        settings.requestTimeoutMs
      );

      if (!result.trim()) {
        tracker.penalize(candidate.provider.id, candidate.model.id, "error");
        lastErrorMessage = new EmptyCompletionError(candidate.provider.id, candidate.model.id).message;
        continue;
      }

      tracker.reward(candidate.provider.id, candidate.model.id);
      return result;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErrorMessage = err instanceof Error ? err.message : String(err);
      logger.debug(`candidate ${candidate.provider.id}/${candidate.model.id} failed: ${lastErrorMessage}`);
      continue;
    }
  }

  throw new AllProvidersFailedError(lastErrorMessage);
}
