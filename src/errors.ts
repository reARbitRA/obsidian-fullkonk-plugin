// src/errors.ts
//
// Structured error hierarchy used across the orchestrator and vault layers so
// callers can branch on `instanceof` instead of parsing error message strings.

/** Base class for every error raised by fullKONK_> application code. */
export class FullKonkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** No provider has an API key configured. */
export class NoProvidersConfiguredError extends FullKonkError {
  constructor() {
    super(
      "No API keys configured. Open fullKONK_> settings and add at least one provider API key."
    );
  }
}

/** A provider responded with HTTP 429 (rate limited / quota exhausted). */
export class RateLimitError extends FullKonkError {
  constructor(public readonly providerId: string, public readonly modelId: string, public readonly retryAfterMs?: number) {
    super(`Rate limited by ${providerId}/${modelId}`);
  }
}

/** A provider responded with a non-2xx, non-429 HTTP status. */
export class ProviderRequestError extends FullKonkError {
  constructor(
    public readonly providerId: string,
    public readonly modelId: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(`${providerId}/${modelId} request failed with HTTP ${status}: ${body.slice(0, 200)}`);
  }
}

/** A provider returned HTTP 200 but with an empty or unusable completion. */
export class EmptyCompletionError extends FullKonkError {
  constructor(public readonly providerId: string, public readonly modelId: string) {
    super(`${providerId}/${modelId} returned an empty completion`);
  }
}

/** Every configured candidate provider/model failed for a given task. */
export class AllProvidersFailedError extends FullKonkError {
  constructor(public readonly lastError: string) {
    super(`All providers failed. Last error: ${lastError}`);
  }
}

/** The request was intentionally cancelled via AbortController. */
export class AbortedError extends FullKonkError {
  constructor() {
    super("Request aborted by user");
    this.name = "AbortError";
  }
}

/** Raised when persisted settings/data fail structural validation. */
export class InvalidSettingsError extends FullKonkError {}

/** Raised for vault filesystem operations that cannot be completed safely. */
export class VaultOperationError extends FullKonkError {}
