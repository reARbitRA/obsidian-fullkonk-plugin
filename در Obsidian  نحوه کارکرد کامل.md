

---

## تفاوت اصلی با نسخه وب

```
konkred.xyz:
  Express server   → API calls از سرور
  React UI         → در مرورگر
  Firebase         → ذخیره‌سازی cloud
  SSE از سرور      → stream به client

Obsidian Plugin:
  بدون سرور        → API calls مستقیم از plugin
  Obsidian API UI  → ItemView و WorkspaceLeaf
  Vault files      → ذخیره‌سازی local .md
  requestUrl       → جایگزین fetch (cross-platform)
  isDesktopOnly: false → هم PC هم Android
```

---

## ساختار فایل پلاگین

```
fullkonk-obsidian/
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── src/
│   ├── main.ts              ← entry point
│   ├── types.ts             ← shared types
│   ├── orchestrator.ts      ← provider routing + failover
│   ├── pipeline.ts          ← 3-stage pipeline
│   ├── templates.ts         ← system prompts + showcase
│   ├── vault.ts             ← vault read/write
│   ├── settings.ts          ← settings tab
│   ├── view.ts              ← main WorkspaceLeaf view
│   └── styles.css
```

---

## فایل‌های کامل

### `manifest.json`

```json
{
  "id":             "fullkonk",
  "name":           "fullKONK_>",
  "version":        "1.0.0",
  "minAppVersion":  "1.4.0",
  "description":    "Full-stack AI product builder inside Obsidian. Powered by konkred.xyz",
  "author":         "konkred.xyz",
  "authorUrl":      "https://konkred.xyz",
  "isDesktopOnly":  false
}
```

---

### `src/types.ts`

```typescript
// src/types.ts

export type BuildMode =
  | 'fullstack'
  | 'frontend'
  | 'backend'
  | 'review';

export type PipelineStage =
  | 'idle'
  | 'architect'
  | 'frontend'
  | 'backend'
  | 'verify'
  | 'review'
  | 'done'
  | 'error';

export type ProviderID =
  | 'groq'
  | 'deepseek'
  | 'cerebras'
  | 'sambanova'
  | 'openrouter'
  | 'gemini'
  | 'nvidia'
  | 'github'
  | 'huggingface';

export interface ProviderDef {
  id:              ProviderID;
  name:            string;
  baseUrl:         string;
  settingsKey:     keyof FullKonkSettings;
  models:          ModelDef[];
  priority:        Record<string, number>;
  capabilityScore: number;
  thinkingScore:   number;
  speedScore:      number;
  contextWindow:   number;
  maxOutput:       number;
  rpm:             number;
}

export interface ModelDef {
  id:    string;
  label: string;
}

export interface FKMessage {
  id:        string;
  role:      'user' | 'assistant';
  content:   string;
  stage?:    PipelineStage;
  provider?: string;
  timestamp: number;
}

export interface GeneratedFile {
  path:     string;
  content:  string;
  language: string;
}

export interface StreamChunk {
  type:        'stage' | 'delta' | 'provider' | 'failover' | 'metrics' | 'done' | 'error';
  stage?:      PipelineStage;
  content?:    string;
  provider?:   string;
  model?:      string;
  from?:       string;
  tps?:        number;
  totalTokens?:number;
  error?:      string;
}

export interface FullKonkSettings {
  // Provider API keys
  groqApiKey:        string;
  deepseekApiKey:    string;
  cerebrasApiKey:    string;
  sambanovaApiKey:   string;
  openrouterApiKey:  string;
  geminiApiKey:      string;
  nvidiaApiKey:      string;
  githubToken:       string;
  huggingfaceApiKey: string;

  // Defaults
  defaultMode:       BuildMode;
  defaultProvider:   string;
  temperature:       number;
  maxTokens:         number;

  // Vault
  outputFolder:      string;  // where to save generated files
  saveHistory:       boolean; // save chat history as markdown
}

export const DEFAULT_SETTINGS: FullKonkSettings = {
  groqApiKey:        '',
  deepseekApiKey:    '',
  cerebrasApiKey:    '',
  sambanovaApiKey:   '',
  openrouterApiKey:  '',
  geminiApiKey:      '',
  nvidiaApiKey:      '',
  githubToken:       '',
  huggingfaceApiKey: '',
  defaultMode:       'fullstack',
  defaultProvider:   'auto',
  temperature:       0.3,
  maxTokens:         8192,
  outputFolder:      'fullKONK',
  saveHistory:       true,
};
```

---

### `src/orchestrator.ts`

