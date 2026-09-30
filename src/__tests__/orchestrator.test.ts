/**
 * @jest-environment node
 */
import {
  buildCandidates,
  orchestrate,
  score,
  streamCandidate,
  PROVIDERS,
} from "../orchestrator";
import { RateLimitTracker } from "../providers/rateLimitTracker";
import {
  AllProvidersFailedError,
  NoProvidersConfiguredError,
  ProviderRequestError,
  RateLimitError,
} from "../errors";
import { DEFAULT_SETTINGS } from "../types";
import type { ChatMessage, FullKonkSettings, OrchestratorCallbacks, ProviderDef } from "../types";

function settingsWith(overrides: Partial<FullKonkSettings>): FullKonkSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function noopCallbacks(): OrchestratorCallbacks {
  return {
    onChunk: jest.fn(),
    onProvider: jest.fn(),
    onFailover: jest.fn(),
    onMetrics: jest.fn(),
  };
}

function sseChunk(contentPieces: string[]): string {
  const events = contentPieces.map(
    (piece) => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`
  );
  events.push("data: [DONE]\n\n");
  return events.join("");
}

function makeStreamResponse(body: string, status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

const FAKE_PROVIDER_A: ProviderDef = {
  id: "groq",
  name: "Fake A",
  baseUrl: "https://fake-a.test/v1",
  settingsKey: "groqApiKey",
  capabilityScore: 5,
  thinkingScore: 5,
  speedScore: 5,
  contextWindow: 1000,
  maxOutput: 1000,
  rpm: 10,
  priority: { architect: 1, frontend: 1, backend: 1, verify: 1, review: 1 },
  models: [{ id: "model-a", label: "Model A" }],
};

const FAKE_PROVIDER_B: ProviderDef = {
  id: "deepseek",
  name: "Fake B",
  baseUrl: "https://fake-b.test/v1",
  settingsKey: "deepseekApiKey",
  capabilityScore: 5,
  thinkingScore: 5,
  speedScore: 5,
  contextWindow: 1000,
  maxOutput: 1000,
  rpm: 10,
  priority: { architect: 2, frontend: 2, backend: 2, verify: 2, review: 2 },
  models: [{ id: "model-b", label: "Model B" }],
};

describe("score()", () => {
  it("weighs capability/thinking/speed differently per task", () => {
    const provider: ProviderDef = { ...FAKE_PROVIDER_A, capabilityScore: 10, thinkingScore: 0, speedScore: 0 };
    // architect weight on capability is 0.4 -> 10*0.4 = 4
    expect(score(provider, "architect")).toBeCloseTo(4);
    // frontend weight on capability is 0.5 -> 10*0.5 = 5
    expect(score(provider, "frontend")).toBeCloseTo(5);
  });
});

describe("buildCandidates()", () => {
  it("only includes providers with a non-empty configured API key", () => {
    const settings = settingsWith({ groqApiKey: "key-a", deepseekApiKey: "   " });
    const candidates = buildCandidates(settings, "backend", new RateLimitTracker(), [
      FAKE_PROVIDER_A,
      FAKE_PROVIDER_B,
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].provider.id).toBe("groq");
  });

  it("excludes candidates currently inside a rate-limit cooldown", () => {
    const settings = settingsWith({ groqApiKey: "a", deepseekApiKey: "b" });
    const tracker = new RateLimitTracker();
    tracker.penalize("groq", "model-a", "rate");
    const candidates = buildCandidates(settings, "backend", tracker, [FAKE_PROVIDER_A, FAKE_PROVIDER_B]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].provider.id).toBe("deepseek");
  });

  it("breaks ties in equal scores using the provider's task priority (ascending)", () => {
    const settings = settingsWith({ groqApiKey: "a", deepseekApiKey: "b" });
    const candidates = buildCandidates(settings, "backend", new RateLimitTracker(), [
      FAKE_PROVIDER_B, // priority 2 for backend
      FAKE_PROVIDER_A, // priority 1 for backend
    ]);
    expect(candidates[0].provider.id).toBe("groq");
    expect(candidates[1].provider.id).toBe("deepseek");
  });

  it("sorts strictly by score when scores differ, regardless of priority", () => {
    const strongerB: ProviderDef = { ...FAKE_PROVIDER_B, capabilityScore: 10, thinkingScore: 10, speedScore: 10 };
    const settings = settingsWith({ groqApiKey: "a", deepseekApiKey: "b" });
    const candidates = buildCandidates(settings, "backend", new RateLimitTracker(), [FAKE_PROVIDER_A, strongerB]);
    expect(candidates[0].provider.id).toBe("deepseek");
  });

  it("returns an empty list when the real provider registry has no keys configured", () => {
    const candidates = buildCandidates(DEFAULT_SETTINGS, "architect");
    expect(candidates).toEqual([]);
  });

  it("covers every real registered provider when all keys are present", () => {
    const allKeysSettings = settingsWith({
      groqApiKey: "a",
      deepseekApiKey: "a",
      cerebrasApiKey: "a",
      sambanovaApiKey: "a",
      openrouterApiKey: "a",
      geminiApiKey: "a",
      nvidiaApiKey: "a",
      githubToken: "a",
      huggingfaceApiKey: "a",
    });
    const candidates = buildCandidates(allKeysSettings, "architect");
    const totalModels = PROVIDERS.reduce((sum, p) => sum + p.models.length, 0);
    expect(candidates).toHaveLength(totalModels);
  });
});

describe("streamCandidate()", () => {
  it("accumulates streamed SSE delta content into the full completion text", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(makeStreamResponse(sseChunk(["Hello", ", ", "world!"])));
    const onChunk = jest.fn();
    const onMetrics = jest.fn();
    const tracker = new RateLimitTracker();

    const candidate = { provider: FAKE_PROVIDER_A, model: FAKE_PROVIDER_A.models[0], score: 5 };
    const messages: ChatMessage[] = [{ role: "user", content: "hi" }];

    const result = await streamCandidate(
      candidate,
      messages,
      0.5,
      100,
      "sk-test",
      { onChunk, onMetrics },
      tracker,
      fetchImpl
    );

    expect(result).toBe("Hello, world!");
    expect(onChunk).toHaveBeenCalledWith("Hello");
    expect(onChunk).toHaveBeenCalledWith(", ");
    expect(onChunk).toHaveBeenCalledWith("world!");

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("model-a");
    expect(body.max_tokens).toBe(100); // min(maxTokens, provider.maxOutput)
    expect(body.stream).toBe(true);
  });

  it("caps max_tokens at the provider's maxOutput", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(makeStreamResponse(sseChunk(["ok, this is fine"])));
    const candidate = { provider: FAKE_PROVIDER_A, model: FAKE_PROVIDER_A.models[0], score: 5 };

    await streamCandidate(
      candidate,
      [{ role: "user", content: "hi" }],
      0.5,
      999_999,
      "sk-test",
      { onChunk: jest.fn(), onMetrics: jest.fn() },
      new RateLimitTracker(),
      fetchImpl
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(FAKE_PROVIDER_A.maxOutput);
  });

  it("throws RateLimitError and penalizes the tracker on HTTP 429", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response("rate limited", { status: 429, headers: { "retry-after": "12" } })
    );
    const tracker = new RateLimitTracker();
    const candidate = { provider: FAKE_PROVIDER_A, model: FAKE_PROVIDER_A.models[0], score: 5 };

    await expect(
      streamCandidate(
        candidate,
        [{ role: "user", content: "hi" }],
        0.5,
        100,
        "sk-test",
        { onChunk: jest.fn(), onMetrics: jest.fn() },
        tracker,
        fetchImpl
      )
    ).rejects.toBeInstanceOf(RateLimitError);

    expect(tracker.isAvailable("groq", "model-a")).toBe(false);
  });

  it("throws ProviderRequestError and penalizes the tracker on other non-2xx statuses", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    const tracker = new RateLimitTracker();
    const candidate = { provider: FAKE_PROVIDER_A, model: FAKE_PROVIDER_A.models[0], score: 5 };

    await expect(
      streamCandidate(
        candidate,
        [{ role: "user", content: "hi" }],
        0.5,
        100,
        "sk-test",
        { onChunk: jest.fn(), onMetrics: jest.fn() },
        tracker,
        fetchImpl
      )
    ).rejects.toBeInstanceOf(ProviderRequestError);

    expect(tracker.isAvailable("groq", "model-a")).toBe(false);
  });
});

describe("orchestrate()", () => {
  it("throws NoProvidersConfiguredError when no API key is set", async () => {
    await expect(
      orchestrate("architect", [{ role: "user", content: "hi" }], DEFAULT_SETTINGS, noopCallbacks())
    ).rejects.toBeInstanceOf(NoProvidersConfiguredError);
  });

  it("throws for an empty messages array", async () => {
    await expect(
      orchestrate("architect", [], settingsWith({ groqApiKey: "a" }), noopCallbacks())
    ).rejects.toThrow(/at least one message/);
  });

  it("fails over to the next candidate when the first is rate limited, and rewards the winner", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(makeStreamResponse(sseChunk(["final answer"])));

    const tracker = new RateLimitTracker();
    const callbacks = noopCallbacks();
    const settings = settingsWith({ groqApiKey: "a", deepseekApiKey: "b" });

    const result = await orchestrate(
      "backend",
      [{ role: "user", content: "hi" }],
      settings,
      callbacks,
      undefined,
      { tracker, fetchImpl, providers: [FAKE_PROVIDER_A, FAKE_PROVIDER_B] }
    );

    expect(result).toBe("final answer");
    expect(callbacks.onFailover).toHaveBeenCalledTimes(1);
    expect(tracker.isAvailable("groq", "model-a")).toBe(false);
    expect(tracker.isAvailable("deepseek", "model-b")).toBe(true);
  });

  it("skips a candidate that returns an empty completion and tries the next one", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(makeStreamResponse(sseChunk([""])))
      .mockResolvedValueOnce(makeStreamResponse(sseChunk(["real content here"])));

    const settings = settingsWith({ groqApiKey: "a", deepseekApiKey: "b" });
    const result = await orchestrate(
      "backend",
      [{ role: "user", content: "hi" }],
      settings,
      noopCallbacks(),
      undefined,
      { tracker: new RateLimitTracker(), fetchImpl, providers: [FAKE_PROVIDER_A, FAKE_PROVIDER_B] }
    );

    expect(result).toBe("real content here");
  });

  it("throws AllProvidersFailedError when every candidate fails", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const settings = settingsWith({ groqApiKey: "a", deepseekApiKey: "b" });

    await expect(
      orchestrate("backend", [{ role: "user", content: "hi" }], settings, noopCallbacks(), undefined, {
        tracker: new RateLimitTracker(),
        fetchImpl,
        providers: [FAKE_PROVIDER_A, FAKE_PROVIDER_B],
      })
    ).rejects.toBeInstanceOf(AllProvidersFailedError);
  });

  it("does not retry once the abort signal has already fired", async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn().mockImplementation(() => {
      controller.abort();
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });
    const settings = settingsWith({ groqApiKey: "a", deepseekApiKey: "b" });

    await expect(
      orchestrate("backend", [{ role: "user", content: "hi" }], settings, noopCallbacks(), controller.signal, {
        tracker: new RateLimitTracker(),
        fetchImpl,
        providers: [FAKE_PROVIDER_A, FAKE_PROVIDER_B],
      })
    ).rejects.toThrow("aborted");

    // Only the first candidate should have been attempted before we bail out.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("invokes onProvider for the selected candidate before attempting the request", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(makeStreamResponse(sseChunk(["hi there"])));
    const callbacks = noopCallbacks();
    const settings = settingsWith({ groqApiKey: "a" });

    await orchestrate("architect", [{ role: "user", content: "hi" }], settings, callbacks, undefined, {
      tracker: new RateLimitTracker(),
      fetchImpl,
      providers: [FAKE_PROVIDER_A],
    });

    expect(callbacks.onProvider).toHaveBeenCalledWith("Fake A", "Model A");
  });
});
