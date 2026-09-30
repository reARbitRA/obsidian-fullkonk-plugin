// src/providers/registry.ts
//
// Static registry of every free-tier (or free-trial) LLM provider fullKONK_>
// knows how to talk to. All of these expose an OpenAI-compatible
// `/chat/completions` endpoint, including Google Gemini via its OpenAI
// compatibility shim (`/v1beta/openai`), which lets the orchestrator use a
// single request/streaming code path for all of them.

import { ProviderDef } from "../types";

export const PROVIDERS: ProviderDef[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    settingsKey: "geminiApiKey",
    capabilityScore: 10,
    thinkingScore: 9,
    speedScore: 6,
    contextWindow: 1_000_000,
    maxOutput: 65_536,
    rpm: 10,
    priority: { architect: 1, frontend: 2, backend: 2, verify: 1, review: 1 },
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    settingsKey: "deepseekApiKey",
    capabilityScore: 9,
    thinkingScore: 10,
    speedScore: 5,
    contextWindow: 128_000,
    maxOutput: 32_768,
    rpm: 60,
    priority: { architect: 2, frontend: 3, backend: 1, verify: 2, review: 2 },
    models: [
      { id: "deepseek-reasoner", label: "DeepSeek R1" },
      { id: "deepseek-chat", label: "DeepSeek V3" },
    ],
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    settingsKey: "nvidiaApiKey",
    capabilityScore: 9,
    thinkingScore: 10,
    speedScore: 7,
    contextWindow: 128_000,
    maxOutput: 32_768,
    rpm: 40,
    priority: { architect: 2, frontend: 3, backend: 1, verify: 2, review: 2 },
    models: [
      { id: "deepseek-ai/deepseek-r1", label: "DeepSeek R1 (NVIDIA)" },
      { id: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B (NVIDIA)" },
    ],
  },
  {
    id: "sambanova",
    name: "SambaNova",
    baseUrl: "https://api.sambanova.ai/v1",
    settingsKey: "sambanovaApiKey",
    capabilityScore: 8,
    thinkingScore: 9,
    speedScore: 10,
    contextWindow: 131_072,
    maxOutput: 16_384,
    rpm: 30,
    priority: { architect: 3, frontend: 2, backend: 3, verify: 3, review: 3 },
    models: [
      { id: "DeepSeek-R1", label: "DeepSeek R1 (SambaNova)" },
      { id: "Llama-4-Maverick-17B-128E-Instruct", label: "Llama 4 Maverick" },
      { id: "Qwen3-235B", label: "Qwen3 235B" },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    settingsKey: "groqApiKey",
    capabilityScore: 7,
    thinkingScore: 7,
    speedScore: 10,
    contextWindow: 131_072,
    maxOutput: 32_768,
    rpm: 30,
    priority: { architect: 4, frontend: 1, backend: 4, verify: 4, review: 4 },
    models: [
      { id: "llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout" },
      { id: "qwen-qwq-32b", label: "Qwen QwQ 32B" },
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    ],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    settingsKey: "cerebrasApiKey",
    capabilityScore: 7,
    thinkingScore: 6,
    speedScore: 10,
    contextWindow: 128_000,
    maxOutput: 32_768,
    rpm: 30,
    priority: { architect: 5, frontend: 3, backend: 5, verify: 5, review: 5 },
    models: [
      { id: "gpt-oss-120b", label: "GPT-OSS 120B" },
      { id: "llama-4-scout-17b", label: "Llama 4 Scout (Cerebras)" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    settingsKey: "openrouterApiKey",
    capabilityScore: 8,
    thinkingScore: 9,
    speedScore: 5,
    contextWindow: 128_000,
    maxOutput: 32_768,
    rpm: 20,
    priority: { architect: 3, frontend: 4, backend: 3, verify: 3, review: 3 },
    models: [
      { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1 (free)" },
      { id: "qwen/qwen3-235b-a22b:free", label: "Qwen3 235B (free)" },
    ],
  },
  {
    id: "github",
    name: "GitHub Models",
    baseUrl: "https://models.inference.ai.azure.com",
    settingsKey: "githubToken",
    capabilityScore: 7,
    thinkingScore: 7,
    speedScore: 7,
    contextWindow: 128_000,
    maxOutput: 16_384,
    rpm: 10,
    priority: { architect: 6, frontend: 5, backend: 6, verify: 6, review: 6 },
    models: [
      { id: "gpt-4o", label: "GPT-4o (GitHub)" },
      { id: "Phi-4", label: "Phi-4 (GitHub)" },
    ],
  },
  {
    id: "huggingface",
    name: "HuggingFace",
    baseUrl: "https://api-inference.huggingface.co/v1",
    settingsKey: "huggingfaceApiKey",
    capabilityScore: 7,
    thinkingScore: 8,
    speedScore: 4,
    contextWindow: 40_960,
    maxOutput: 8_192,
    rpm: 10,
    priority: { architect: 7, frontend: 6, backend: 7, verify: 7, review: 7 },
    models: [{ id: "Qwen/Qwen3-235B-A22B", label: "Qwen3 235B (HF)" }],
  },
];

/** Look up a provider definition by its id. Throws if unknown (programmer error). */
export function getProviderById(id: string): ProviderDef {
  const found = PROVIDERS.find((p) => p.id === id);
  if (!found) {
    throw new Error(`Unknown provider id: ${id}`);
  }
  return found;
}