```typescript
// src/orchestrator.ts

import { requestUrl, RequestUrlParam } from 'obsidian';
import { ProviderDef, FullKonkSettings, BuildMode } from './types';

// ─── PROVIDER REGISTRY ───────────────────────────────────────────────────────

export const PROVIDERS: ProviderDef[] = [
  {
    id:              'gemini',
    name:            'Google Gemini',
    baseUrl:         'https://generativelanguage.googleapis.com/v1beta/openai',
    settingsKey:     'geminiApiKey',
    capabilityScore: 10,
    thinkingScore:   9,
    speedScore:      6,
    contextWindow:   1_000_000,
    maxOutput:       65_536,
    rpm:             10,
    priority: { architect: 1, frontend: 2, backend: 2, verify: 1, review: 1 },
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro'   },
    ],
  },
  {
    id:              'deepseek',
    name:            'DeepSeek',
    baseUrl:         'https://api.deepseek.com/v1',
    settingsKey:     'deepseekApiKey',
    capabilityScore: 9,
    thinkingScore:   10,
    speedScore:      5,
    contextWindow:   128_000,
    maxOutput:       32_768,
    rpm:             60,
    priority: { architect: 2, frontend: 3, backend: 1, verify: 2, review: 2 },
    models: [
      { id: 'deepseek-reasoner', label: 'DeepSeek R1'  },
      { id: 'deepseek-chat',     label: 'DeepSeek V3'  },
    ],
  },
  {
    id:              'nvidia',
    name:            'NVIDIA NIM',
    baseUrl:         'https://integrate.api.nvidia.com/v1',
    settingsKey:     'nvidiaApiKey',
    capabilityScore: 9,
    thinkingScore:   10,
    speedScore:      7,
    contextWindow:   128_000,
    maxOutput:       32_768,
    rpm:             40,
    priority: { architect: 2, frontend: 3, backend: 1, verify: 2, review: 2 },
    models: [
      { id: 'deepseek-ai/deepseek-r1',          label: 'DeepSeek R1 (NVIDIA)'  },
      { id: 'meta/llama-3.3-70b-instruct',      label: 'Llama 3.3 70B (NVIDIA)'},
    ],
  },
  {
    id:              'sambanova',
    name:            'SambaNova',
    baseUrl:         'https://api.sambanova.ai/v1',
    settingsKey:     'sambanovaApiKey',
    capabilityScore: 8,
    thinkingScore:   9,
    speedScore:      10,
    contextWindow:   131_072,
    maxOutput:       16_384,
    rpm:             30,
    priority: { architect: 3, frontend: 2, backend: 3, verify: 3, review: 3 },
    models: [
      { id: 'DeepSeek-R1',                          label: 'DeepSeek R1 (SambaNova)'  },
      { id: 'Llama-4-Maverick-17B-128E-Instruct',   label: 'Llama 4 Maverick'         },
      { id: 'Qwen3-235B',                           label: 'Qwen3 235B'               },
    ],
  },
  {
    id:              'groq',
    name:            'Groq',
    baseUrl:         'https://api.groq.com/openai/v1',
    settingsKey:     'groqApiKey',
    capabilityScore: 7,
    thinkingScore:   7,
    speedScore:      10,
    contextWindow:   131_072,
    maxOutput:       32_768,
    rpm:             30,
    priority: { architect: 4, frontend: 1, backend: 4, verify: 4, review: 4 },
    models: [
      { id: 'llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout' },
      { id: 'qwen-qwq-32b',                  label: 'Qwen QwQ 32B'  },
      { id: 'llama-3.3-70b-versatile',       label: 'Llama 3.3 70B' },
    ],
  },
  {
    id:              'cerebras',
    name:            'Cerebras',
    baseUrl:         'https://api.cerebras.ai/v1',
    settingsKey:     'cerebrasApiKey',
    capabilityScore: 7,
    thinkingScore:   6,
    speedScore:      10,
    contextWindow:   128_000,
    maxOutput:       32_768,
    rpm:             30,
    priority: { architect: 5, frontend: 3, backend: 5, verify: 5, review: 5 },
    models: [
      { id: 'gpt-oss-120b',      label: 'GPT-OSS 120B' },
      { id: 'llama-4-scout-17b', label: 'Llama 4 Scout (Cerebras)' },
    ],
  },
  {
    id:              'openrouter',
    name:            'OpenRouter',
    baseUrl:         'https://openrouter.ai/api/v1',
    settingsKey:     'openrouterApiKey',
    capabilityScore: 8,
    thinkingScore:   9,
    speedScore:      5,
    contextWindow:   128_000,
    maxOutput:       32_768,
    rpm:             20,
    priority: { architect: 3, frontend: 4, backend: 3, verify: 3, review: 3 },
    models: [
      { id: 'deepseek/deepseek-r1:free',    label: 'DeepSeek R1 (free)' },
      { id: 'qwen/qwen3-235b-a22b:free',    label: 'Qwen3 235B (free)'  },
    ],
  },
  {
    id:              'github',
    name:            'GitHub Models',
    baseUrl:         'https://models.inference.ai.azure.com',
    settingsKey:     'githubToken',
    capabilityScore: 7,
    thinkingScore:   7,
    speedScore:      7,
    contextWindow:   128_000,
    maxOutput:       16_384,
    rpm:             10,
    priority: { architect: 6, frontend: 5, backend: 6, verify: 6, review: 6 },
    models: [
      { id: 'gpt-4o',             label: 'GPT-4o (GitHub)'       },
      { id: 'Phi-4',              label: 'Phi-4 (GitHub)'         },
    ],
  },
  {
    id:              'huggingface',
    name:            'HuggingFace',
    baseUrl:         'https://api-inference.huggingface.co/v1',
    settingsKey:     'huggingfaceApiKey',
    capabilityScore: 7,
    thinkingScore:   8,
    speedScore:      4,
    contextWindow:   40_960,
    maxOutput:       8_192,
    rpm:             10,
    priority: { architect: 7, frontend: 6, backend: 7, verify: 7, review: 7 },
    models: [
      { id: 'Qwen/Qwen3-235B-A22B',        label: 'Qwen3 235B (HF)' },
    ],
  },
];

// ─── RATE LIMIT STORE ────────────────────────────────────────────────────────

interface Penalty {
  until:    number;
  failures: number;
}

const penalties = new Map<string, Penalty>();

function modelKey(p: ProviderDef, modelId: string): string {
  return `${p.id}::${modelId}`;
}

function isAvailable(p: ProviderDef, modelId: string): boolean {
  const entry = penalties.get(modelKey(p, modelId));
  if (!entry) return true;
  if (Date.now() > entry.until) { penalties.delete(modelKey(p, modelId)); return true; }
  return false;
}

function penalize(p: ProviderDef, modelId: string, type: 'rate' | 'error'): void {
  const key      = modelKey(p, modelId);
  const existing = penalties.get(key);
  const n        = (existing?.failures ?? 0) + 1;
  const ms       = type === 'rate'
    ? Math.min(60_000 * Math.pow(2, n - 1), 900_000)
    : Math.min(30_000 * Math.pow(2, n - 1), 300_000);
  penalties.set(key, { until: Date.now() + ms, failures: n });
}

function reward(p: ProviderDef, modelId: string): void {
  penalties.delete(modelKey(p, modelId));
}

// ─── SCORING ──────────────────────────────────────────────────────────────────

type Task = 'architect' | 'frontend' | 'backend' | 'verify' | 'review';

const WEIGHTS: Record<Task, { cap: number; think: number; speed: number }> = {
  architect: { cap: .4, think: .4, speed: .2 },
  frontend:  { cap: .5, think: .2, speed: .3 },
  backend:   { cap: .5, think: .3, speed: .2 },
  verify:    { cap: .4, think: .4, speed: .2 },
  review:    { cap: .4, think: .4, speed: .2 },
};

function score(p: ProviderDef, task: Task): number {
  const w = WEIGHTS[task];
  return p.capabilityScore * w.cap + p.thinkingScore * w.think + p.speedScore * w.speed;
}

// ─── CANDIDATE BUILDER ───────────────────────────────────────────────────────

export interface Candidate {
  provider: ProviderDef;
  model:    ModelDef;
  score:    number;
}

export function buildCandidates(settings: FullKonkSettings, task: Task): Candidate[] {
  const out: Candidate[] = [];

  for (const p of PROVIDERS) {
    const apiKey = (settings as any)[p.settingsKey] as string;
    if (!apiKey?.trim()) continue;

    for (const m of p.models) {
      if (!isAvailable(p, m.id)) continue;
      out.push({ provider: p, model: m, score: score(p, task) });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

// ─── STREAM ONE MODEL ────────────────────────────────────────────────────────
// Obsidian uses requestUrl (works on Android too)
// requestUrl does NOT support streaming, so we use fetch directly
// On Android, fetch is available in the WebView JS context

export interface Callbacks {
  onChunk:    (text: string) => void;
  onProvider: (name: string, model: string) => void;
  onFailover: (from: string, to: string) => void;
  onMetrics:  (tps: number, total: number) => void;
}

async function streamCandidate(
  c:        Candidate,
  messages: { role: string; content: string }[],
  temp:     number,
  maxTok:   number,
  settings: FullKonkSettings,
  cb:       Callbacks,
  signal?:  AbortSignal,
): Promise<string> {
  const apiKey = (settings as any)[c.provider.settingsKey] as string;

  // Use fetch for streaming (available on both desktop and Android Obsidian)
  const response = await fetch(`${c.provider.baseUrl}/chat/completions`, {
    method:  'POST',
    headers: {
      'Authorization':  `Bearer ${apiKey}`,
      'Content-Type':   'application/json',
      'HTTP-Referer':   'https://konkred.xyz',
      'X-Title':        'fullKONK_> Obsidian Plugin',
    },
    body: JSON.stringify({
      model:       c.model.id,
      messages,
      temperature: temp,
      max_tokens:  Math.min(maxTok, c.provider.maxOutput),
      stream:      true,
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    if (response.status === 429) {
      penalize(c.provider, c.model.id, 'rate');
      throw Object.assign(new Error('RATE_LIMITED'), { code: 429 });
    }
    penalize(c.provider, c.model.id, 'error');
    throw new Error(`${response.status}: ${errText.slice(0, 100)}`);
  }

  const reader  = response.body!.getReader();
  const decoder = new TextDecoder();
  let   full    = '';
  let   tokens  = 0;
  let   lastAt  = Date.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const lines = decoder.decode(value, { stream: true }).split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { continue; }
      const text = parsed.choices?.[0]?.delta?.content ?? '';
      if (text) {
        full   += text;
        tokens += Math.ceil(text.length / 4);
        cb.onChunk(text);
      }
      const now = Date.now();
      if (now - lastAt > 500) {
        cb.onMetrics(Math.round(tokens / ((now - lastAt) / 1000)), tokens);
        lastAt = now;
      }
    }
  }

  reward(c.provider, c.model.id);
  return full;
}

// ─── ORCHESTRATE ─────────────────────────────────────────────────────────────

export async function orchestrate(
  task:     Task,
  messages: { role: string; content: string }[],
  settings: FullKonkSettings,
  cb:       Callbacks,
  signal?:  AbortSignal,
): Promise<string> {
  const candidates = buildCandidates(settings, task);

  if (candidates.length === 0) {
    throw new Error(
      'No API keys configured. Open fullKONK_> settings and add at least one API key.'
    );
  }

  let lastErr = '';

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    cb.onProvider(c.provider.name, c.model.label);

    if (i > 0) {
      cb.onFailover(
        `${candidates[i - 1].provider.name} / ${candidates[i - 1].model.label}`,
        `${c.provider.name} / ${c.model.label}`,
      );
    }

    try {
      const result = await streamCandidate(
        c, messages,
        settings.temperature,
        settings.maxTokens,
        settings,
        cb,
        signal,
      );
      if (!result.trim()) {
        penalize(c.provider, c.model.id, 'error');
        lastErr = 'Empty response';
        continue;
      }
      return result;
    } catch (err: any) {
      if (signal?.aborted) throw err;
      lastErr = err?.message ?? 'Unknown';
      continue;
    }
  }

  throw new Error(`All providers failed. Last error: ${lastErr}`);
}
```

