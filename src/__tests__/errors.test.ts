/**
 * @jest-environment node
 */
import {
  AllProvidersCoolingDownError,
  AllProvidersFailedError,
  EmptyCompletionError,
  FullKonkError,
  NoProvidersConfiguredError,
  ProviderRequestError,
  RateLimitError,
} from "../errors";

describe("error hierarchy", () => {
  it("every custom error is an instance of FullKonkError and Error", () => {
    const errors = [
      new NoProvidersConfiguredError(),
      new RateLimitError("groq", "model", 1000),
      new ProviderRequestError("groq", "model", 500, "boom"),
      new EmptyCompletionError("groq", "model"),
      new AllProvidersFailedError("last failure"),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(FullKonkError);
      expect(err.name).toBe(err.constructor.name);
    }
  });

  it("distinguishes configured providers cooling down from missing API keys", () => {
    const err = new AllProvidersCoolingDownError(12_100);
    expect(err).toBeInstanceOf(FullKonkError);
    expect(err.retryInMs).toBe(12_100);
    expect(err.message).toContain("about 13s");
    expect(err.message).not.toContain("No API keys configured");
  });

  it("RateLimitError carries provider/model/retryAfter metadata", () => {
    const err = new RateLimitError("groq", "llama", 5000);
    expect(err.providerId).toBe("groq");
    expect(err.modelId).toBe("llama");
    expect(err.retryAfterMs).toBe(5000);
  });

  it("ProviderRequestError truncates very long response bodies in its message", () => {
    const longBody = "x".repeat(1000);
    const err = new ProviderRequestError("groq", "llama", 502, longBody);
    expect(err.message.length).toBeLessThan(300);
    expect(err.status).toBe(502);
  });

  it("AllProvidersFailedError includes the last error message", () => {
    const err = new AllProvidersFailedError("timeout contacting deepseek");
    expect(err.message).toContain("timeout contacting deepseek");
  });
});
