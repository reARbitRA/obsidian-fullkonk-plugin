// src/types.ts
//
// Shared type definitions for fullKONK_>. Kept dependency-free (no imports from
// `obsidian`) so this module can be safely imported from unit tests without
// pulling in the Obsidian runtime.

/** High level product the user is asking the pipeline to build. */
export type BuildMode = "fullstack" | "frontend" | "backend" | "review";

/** Current step of the generation pipeline, used to drive the stage bar UI. */
export type PipelineStage =
  | "idle"
  | "architect"
  | "frontend"
  | "backend"
  | "verify"
  | "review"
  | "done"
  | "error";

/** Orchestration task categories used for provider scoring/routing. */
export type TaskType = "architect" | "frontend" | "backend" | "verify" | "review";

/** Identifiers for every provider integration the plugin ships with. */
export type ProviderID =
  | "groq"
  | "deepseek"
  | "cerebras"
  | "sambanova"
  | "openrouter"
  | "gemini"
  | "nvidia"
  | "github"
  | "huggingface";

/** A single selectable model exposed by a provider. */
export interface ModelDef {
  id: string;
  label: string;
}

/** Static, compile-time description of a provider integration. */
export interface ProviderDef {
  id: ProviderID;
  name: string;
  baseUrl: string;
  settingsKey: ApiKeySettingsField;
  models: ModelDef[];
  /** Lower number = more preferred for that task, used as a tie-breaker. */
  priority: Record<TaskType, number>;
  capabilityScore: number;
  thinkingScore: number;
  speedScore: number;
  contextWindow: number;
  maxOutput: number;
  rpm: number;
}

/** The subset of settings keys that store a provider's API key/token. */
export type ApiKeySettingsField =
  | "groqApiKey"
  | "deepseekApiKey"
  | "cerebrasApiKey"
  | "sambanovaApiKey"
  | "openrouterApiKey"
  | "geminiApiKey"
  | "nvidiaApiKey"
  | "githubToken"
  | "huggingfaceApiKey";

/** A single chat turn rendered in the terminal panel. */
export interface FKMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  stage?: PipelineStage;
  provider?: string;
  timestamp: number;
}

/** A file extracted from a fenced code block in an assistant response. */
export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

/** Normalized chat message sent to a provider's chat/completions endpoint. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Streaming callbacks used by the orchestrator to report progress to the UI. */
export interface OrchestratorCallbacks {
  onChunk: (text: string) => void;
  onProvider: (name: string, model: string) => void;
  onFailover: (from: string, to: string) => void;
  onMetrics: (tps: number, total: number) => void;
}

/** Persisted plugin settings (stored via Plugin#saveData in data.json). */
export interface FullKonkSettings {
  // Provider API keys
  groqApiKey: string;
  deepseekApiKey: string;
  cerebrasApiKey: string;
  sambanovaApiKey: string;
  openrouterApiKey: string;
  geminiApiKey: string;
  nvidiaApiKey: string;
  githubToken: string;
  huggingfaceApiKey: string;

  // Defaults
  defaultMode: BuildMode;
  defaultProvider: string;
  temperature: number;
  maxTokens: number;

  // Vault
  outputFolder: string; // where to save generated files
  saveHistory: boolean; // save chat history as markdown

  // Networking
  requestTimeoutMs: number;
}

export const DEFAULT_SETTINGS: FullKonkSettings = {
  groqApiKey: "",
  deepseekApiKey: "",
  cerebrasApiKey: "",
  sambanovaApiKey: "",
  openrouterApiKey: "",
  geminiApiKey: "",
  nvidiaApiKey: "",
  githubToken: "",
  huggingfaceApiKey: "",
  defaultMode: "fullstack",
  defaultProvider: "auto",
  temperature: 0.3,
  maxTokens: 8192,
  outputFolder: "fullKONK",
  saveHistory: true,
  requestTimeoutMs: 120_000,
};

/** Type guard + sanitizer used when loading persisted settings from disk. */
export function sanitizeSettings(raw: unknown): FullKonkSettings {
  const input = (raw && typeof raw === "object" ? raw : {}) as Partial<FullKonkSettings>;
  const merged: FullKonkSettings = { ...DEFAULT_SETTINGS };

  const stringKeys: (keyof FullKonkSettings)[] = [
    "groqApiKey",
    "deepseekApiKey",
    "cerebrasApiKey",
    "sambanovaApiKey",
    "openrouterApiKey",
    "geminiApiKey",
    "nvidiaApiKey",
    "githubToken",
    "huggingfaceApiKey",
    "defaultProvider",
    "outputFolder",
  ];
  const mergedRecord = merged as unknown as Record<string, unknown>;
  for (const key of stringKeys) {
    const value = input[key];
    if (typeof value === "string") {
      mergedRecord[key] = value;
    }
  }

  if (
    input.defaultMode === "fullstack" ||
    input.defaultMode === "frontend" ||
    input.defaultMode === "backend" ||
    input.defaultMode === "review"
  ) {
    merged.defaultMode = input.defaultMode;
  }

  if (typeof input.temperature === "number" && Number.isFinite(input.temperature)) {
    merged.temperature = clamp(input.temperature, 0, 1);
  }

  if (typeof input.maxTokens === "number" && Number.isFinite(input.maxTokens)) {
    merged.maxTokens = clamp(Math.round(input.maxTokens), 256, 65_536);
  }

  if (typeof input.saveHistory === "boolean") {
    merged.saveHistory = input.saveHistory;
  }

  if (typeof input.requestTimeoutMs === "number" && Number.isFinite(input.requestTimeoutMs)) {
    merged.requestTimeoutMs = clamp(Math.round(input.requestTimeoutMs), 5_000, 600_000);
  }

  if (!merged.outputFolder.trim()) {
    merged.outputFolder = DEFAULT_SETTINGS.outputFolder;
  }

  return merged;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