---

### `src/templates.ts`

```typescript
// src/templates.ts

export const SYSTEM_PROMPTS = {

  architect: `You are a senior software architect.
Given a product idea, design the complete system before any code is written.

Output this structure exactly:

## OVERVIEW
## TECH STACK (specific versions)
## COMPONENT TREE (ASCII)
## API CONTRACT (every endpoint: method, path, request, response)
## DATABASE SCHEMA (complete)
## FILE STRUCTURE (complete tree)
## KEY DECISIONS

Be specific. No vague answers. Output the plan only — no code yet.`,

  frontend: `You are a senior frontend engineer.
Write complete, production-ready React TypeScript code.

Stack: React 19, TypeScript strict, Tailwind CSS, Framer Motion.
Rules:
- Complete files only — no truncation, no ellipsis
- Every component fully typed
- All errors handled with user feedback
- Responsive and accessible
- Mark each file with its path as a comment on line one: // path/to/File.tsx`,

  backend: `You are a senior backend engineer.
Write complete, production-ready TypeScript server code.

Stack: Express 5, TypeScript strict, Zod validation.
Rules:
- Validate ALL inputs with Zod before processing
- Return consistent shape: { data?, error?, message? }
- Handle all errors with correct HTTP status codes
- Mark each file with its path as a comment on line one: // path/to/file.ts`,

  verify: `You are a principal engineer doing integration review.

Check:
1. API call signatures in frontend match route definitions in backend
2. TypeScript types consistent across both
3. All imports reference files that exist
4. Auth tokens attached to all authenticated requests
5. Field name consistency (no camelCase vs snake_case drift)

List every issue found.
Output corrected complete files for everything broken.
Mark each file with path comment on line one.`,

};

export interface ShowcaseTemplate {
  id:          string;
  name:        string;
  tag:         string;
  description: string;
  accent:      string;
  prompt:      string;
}

export const SHOWCASE_TEMPLATES: ShowcaseTemplate[] = [
  {
    id:          'prompt-autopsy',
    name:        'Prompt Autopsy',
    tag:         'AI TOOLS',
    description: 'Dissect any prompt. Score it. Rewrite it.',
    accent:      '#FF003C',
    prompt:      `Build Prompt Autopsy: takes any AI prompt as input and returns scored analysis on 6 dimensions: role definition, output format, edge case handling, constraint clarity, few-shot examples, tone. Show failure vectors — specific ways this prompt will break. Generate improved version. Send to 3 providers and compare outputs. Stack: React 19, Express 5.`,
  },
  {
    id:          'git-archaeologist',
    name:        'Git Archaeologist',
    tag:         'DEV TOOLS',
    description: 'Map the hidden history of any codebase.',
    accent:      '#FFD700',
    prompt:      `Build Git Archaeologist: accepts GitHub repo URL and token. Fetch commit history via GitHub API. Identify: zombie code untouched 6+ months, ghost owners who left, bug attractor files with most patches, velocity map by directory. Visualize with D3 heat map. Export report. Stack: React 19, Express 5.`,
  },
  {
    id:          'chaos-merchant',
    name:        'Chaos Merchant',
    tag:         'TESTING',
    description: 'Break your system before production does.',
    accent:      '#FF6B00',
    prompt:      `Build Chaos Merchant: accepts API base URL. Runs 4 chaos campaigns: payload flood to find breaking point, malformed input barrage to find unhandled exceptions, latency injection, memory pressure test. Real-time dashboard showing live metrics during attack. Stack: React 19, Express 5.`,
  },
  {
    id:          'contract-ghost',
    name:        'Contract Ghost',
    tag:         'CODE GEN',
    description: 'Any API docs → full TypeScript client instantly.',
    accent:      '#9B00FF',
    prompt:      `Build Contract Ghost: accepts any API documentation URL. Scrapes and parses docs. Generates: full TypeScript client class, Zod schemas for every endpoint, realistic mock data, error handler classes, TypeScript interfaces. Display as file tree. Stack: React 19, Express 5.`,
  },
  {
    id:          'interrogator',
    name:        'The Interrogator',
    tag:         'HIRING',
    description: 'Technical interviews that test real depth.',
    accent:      '#00FF88',
    prompt:      `Build The Interrogator: user specifies role and stack. AI generates adaptive interview questions with follow-ups. Real-time scoring on 5 dimensions. Session ends with detailed report: strengths, weaknesses, study plan. Export PDF. Stack: React 19, Express 5.`,
  },
  {
    id:          'signal-noise',
    name:        'Signal / Noise',
    tag:         'PRODUCTIVITY',
    description: 'Your personal dev news filter. Zero noise.',
    accent:      '#00DDFF',
    prompt:      `Build Signal/Noise: user defines their stack. Aggregate from Hacker News API, GitHub trending, Reddit r/programming, npm releases. Score each item for stack relevance. Show only relevant items tiered as critical, important, fyi. Refresh every 6 hours. Stack: React 19, Express 5.`,
  },
];
```

---

### `src/vault.ts`

```typescript
// src/vault.ts

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { GeneratedFile, FKMessage, BuildMode } from './types';

export class VaultManager {
  constructor(private app: App, private outputFolder: string) {}

  // ─── Ensure folder exists ──────────────────────────────────────────────────

  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!this.app.vault.getAbstractFileByPath(normalized)) {
      await this.app.vault.createFolder(normalized);
    }
  }

  // ─── Save generated files to vault ────────────────────────────────────────

  async saveGeneratedFiles(
    projectName: string,
    files:       GeneratedFile[],
  ): Promise<string> {
    const safeName  = projectName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const folder    = normalizePath(`${this.outputFolder}/${safeName}-${timestamp}`);

    await this.ensureFolder(this.outputFolder);
    await this.ensureFolder(folder);

    for (const file of files) {
      const filePath = normalizePath(`${folder}/${file.path}`);
      // Ensure parent directory
      const parts   = file.path.split('/');
      if (parts.length > 1) {
        const parentDir = normalizePath(`${folder}/${parts.slice(0, -1).join('/')}`);
        await this.ensureFolder(parentDir);
      }
      const existing = this.app.vault.getAbstractFileByPath(filePath);
      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, file.content);
      } else {
        await this.app.vault.create(filePath, file.content);
      }
    }

    // Create index file
    const indexPath    = normalizePath(`${folder}/README.md`);
    const indexContent = this.buildReadme(projectName, files, timestamp);
    await this.app.vault.create(indexPath, indexContent);

    return folder;
  }

  // ─── Save chat history ────────────────────────────────────────────────────

  async saveChatHistory(
    projectName: string,
    messages:    FKMessage[],
    mode:        BuildMode,
    provider:    string,
  ): Promise<void> {
    const safeName  = projectName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const folder    = normalizePath(`${this.outputFolder}/history`);

    await this.ensureFolder(this.outputFolder);
    await this.ensureFolder(folder);

    const content = [
      `---`,
      `project: ${projectName}`,
      `mode: ${mode}`,
      `provider: ${provider}`,
      `date: ${timestamp}`,
      `tags: [fullkonk, ${mode}]`,
      `---`,
      '',
      `# fullKONK_> — ${projectName}`,
      '',
      ...messages.map(m => {
        const role = m.role === 'user' ? '**You**' : `**AI** (${m.stage ?? 'response'})`;
        return `### ${role}\n${m.content}\n`;
      }),
    ].join('\n');

    const path = normalizePath(`${folder}/${safeName}-${timestamp}.md`);
    await this.app.vault.create(path, content);
  }

  // ─── Read existing vault files as context ─────────────────────────────────

  async readFilesAsContext(paths: string[]): Promise<string> {
    const parts: string[] = [];
    for (const p of paths) {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(p));
      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        parts.push(`## File: ${p}\n\`\`\`\n${content}\n\`\`\``);
      }
    }
    return parts.join('\n\n');
  }

  // ─── List generated projects ──────────────────────────────────────────────

  async listProjects(): Promise<{ name: string; path: string; date: string }[]> {
    const folder = this.app.vault.getAbstractFileByPath(
      normalizePath(this.outputFolder)
    );
    if (!(folder instanceof TFolder)) return [];

    return folder.children
      .filter(f => f instanceof TFolder)
      .map(f => {
        const parts = f.name.split('-');
        const date  = parts.slice(-2).join(' ').replace(/-/g, ':');
        const name  = parts.slice(0, -2).join('-');
        return { name, path: f.path, date };
      })
      .reverse();
  }

  // ─── Build README ─────────────────────────────────────────────────────────

  private buildReadme(
    projectName: string,
    files:       GeneratedFile[],
    timestamp:   string,
  ): string {
    const fileList = files.map(f =>
      `- [[${f.path}]] (${f.language})`
    ).join('\n');

    return [
      `---`,
      `generated: ${timestamp}`,
      `tags: [fullkonk, generated]`,
      `---`,
      '',
      `# ${projectName}`,
      '',
      `Generated by **fullKONK_>** on konkred.xyz`,
      '',
      `## Files`,
      '',
      fileList,
    ].join('\n');
  }
}
```

---

### `src/settings.ts`

```typescript
// src/settings.ts

import { App, PluginSettingTab, Setting } from 'obsidian';
import type FullKonkPlugin                from './main';

export class FullKonkSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: FullKonkPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'fullKONK_> Settings' });
    containerEl.createEl('p', {
      text: 'Add API keys for the providers you want to use. At least one key is required. The orchestrator automatically routes to the best available model.',
      cls: 'setting-item-description',
    });

    // ── API KEYS ──────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'API Keys — Priority Order' });

    const keyFields: { label: string; key: keyof import('./types').FullKonkSettings; desc: string; signup: string }[] = [
      { label: 'Google Gemini',  key: 'geminiApiKey',      desc: '1M context, best reasoning. Free at aistudio.google.com',   signup: 'https://aistudio.google.com' },
      { label: 'DeepSeek',       key: 'deepseekApiKey',    desc: 'Best coding + R1 reasoning. Free at platform.deepseek.com', signup: 'https://platform.deepseek.com' },
      { label: 'NVIDIA NIM',     key: 'nvidiaApiKey',      desc: 'DeepSeek R1 on NVIDIA hardware. Free at build.nvidia.com',   signup: 'https://build.nvidia.com' },
      { label: 'SambaNova',      key: 'sambanovaApiKey',   desc: 'Fastest inference. Free at cloud.sambanova.ai',              signup: 'https://cloud.sambanova.ai' },
      { label: 'Groq',           key: 'groqApiKey',        desc: 'Fastest LPU inference. Free at console.groq.com',            signup: 'https://console.groq.com' },
      { label: 'Cerebras',       key: 'cerebrasApiKey',    desc: '1M tokens/day free. cloud.cerebras.ai',                      signup: 'https://cloud.cerebras.ai' },
      { label: 'OpenRouter',     key: 'openrouterApiKey',  desc: '20+ free models gateway. openrouter.ai',                     signup: 'https://openrouter.ai' },
      { label: 'GitHub Token',   key: 'githubToken',       desc: 'GPT-4o free via GitHub Models. github.com/marketplace/models', signup: 'https://github.com/settings/tokens' },
      { label: 'HuggingFace',    key: 'huggingfaceApiKey', desc: 'Qwen3 235B and more. huggingface.co',                        signup: 'https://huggingface.co/settings/tokens' },
    ];

    for (const field of keyFields) {
      new Setting(containerEl)
        .setName(field.label)
        .setDesc(`${field.desc} → ${field.signup}`)
        .addText(text => text
          .setPlaceholder('Paste API key here...')
          .setValue((this.plugin.settings as any)[field.key])
          .onChange(async value => {
            (this.plugin.settings as any)[field.key] = value.trim();
            await this.plugin.saveSettings();
          })
        );
    }

    // ── DEFAULTS ─────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'Defaults' });

    new Setting(containerEl)
      .setName('Default Mode')
      .setDesc('Which pipeline mode to use by default')
      .addDropdown(dd => dd
        .addOption('fullstack', 'Full-Stack')
        .addOption('frontend',  'Frontend only')
        .addOption('backend',   'Backend only')
        .addOption('review',    'Code Review')
        .setValue(this.plugin.settings.defaultMode)
        .onChange(async value => {
          this.plugin.settings.defaultMode = value as any;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Temperature')
      .setDesc('0 = deterministic, 1 = creative')
      .addSlider(sl => sl
        .setLimits(0, 1, 0.05)
        .setValue(this.plugin.settings.temperature)
        .setDynamicTooltip()
        .onChange(async value => {
          this.plugin.settings.temperature = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Max Output Tokens')
      .setDesc('Maximum tokens per generation stage')
      .addSlider(sl => sl
        .setLimits(1024, 16384, 512)
        .setValue(this.plugin.settings.maxTokens)
        .setDynamicTooltip()
        .onChange(async value => {
          this.plugin.settings.maxTokens = value;
          await this.plugin.saveSettings();
        })
      );

    // ── VAULT ─────────────────────────────────────────────────────────────

    containerEl.createEl('h3', { text: 'Vault' });

    new Setting(containerEl)
      .setName('Output Folder')
      .setDesc('Where generated files are saved in your vault')
      .addText(text => text
        .setPlaceholder('fullKONK')
        .setValue(this.plugin.settings.outputFolder)
        .onChange(async value => {
          this.plugin.settings.outputFolder = value.trim() || 'fullKONK';
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Save Chat History')
      .setDesc('Save each session as a Markdown file in the vault')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.saveHistory)
        .onChange(async value => {
          this.plugin.settings.saveHistory = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
```

---

### `src/view.ts`

```typescript
// src/view.ts

import {
  ItemView,
  WorkspaceLeaf,
  Notice,
} from 'obsidian';
import type FullKonkPlugin     from './main';
import { orchestrate }          from './orchestrator';
import { SYSTEM_PROMPTS, SHOWCASE_TEMPLATES, ShowcaseTemplate } from './templates';
import { VaultManager }         from './vault';
import { FKMessage, GeneratedFile, BuildMode, PipelineStage } from './types';

export const FK_VIEW_TYPE = 'fullkonk-view';

const MODES: { id: BuildMode; label: string }[] = [
  { id: 'fullstack', label: '⬡ FULL-STACK' },
  { id: 'frontend',  label: '◈ FRONTEND'   },
  { id: 'backend',   label: '⬢ BACKEND'    },
  { id: 'review',    label: '◎ REVIEW'     },
];

const STAGE_ORDER = ['architect', 'frontend', 'backend', 'verify', 'done'];

export class FullKonkView extends ItemView {
  private plugin:      FullKonkPlugin;
  private vault:       VaultManager;
  private messages:    FKMessage[]      = [];
  private files:       GeneratedFile[]  = [];
  private mode:        BuildMode        = 'fullstack';
  private stage:       PipelineStage    = 'idle';
  private streaming:   boolean          = false;
  private activeFile:  string | null    = null;
  private liveProvider = '';
  private liveModel    = '';
  private liveTokens   = 0;
  private liveTps      = 0;
  private abortCtrl:   AbortController | null = null;

  // DOM refs
  private chatEl:      HTMLElement | null = null;
  private inputEl:     HTMLTextAreaElement | null = null;
  private codeTabsEl:  HTMLElement | null = null;
  private codeBodyEl:  HTMLElement | null = null;
  private stageBarEl:  HTMLElement | null = null;
  private sendBtnEl:   HTMLButtonElement | null = null;
  private statusEl:    HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: FullKonkPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.mode   = plugin.settings.defaultMode;
    this.vault  = new VaultManager(plugin.app, plugin.settings.outputFolder);
  }

  getViewType()    { return FK_VIEW_TYPE; }
  getDisplayText() { return 'fullKONK_>'; }
  getIcon()        { return 'zap'; }

  // ─── RENDER ────────────────────────────────────────────────────────────────

  async onOpen() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('fk-root');
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#000;color:#fff;font-family:"Space Grotesk",sans-serif;';

    this.buildTopBar(root);
    this.buildStageBar(root);
    this.buildMainArea(root);
    this.injectStyles();
  }

  async onClose() {
    this.abortCtrl?.abort();
  }

  // ─── TOP BAR ──────────────────────────────────────────────────────────────

  private buildTopBar(root: HTMLElement) {
    const bar = root.createDiv({ cls: 'fk-topbar' });
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:0 12px;height:48px;background:#000;border-bottom:2px solid #111;flex-shrink:0;flex-wrap:wrap;';

    // Brand
    const brand = bar.createDiv();
    brand.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:13px;font-weight:700;color:#FFD700;letter-spacing:3px;margin-right:auto;';
    brand.setText('fullKONK_>');

    // Mode buttons
    const modeWrap = bar.createDiv();
    modeWrap.style.cssText = 'display:flex;';
    MODES.forEach((m, i) => {
      const btn = modeWrap.createEl('button');
      btn.setText(m.label);
      btn.style.cssText = `padding:3px 10px;background:${this.mode === m.id ? '#FFD700' : 'transparent'};border:1px solid ${this.mode === m.id ? '#FFD700' : '#222'};${i < MODES.length - 1 ? 'border-right:none;' : ''}color:${this.mode === m.id ? '#000' : '#444'};font-family:"JetBrains Mono",monospace;font-size:8px;font-weight:700;letter-spacing:2px;cursor:pointer;`;
      btn.onclick = () => {
        if (this.streaming) return;
        this.mode = m.id;
        this.buildTopBar(root); // re-render
      };
    });

    // Save button
    const saveBtn = bar.createEl('button');
    saveBtn.setText('↓ SAVE');
    saveBtn.style.cssText = 'padding:3px 10px;background:none;border:1px solid #222;color:#555;font-family:"JetBrains Mono",monospace;font-size:8px;font-weight:700;letter-spacing:2px;cursor:pointer;';
    saveBtn.onclick = () => this.saveToVault();
  }

  // ─── STAGE BAR ────────────────────────────────────────────────────────────

  private buildStageBar(root: HTMLElement) {
    this.stageBarEl = root.createDiv({ cls: 'fk-stagebar' });
    this.stageBarEl.style.cssText = 'background:#040404;border-bottom:1px solid #111;flex-shrink:0;display:none;';
    this.renderStageBar();
  }

  private renderStageBar() {
    if (!this.stageBarEl) return;
    if (this.stage === 'idle') {
      this.stageBarEl.style.display = 'none';
      return;
    }
    this.stageBarEl.style.display = 'block';
    this.stageBarEl.empty();

    const inner = this.stageBarEl.createDiv();
    inner.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 14px;flex-wrap:wrap;';

    // Stage indicators
    const stages = this.mode === 'review'
      ? [{ id: 'review', label: 'REVIEW' }, { id: 'done', label: 'DONE' }]
      : [
          { id: 'architect', label: 'ARCH'     },
          { id: 'frontend',  label: 'FRONT'    },
          { id: 'backend',   label: 'BACK'     },
          { id: 'verify',    label: 'VERIFY'   },
          { id: 'done',      label: 'DONE'     },
        ];

    const currentIdx = STAGE_ORDER.indexOf(this.stage);
    stages.forEach((s, i) => {
      const idx   = STAGE_ORDER.indexOf(s.id);
      const done  = currentIdx > idx;
      const act   = this.stage === s.id;
      const color = done ? '#00FF88' : act ? '#FFD700' : '#2a2a2a';

      const stageEl = inner.createDiv();
      stageEl.style.cssText = `display:flex;align-items:center;gap:4px;font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:1px;color:${color};`;

      const box = stageEl.createDiv();
      box.style.cssText = `width:14px;height:14px;border:1px solid ${color};display:flex;align-items:center;justify-content:center;font-size:7px;`;
      box.setText(done ? '✓' : String(i + 1));

      stageEl.createSpan({ text: s.label });

      if (i < stages.length - 1) {
        const sep = inner.createDiv();
        sep.style.cssText = `width:14px;height:1px;background:${done ? '#00FF88' : '#111'};`;
      }
    });

    // Provider + metrics
    if (this.liveProvider) {
      const meta = inner.createDiv();
      meta.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:8px;color:#FFD700;margin-left:8px;';
      meta.setText(`${this.liveProvider} / ${this.liveModel}`);
    }

    if (this.liveTokens > 0) {
      const metrics = inner.createDiv();
      metrics.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:8px;color:#333;margin-right:auto;';
      metrics.setText(`${this.liveTps} tok/s · ${this.liveTokens.toLocaleString()} tokens`);
    }

    // Stop
    if (this.streaming) {
      const stopBtn = inner.createEl('button');
      stopBtn.setText('■ STOP');
      stopBtn.style.cssText = 'background:#FF003C;border:none;color:#fff;font-family:"JetBrains Mono",monospace;font-size:8px;font-weight:700;letter-spacing:2px;padding:3px 10px;cursor:pointer;margin-left:auto;';
      stopBtn.onclick = () => this.stop();
    }
  }

  // ─── MAIN AREA ────────────────────────────────────────────────────────────

  private buildMainArea(root: HTMLElement) {
    const main = root.createDiv();
    main.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;flex:1;overflow:hidden;';

    this.buildChatPanel(main);
    this.buildCodePanel(main);
  }

  // ─── CHAT PANEL ───────────────────────────────────────────────────────────

  private buildChatPanel(parent: HTMLElement) {
    const panel = parent.createDiv();
    panel.style.cssText = 'display:flex;flex-direction:column;border-right:2px solid #111;overflow:hidden;background:#080808;';

    // Toolbar
    const toolbar = panel.createDiv();
    toolbar.style.cssText = 'display:flex;align-items:center;padding:6px 10px;border-bottom:1px solid #111;gap:6px;flex-shrink:0;';

    const label = toolbar.createDiv();
    label.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:3px;color:#2a2a2a;margin-right:auto;';
    label.setText('// TERMINAL');

    const clearBtn = toolbar.createEl('button');
    clearBtn.setText('✕ CLEAR');
    clearBtn.style.cssText = 'background:none;border:1px solid #1a1a1a;color:#444;padding:2px 8px;font-family:"JetBrains Mono",monospace;font-size:8px;cursor:pointer;letter-spacing:1px;';
    clearBtn.onclick = () => this.clear();

    // Showcase templates
    const tplWrap = panel.createDiv();
    tplWrap.style.cssText = 'padding:8px;border-bottom:1px solid #0d0d0d;display:flex;flex-wrap:wrap;gap:4px;flex-shrink:0;';
    const tplLabel = tplWrap.createDiv();
    tplLabel.style.cssText = 'width:100%;font-family:"JetBrains Mono",monospace;font-size:7px;color:#1a1a1a;letter-spacing:2px;margin-bottom:3px;';
    tplLabel.setText('// SHOWCASE TEMPLATES');
    SHOWCASE_TEMPLATES.forEach(tpl => {
      const btn = tplWrap.createEl('button');
      btn.setText(tpl.name);
      btn.style.cssText = `background:none;border:1px solid #1a1a1a;color:#444;padding:2px 7px;font-family:"JetBrains Mono",monospace;font-size:7px;cursor:pointer;letter-spacing:1px;transition:all .15s;`;
      btn.onmouseenter = () => { btn.style.borderColor = tpl.accent; btn.style.color = tpl.accent; };
      btn.onmouseleave = () => { btn.style.borderColor = '#1a1a1a'; btn.style.color = '#444'; };
      btn.onclick = () => {
        if (this.inputEl) {
          this.inputEl.value = tpl.prompt;
          this.inputEl.focus();
        }
      };
    });

    // Messages
    this.chatEl = panel.createDiv();
    this.chatEl.style.cssText = 'flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;';
    this.renderEmpty();

    // Input area
    const inputArea = panel.createDiv();
    inputArea.style.cssText = 'display:flex;gap:6px;padding:8px;border-top:1px solid #111;flex-shrink:0;background:#050505;';

    this.inputEl = inputArea.createEl('textarea');
    this.inputEl.placeholder = 'Describe what you want to build...';
    this.inputEl.rows = 2;
    this.inputEl.style.cssText = 'flex:1;background:#0d0d0d;border:1px solid #222;color:#fff;font-family:"Space Grotesk",sans-serif;font-size:12px;padding:6px 9px;outline:none;resize:none;line-height:1.5;';
    this.inputEl.onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    };

    this.sendBtnEl = inputArea.createEl('button');
    this.sendBtnEl.setText('BUILD →');
    this.sendBtnEl.style.cssText = 'background:#FFD700;border:none;color:#000;font-family:"JetBrains Mono",monospace;font-size:9px;font-weight:700;letter-spacing:2px;padding:6px 12px;cursor:pointer;align-self:flex-end;';
    this.sendBtnEl.onclick = () => this.send();
  }

  // ─── CODE PANEL ───────────────────────────────────────────────────────────

  private buildCodePanel(parent: HTMLElement) {
    const panel = parent.createDiv();
    panel.style.cssText = 'display:flex;flex-direction:column;overflow:hidden;background:#050505;';

    // Tabs row
    this.codeTabsEl = panel.createDiv();
    this.codeTabsEl.style.cssText = 'display:flex;overflow-x:auto;background:#030303;border-bottom:1px solid #0d0d0d;flex-shrink:0;min-height:30px;';

    // Actions
    const actBar = panel.createDiv();
    actBar.style.cssText = 'display:flex;gap:0;border-bottom:1px solid #080808;flex-shrink:0;';

    const copyBtn = actBar.createEl('button');
    copyBtn.setText('⎘ COPY');
    copyBtn.style.cssText = 'background:none;border:none;border-right:1px solid #0d0d0d;color:#444;padding:5px 12px;font-family:"JetBrains Mono",monospace;font-size:8px;cursor:pointer;letter-spacing:1px;';
    copyBtn.onclick = () => this.copyActiveFile();

    const saveBtn = actBar.createEl('button');
    saveBtn.setText('↓ SAVE ALL');
    saveBtn.style.cssText = 'background:none;border:none;color:#444;padding:5px 12px;font-family:"JetBrains Mono",monospace;font-size:8px;cursor:pointer;letter-spacing:1px;margin-left:auto;';
    saveBtn.onclick = () => this.saveToVault();

    // Code body
    this.codeBodyEl = panel.createDiv();
    this.codeBodyEl.style.cssText = 'flex:1;overflow:auto;';
    this.renderCodeBody();
  }

  // ─── RENDER HELPERS ───────────────────────────────────────────────────────

  private renderEmpty() {
    if (!this.chatEl) return;
    this.chatEl.empty();
    const empty = this.chatEl.createDiv();
    empty.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;opacity:.4;';
    const icon = empty.createDiv();
    icon.style.cssText = 'font-size:28px;';
    icon.setText('⚡');
    const title = empty.createDiv();
    title.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:14px;font-weight:700;color:#FFD700;letter-spacing:3px;';
    title.setText('fullKONK_>');
    const sub = empty.createDiv();
    sub.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:9px;color:#333;letter-spacing:1px;';
    sub.setText('DESCRIBE WHAT YOU WANT TO BUILD');
  }

  private appendMessage(msg: FKMessage) {
    if (!this.chatEl) return;
    if (this.messages.length === 1 && this.messages[0] === msg) {
      this.chatEl.empty(); // clear empty state
    }

    const el = this.chatEl.createDiv();
    el.setAttribute('data-id', msg.id);

    if (msg.role === 'user') {
      el.style.cssText = 'background:#111;border:1px solid #222;padding:8px 10px;font-size:12px;color:#fff;';
      el.setText(msg.content);
    } else {
      el.style.cssText = 'position:relative;background:#030f03;border:1px solid #0f200f;padding:8px 10px;';
      const badge = el.createDiv();
      badge.style.cssText = 'position:absolute;top:-7px;right:6px;background:#00FF88;color:#000;font-family:"JetBrains Mono",monospace;font-size:6px;font-weight:700;padding:1px 4px;letter-spacing:1px;';
      badge.setText(msg.stage?.toUpperCase() ?? 'AI');
      const pre = el.createEl('pre');
      pre.id = `fk-msg-${msg.id}`;
      pre.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:9px;color:#00FF88;line-height:1.7;white-space:pre-wrap;word-break:break-word;margin:0;';
      pre.setText(msg.content);
    }

    this.chatEl.scrollTop = this.chatEl.scrollHeight;
  }

  private appendChunkToLastMsg(text: string) {
    if (!this.chatEl) return;
    const last = this.messages[this.messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    const pre = this.chatEl.querySelector(`#fk-msg-${last.id}`) as HTMLElement;
    if (pre) {
      pre.setText(last.content);
    }
    this.chatEl.scrollTop = this.chatEl.scrollHeight;
  }

  private renderFileTabs() {
    if (!this.codeTabsEl) return;
    this.codeTabsEl.empty();
    this.files.forEach(f => {
      const tab = this.codeTabsEl!.createEl('button');
      const isAct = f.path === this.activeFile;
      tab.style.cssText = `display:flex;align-items:center;gap:4px;padding:5px 11px;border:none;border-right:1px solid #0d0d0d;border-bottom:${isAct ? '2px solid #FFD700' : '2px solid transparent'};background:${isAct ? '#050505' : 'transparent'};color:${isAct ? '#fff' : '#444'};font-family:"JetBrains Mono",monospace;font-size:8px;cursor:pointer;white-space:nowrap;flex-shrink:0;`;
      const dot = tab.createDiv();
      dot.style.cssText = 'width:4px;height:4px;background:#FFD700;flex-shrink:0;';
      tab.createSpan({ text: f.path.split('/').pop() ?? f.path });
      tab.onclick = () => {
        this.activeFile = f.path;
        this.renderFileTabs();
        this.renderCodeBody();
      };
    });
  }

  private renderCodeBody() {
    if (!this.codeBodyEl) return;
    this.codeBodyEl.empty();

    if (this.files.length === 0) {
      const empty = this.codeBodyEl.createDiv();
      empty.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;opacity:.3;font-family:"JetBrains Mono",monospace;font-size:11px;color:#333;letter-spacing:2px;';
      empty.setText(this.streaming ? 'GENERATING...' : 'OUTPUT APPEARS HERE');
      return;
    }

    const current = this.files.find(f => f.path === this.activeFile) ?? this.files[0];
    if (!current) return;

    const wrap = this.codeBodyEl.createDiv();
    wrap.style.cssText = 'display:flex;height:100%;';

    // Line numbers
    const nums = wrap.createDiv();
    nums.style.cssText = 'padding:12px 0;background:#030303;border-right:1px solid #0a0a0a;flex-shrink:0;user-select:none;';
    current.content.split('\n').forEach((_, i) => {
      const n = nums.createDiv();
      n.style.cssText = 'padding:0 9px;font-family:"JetBrains Mono",monospace;font-size:9px;line-height:1.7;color:#1a1a1a;text-align:right;min-width:32px;';
      n.setText(String(i + 1));
    });

    // Code
    const pre = wrap.createEl('pre');
    pre.style.cssText = 'margin:0;padding:12px 16px;font-family:"JetBrains Mono",monospace;font-size:9px;line-height:1.7;color:#ccc;white-space:pre;flex:1;min-width:0;';
    pre.setText(current.content);
  }

  // ─── PIPELINE ─────────────────────────────────────────────────────────────

  private async send() {
    if (!this.inputEl) return;
    const prompt = this.inputEl.value.trim();
    if (!prompt || this.streaming) return;

    this.inputEl.value = '';
    this.streaming     = true;
    this.files         = [];
    this.activeFile    = null;
    this.liveTokens    = 0;
    this.liveTps       = 0;

    if (this.sendBtnEl) {
      this.sendBtnEl.setText('■ STOP');
      this.sendBtnEl.style.background = '#FF003C';
      this.sendBtnEl.style.color      = '#fff';
      this.sendBtnEl.onclick = () => this.stop();
    }

    this.abortCtrl = new AbortController();

    // Add user message
    const userMsg: FKMessage = {
      id:        crypto.randomUUID(),
      role:      'user',
      content:   prompt,
      timestamp: Date.now(),
    };
    this.messages.push(userMsg);
    this.appendMessage(userMsg);

    const callbacks = {
      onChunk: (text: string) => {
        const last = this.messages[this.messages.length - 1];
        if (last?.role === 'assistant') {
          last.content += text;
          this.appendChunkToLastMsg(text);
          // Extract files
          const extracted = this.extractFiles(
            this.messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n')
          );
          if (extracted.length !== this.files.length || extracted.some((f, i) => f.content !== this.files[i]?.content)) {
            this.files = extracted;
            if (!this.activeFile && extracted[0]) this.activeFile = extracted[0].path;
            this.renderFileTabs();
            this.renderCodeBody();
          }
        }
      },
      onProvider: (prov: string, model: string) => {
        this.liveProvider = prov;
        this.liveModel    = model;
        this.renderStageBar();
      },
      onFailover: (from: string, to: string) => {
        new Notice(`fullKONK_>: ${from} rate limited → switching to ${to}`, 3000);
        this.renderStageBar();
      },
      onMetrics: (tps: number, total: number) => {
        this.liveTps    = tps;
        this.liveTokens = total;
        this.renderStageBar();
      },
    };

    const addAssistantMsg = (stage: PipelineStage) => {
      const msg: FKMessage = {
        id:        crypto.randomUUID(),
        role:      'assistant',
        content:   '',
        stage,
        timestamp: Date.now(),
      };
      this.messages.push(msg);
      this.appendMessage(msg);
      return msg;
    };

    try {
      if (this.mode === 'review') {
        this.setStage('review');
        addAssistantMsg('review');
        await orchestrate('review', [
          { role: 'system', content: SYSTEM_PROMPTS.verify },
          { role: 'user',   content: prompt },
        ], this.plugin.settings, callbacks, this.abortCtrl.signal);
        this.setStage('done');
        return;
      }

      // Stage 1 — Architect
      this.setStage('architect');
      addAssistantMsg('architect');
      let arch = '';
      await orchestrate('architect', [
        { role: 'system', content: SYSTEM_PROMPTS.architect },
        { role: 'user',   content: `Design architecture for: ${prompt}` },
      ], this.plugin.settings, {
        ...callbacks,
        onChunk: (t) => { arch += t; callbacks.onChunk(t); },
      }, this.abortCtrl.signal);

      if (this.abortCtrl.signal.aborted) return;

      if (this.mode === 'frontend' || this.mode === 'fullstack') {
        // Stage 2A — Frontend
        this.setStage('frontend');
        addAssistantMsg('frontend');
        let fe = '';
        await orchestrate('frontend', [
          { role: 'system', content: SYSTEM_PROMPTS.frontend },
          { role: 'user',   content: `Architecture:\n${arch}\n\nBuild complete frontend.` },
        ], this.plugin.settings, {
          ...callbacks,
          onChunk: (t) => { fe += t; callbacks.onChunk(t); },
        }, this.abortCtrl.signal);

        if (this.mode === 'fullstack' && !this.abortCtrl.signal.aborted) {
          // Stage 2B — Backend
          this.setStage('backend');
          addAssistantMsg('backend');
          let be = '';
          await orchestrate('backend', [
            { role: 'system', content: SYSTEM_PROMPTS.backend },
            { role: 'user',   content: `Architecture:\n${arch}\n\nFrontend built. Build complete backend.` },
          ], this.plugin.settings, {
            ...callbacks,
            onChunk: (t) => { be += t; callbacks.onChunk(t); },
          }, this.abortCtrl.signal);

          if (!this.abortCtrl.signal.aborted) {
            // Stage 3 — Verify
            this.setStage('verify');
            addAssistantMsg('verify');
            await orchestrate('verify', [
              { role: 'system', content: SYSTEM_PROMPTS.verify },
              { role: 'user',   content: `Architecture:\n${arch}\n\nFrontend:\n${fe}\n\nBackend:\n${be}\n\nVerify and fix integration.` },
            ], this.plugin.settings, callbacks, this.abortCtrl.signal);
          }
        }
      } else if (this.mode === 'backend') {
        this.setStage('backend');
        addAssistantMsg('backend');
        await orchestrate('backend', [
          { role: 'system', content: SYSTEM_PROMPTS.backend },
          { role: 'user',   content: `Architecture:\n${arch}\n\nBuild complete backend.` },
        ], this.plugin.settings, callbacks, this.abortCtrl.signal);
      }

      this.setStage('done');

      // Save to vault
      if (this.plugin.settings.saveHistory && this.messages.length > 0) {
        await this.vault.saveChatHistory(
          prompt.slice(0, 40),
          this.messages,
          this.mode,
          this.liveProvider,
        ).catch(() => {});
      }

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.setStage('error');
      new Notice(`fullKONK_>: ${err.message}`, 5000);
      const errMsg: FKMessage = {
        id:        crypto.randomUUID(),
        role:      'assistant',
        content:   `ERROR: ${err.message}`,
        stage:     'error',
        timestamp: Date.now(),
      };
      this.messages.push(errMsg);
      this.appendMessage(errMsg);
    } finally {
      this.streaming = false;
      if (this.sendBtnEl) {
        this.sendBtnEl.setText('BUILD →');
        this.sendBtnEl.style.background = '#FFD700';
        this.sendBtnEl.style.color      = '#000';
        this.sendBtnEl.onclick = () => this.send();
      }
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private setStage(stage: PipelineStage) {
    this.stage = stage;
    this.renderStageBar();
  }

  private stop() {
    this.abortCtrl?.abort();
    this.streaming = false;
    this.setStage('idle');
    if (this.sendBtnEl) {
      this.sendBtnEl.setText('BUILD →');
      this.sendBtnEl.style.background = '#FFD700';
      this.sendBtnEl.style.color      = '#000';
      this.sendBtnEl.onclick = () => this.send();
    }
  }

  private clear() {
    this.messages   = [];
    this.files      = [];
    this.activeFile = null;
    this.stage      = 'idle';
    this.renderEmpty();
    this.renderFileTabs();
    this.renderCodeBody();
    this.renderStageBar();
  }

  private extractFiles(content: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const re = /```(\w+)?\s*\n(?:\/\/\s*([\w/.\-]+)\n)?([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const lang = (m[1] || 'text').toLowerCase();
      const path = m[2]?.trim() || `output-${files.length + 1}.${lang}`;
      const code = m[3].trim();
      if (code.length > 30) {
        const idx = files.findIndex(f => f.path === path);
        if (idx >= 0) files[idx] = { path, content: code, language: lang };
        else files.push({ path, content: code, language: lang });
      }
    }
    return files;
  }

  private copyActiveFile() {
    const file = this.files.find(f => f.path === this.activeFile) ?? this.files[0];
    if (!file) return;
    navigator.clipboard.writeText(file.content).then(() => {
      new Notice('Copied to clipboard');
    }).catch(() => {});
  }

  private async saveToVault() {
    if (this.files.length === 0) {
      new Notice('No files to save yet.');
      return;
    }
    const prompt = this.messages.find(m => m.role === 'user')?.content ?? 'fullkonk-output';
    try {
      const folder = await this.vault.saveGeneratedFiles(prompt.slice(0, 40), this.files);
      new Notice(`Saved ${this.files.length} files to ${folder}`);
    } catch (err: any) {
      new Notice(`Save failed: ${err.message}`);
    }
  }

  private injectStyles() {
    const id = 'fk-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .fk-root * { box-sizing: border-box; }
      .fk-root button { transition: all .15s; }
      .fk-root textarea:focus { border-color: #FFD700 !important; }
      .fk-root pre { tab-size: 2; }
      .fk-root ::-webkit-scrollbar { width: 6px; height: 6px; }
      .fk-root ::-webkit-scrollbar-track { background: #000; }
      .fk-root ::-webkit-scrollbar-thumb { background: #1a1a1a; }
    `;
    document.head.appendChild(style);
  }
}
```

---

### `src/main.ts`

```typescript
// src/main.ts

import { Plugin, WorkspaceLeaf } from 'obsidian';
import { FullKonkView, FK_VIEW_TYPE } from './view';
import { FullKonkSettingsTab }         from './settings';
import { FullKonkSettings, DEFAULT_SETTINGS } from './types';

export default class FullKonkPlugin extends Plugin {
  settings!: FullKonkSettings;

  async onload() {
    await this.loadSettings();

    // Register view
    this.registerView(FK_VIEW_TYPE, leaf => new FullKonkView(leaf, this));

    // Ribbon icon
    this.addRibbonIcon('zap', 'fullKONK_>', () => this.activateView());

    // Command
    this.addCommand({
      id:       'open-fullkonk',
      name:     'Open fullKONK_>',
      callback: () => this.activateView(),
    });

    // Settings tab
    this.addSettingTab(new FullKonkSettingsTab(this.app, this));
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(FK_VIEW_TYPE);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;

    const existing = workspace.getLeavesOfType(FK_VIEW_TYPE);
    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: FK_VIEW_TYPE, active: true });
    }

    workspace.revealLeaf(leaf!);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

---

### `package.json`

```json
{
  "name":    "fullkonk-obsidian",
  "version": "1.0.0",
  "main":    "main.js",
  "scripts": {
    "dev":   "node esbuild.config.mjs",
    "build": "node esbuild.config.mjs production"
  },
  "devDependencies": {
    "@types/node":     "^20.0.0",
    "esbuild":         "^0.20.0",
    "obsidian":        "latest",
    "tslib":           "^2.6.0",
    "typescript":      "^5.3.0"
  }
}
```

---

### `esbuild.config.mjs`

```javascript
import esbuild from 'esbuild';
import process  from 'process';

const prod = process.argv[2] === 'production';

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle:       true,
  external:    ['obsidian', 'electron', 'codemirror', '@codemirror/*', '@lezer/*'],
  format:      'cjs',
  target:      'es2018',
  logLevel:    'info',
  sourcemap:    prod ? false : 'inline',
  treeShaking:  true,
  outfile:     'main.js',
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
```

---

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "baseUrl":         ".",
    "inlineSourceMap": true,
    "inlineSources":   true,
    "module":          "ESNext",
    "target":          "ES2018",
    "allowSyntheticDefaultImports": true,
    "moduleResolution": "bundler",
    "strict":          true,
    "noImplicitAny":   true,
    "esModuleInterop": true
  }
}
```

---

## نصب و راه‌اندازی

```bash
# ۱. کلون کن
git clone https://github.com/yourname/fullkonk-obsidian
cd fullkonk-obsidian

# ۲. نصب dependencies
npm install

# ۳. build
npm run build

# ۴. کپی به vault
mkdir -p /path/to/vault/.obsidian/plugins/fullkonk
cp main.js manifest.json /path/to/vault/.obsidian/plugins/fullkonk/

# ۵. Obsidian → Settings → Community Plugins → Enable fullKONK_>

# ۶. Settings → fullKONK_> → API keys اضافه کن
```

---

## مقایسه دقیق دو نسخه

```
                    KONKRED.XYZ          OBSIDIAN PLUGIN
─────────────────────────────────────────────────────────
API calls       Express → provider    Plugin → provider مستقیم
Storage         Firestore             Vault .md files
Auth            Firebase Auth         بدون auth (local)
UI              React 19 + Framer     Obsidian ItemView API
Streaming       SSE از server         fetch مستقیم از plugin
Preview         Sandpack (React)      بدون preview
Analytics       Firestore dashboard   بدون analytics
GitHub export   ✓ (از server)         ✓ (مستقیم از plugin)
Android         ✓                     ✓ (isDesktopOnly: false)
Offline         ✗                     ✓ (vault local است)
Vault context   ✗                     ✓ فایل‌های vault context
Collaboration   آینده                 ✗ (local only)
Monetization    Stripe                ✗ (رایگان open-source)
```