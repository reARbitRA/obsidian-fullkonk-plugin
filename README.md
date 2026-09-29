# fullKONK_> — Obsidian AI Full-Stack Builder

`fullKONK_>` is an [Obsidian](https://obsidian.md) plugin that turns your vault into a
multi-provider, multi-stage AI product-builder — a "Google AI Studio, but with a real
backend" that runs entirely client-side, orchestrating **9 free-tier LLM providers**
(Groq, DeepSeek, Google Gemini, Cerebras, SambaNova, OpenRouter, NVIDIA NIM, GitHub
Models, HuggingFace) with automatic scoring, rate-limit tracking, and failover.

No server. No account. No vendor lock-in. Your API keys and every generated file stay
inside your local Obsidian vault.

> This repository was reorganized from a set of product/architecture research notes
> (see [`research/`](./research)) into a fully implemented, tested, and buildable
> Obsidian plugin. The research notes also sketch a separate, larger "Konkred" web
> ecosystem (a Node gateway + Telegram bot, see
> [`research/konkred-ecosystem.md`](./research/konkred-ecosystem.md)) — that is a
> different deployable product built around the *same* orchestration idea and is
> **not** part of this Obsidian plugin; it's kept as reference material only.

---

## Table of contents

- [Features](#features)
- [System architecture](#system-architecture)
- [Quickstart](#quickstart)
- [Configuration](#configuration)
- [Usage](#usage)
- [Provider registry & routing algorithm](#provider-registry--routing-algorithm)
- [Project layout](#project-layout)
- [Development](#development)
- [Testing](#testing)
- [Building & packaging a release](#building--packaging-a-release)
- [API reference (internal modules)](#api-reference-internal-modules)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- **Multi-stage build pipeline** — `architect → frontend → backend → verify`, each
  stage streamed from the best-available provider for that task, or a single-shot
  `review` mode for reviewing/fixing existing code.
- **9 built-in free-tier providers**, all OpenAI-`/chat/completions`-compatible
  (including Gemini via its OpenAI compatibility shim), so adding a 10th is a ~20-line
  registry entry (`src/providers/registry.ts`).
- **Automatic scoring + failover** — every (provider, model) candidate is scored per
  task from capability/thinking/speed weights, tie-broken by a curated per-task
  priority order, and re-tried against the next candidate on HTTP 429, any other
  error, or an empty completion — with exponential-backoff cooldowns so a single
  exhausted free tier doesn't get hammered.
- **Live streaming UI** — a two-pane terminal (chat transcript + generated file
  browser with line numbers and tabs) built directly on Obsidian's `ItemView` API,
  no React/webpack/iframe required.
- **Vault-native persistence** — generated files and full chat transcripts are saved
  as real Markdown/code files inside your vault (`fullKONK/<project>-<timestamp>/`),
  fully offline-capable and versionable with the rest of your notes.
- **Desktop + mobile** — `isDesktopOnly: false`, uses only `fetch`/Obsidian's `Vault`
  API, no Node/Electron APIs.
- **Showcase prompt gallery** — six ready-to-run product briefs to try the pipeline
  immediately.

## System architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          Obsidian Renderer Process                        │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │ FullKonkView (src/view.ts) — ItemView                              │    │
│  │  • Mode selector (fullstack / frontend / backend / review)         │    │
│  │  • Stage bar (architect → frontend → backend → verify → done)      │    │
│  │  • Chat/terminal transcript panel  +  Generated file browser panel │    │
│  └───────────────────────────────────┬─────────────────────────────────┘  │
│                                      │ calls                                │
│  ┌───────────────────────────────────▼─────────────────────────────────┐  │
│  │ orchestrate() (src/orchestrator.ts)                                 │  │
│  │  1. buildCandidates(settings, task)  → score + rank every provider  │  │
│  │     with a configured key and no active rate-limit cooldown         │  │
│  │  2. streamCandidate(...)             → fetch()+SSE parse, streaming │  │
│  │     tokens back to the UI via callbacks                             │  │
│  │  3. on 429 / error / empty completion → penalize & try next         │  │
│  │     candidate, emitting onFailover() for the UI                     │  │
│  └───────────────────────────────────┬─────────────────────────────────┘  │
│                                      │                                      │
│        ┌─────────────┬───────────────┼───────────────┬─────────────┐      │
│        ▼             ▼               ▼               ▼             ▼      │
│    RateLimitTracker  PROVIDERS     fetch() to        VaultManager  Errors  │
│  (providers/         registry      <provider>/        (src/vault.ts)      │
│   rateLimitTracker)  (providers/   chat/completions   → saves generated   │
│                       registry.ts) (streamed SSE)       files + history   │
│                                                          as vault notes    │
└───────────────────────────────────────────────────────────────────────────┘
```

Every provider talks OpenAI's `/chat/completions` wire format (`stream: true`,
Server-Sent Events), so `streamCandidate()` is a single, provider-agnostic code path —
adding a provider is purely a registry/data change, not new request logic.

## Quickstart

**Requirements:** Node.js ≥ 18 (Node 20+ recommended), an Obsidian vault, and at least
one free API key from any provider below.

```bash
# 1. Clone and install
git clone https://github.com/reARbitRA/obsidian-fullkonk-plugin.git
cd obsidian-fullkonk-plugin
npm install

# 2. Build the plugin bundle (produces main.js from src/**/*.ts)
npm run build

# 3. Install into your vault (symlink or copy)
mkdir -p "/path/to/YourVault/.obsidian/plugins/fullkonk"
cp main.js manifest.json styles.css "/path/to/YourVault/.obsidian/plugins/fullkonk/"

# 4. In Obsidian: Settings → Community plugins → enable "fullKONK_>"
# 5. In Obsidian: Settings → fullKONK_> → paste at least one provider API key
```

For active development, `npm run dev` runs esbuild in watch mode (inline sourcemaps,
rebuilds `main.js` on every save) — reload Obsidian (`Ctrl/Cmd+R` in dev tools, or the
"Reload app without saving" command) after each rebuild.

### Where to get free API keys

| Provider | Free tier | Sign up |
|---|---|---|
| Groq | Fast LPU inference, no credit card | https://console.groq.com |
| DeepSeek | Best coding/reasoning models | https://platform.deepseek.com |
| Google Gemini | 1M token context window | https://aistudio.google.com |
| Cerebras | 1M tokens/day | https://cloud.cerebras.ai |
| SambaNova | $5 free credit | https://cloud.sambanova.ai |
| OpenRouter | 20+ free models, one key | https://openrouter.ai |
| NVIDIA NIM | Free evaluation tier | https://build.nvidia.com |
| GitHub Models | Free for prototyping | https://github.com/settings/tokens |
| HuggingFace | Serverless Inference API | https://huggingface.co/settings/tokens |

You only need **one** key to get started — the orchestrator automatically skips any
provider whose key is blank.

## Configuration

`fullKONK_>` has **no `.env` file and no server-side configuration** — see
[`.env.example`](./.env.example) for the full explanation. All runtime configuration
happens in Obsidian's own Settings UI (**Settings → fullKONK_>**), backed by
`Plugin#saveData()`/`loadData()` and persisted to
`<vault>/.obsidian/plugins/fullkonk/data.json`:

- **Provider API keys** — one field per provider (see table above).
- **Default Mode** — `fullstack | frontend | backend | review`.
- **Temperature** (0–1) and **Max Output Tokens** (256–65536) per generation stage.
- **Request Timeout** — how long to wait for a provider before treating it as failed
  and failing over (10–300s).
- **Output Folder** — vault-relative folder generated projects/history are saved
  under (default `fullKONK`).
- **Save Chat History** — toggle whether every session is archived as a Markdown note.

Settings are sanitized and clamped on load (`src/types.ts#sanitizeSettings`), so a
corrupted or hand-edited `data.json` can never crash the plugin — it silently falls
back to safe defaults per-field.

## Usage

1. Open the plugin via the ⚡ ribbon icon or the command palette
   (`fullKONK_>: Open fullKONK_>`).
2. Pick a mode: **FULL-STACK** (architect→frontend→backend→verify),
   **FRONTEND**/**BACKEND** only, or **REVIEW** (single-pass code review/fix).
3. Type a product brief (or click one of the six showcase templates) and press
   **BUILD →** (or <kbd>Enter</kbd>; <kbd>Shift+Enter</kbd> inserts a newline).
4. Watch the stage bar advance and the terminal panel stream each stage's output live,
   with the active provider/model and live tokens/sec shown.
5. Generated files are auto-extracted from fenced code blocks (matched on a leading
   `// path/to/file` or `# path/to/file` comment) and appear as tabs in the right-hand
   panel — click **⎘ COPY** for the active file or **↓ SAVE ALL** to write every file
   into your vault under `<outputFolder>/<slug>-<timestamp>/`, alongside an
   auto-generated `README.md` index.
6. If a provider is rate-limited or errors out mid-stream, you'll see a transient
   notice (`"<provider> rate limited → switching to <provider>"`) and the pipeline
   keeps going on the next-best candidate — no user action needed.

## Provider registry & routing algorithm

Defined in [`src/providers/registry.ts`](./src/providers/registry.ts): each provider
has a `capabilityScore`, `thinkingScore`, `speedScore` (1–10), a `contextWindow`,
`maxOutput`, and a per-task `priority` map.

`score(provider, task)` (in [`src/orchestrator.ts`](./src/orchestrator.ts)) applies
task-specific weights:

| Task | capability | thinking | speed |
|---|---|---|---|
| `architect` / `verify` / `review` | 0.4 | 0.4 | 0.2 |
| `frontend` | 0.5 | 0.2 | 0.3 |
| `backend` | 0.5 | 0.3 | 0.2 |

`buildCandidates()` then:

1. Filters to providers with a non-blank configured API key.
2. Filters out any (provider, model) pair currently inside a rate-limit/error cooldown
   (tracked by [`RateLimitTracker`](./src/providers/rateLimitTracker.ts) with
   exponential backoff: 60s→900s cap for HTTP 429, 30s→300s cap for other errors).
3. Sorts by score descending, breaking ties using the provider's task-specific
   `priority` (ascending — lower number wins).

`orchestrate()` walks that ranked list, streaming from each candidate in turn via
`streamCandidate()` until one returns a non-empty completion, emitting `onProvider` /
`onFailover` / `onMetrics` callbacks the view uses to update the UI live. If every
candidate fails, it throws `AllProvidersFailedError`; if no provider has a key
configured at all, it throws `NoProvidersConfiguredError` up front.

## Project layout

```
obsidian-fullkonk-plugin/
├── manifest.json            # Obsidian plugin manifest (isDesktopOnly: false)
├── styles.css               # Cross-cutting CSS (most styling is inline in view.ts)
├── package.json / tsconfig.json / tsconfig.test.json / esbuild.config.mjs
├── .env.example             # Documents dev/CI-only env vars (no plugin secrets)
├── src/
│   ├── main.ts               # Plugin entry point (onload/onunload/activateView)
│   ├── view.ts                # FullKonkView — the two-pane ItemView UI + pipeline
│   ├── settings.ts            # FullKonkSettingsTab — Obsidian settings UI
│   ├── orchestrator.ts        # Scoring, candidate ranking, SSE streaming, failover
│   ├── providers/
│   │   ├── registry.ts        # Static provider/model definitions
│   │   └── rateLimitTracker.ts# Per (provider, model) cooldown tracking
│   ├── templates.ts           # System prompts per stage + showcase prompt gallery
│   ├── fileExtractor.ts       # Parses generated files out of fenced code blocks
│   ├── vault.ts                # VaultManager — save/read generated files & history
│   ├── errors.ts               # Structured error hierarchy (FullKonkError subtypes)
│   ├── types.ts                 # Shared types + settings sanitizer
│   ├── utils/
│   │   ├── uuid.ts              # crypto.randomUUID() with a manual v4 fallback
│   │   └── logger.ts            # Leveled logger (env-driven only outside Obsidian)
│   ├── __mocks__/obsidian.ts    # In-memory Obsidian API reimplementation for tests
│   └── __tests__/                # Full unit/integration test suite (Jest)
└── research/                   # Original product/architecture research notes (FA/EN)
```

## Development

```bash
npm install        # install dependencies
npm run dev         # esbuild watch mode → main.js (inline sourcemaps)
npm run typecheck   # tsc --noEmit against src/**/*.ts (strict mode)
npm run lint         # ESLint (@typescript-eslint, strict, zero warnings tolerated)
npm run verify        # typecheck + typecheck:test + lint + coverage + production build
```

TypeScript is configured in **strict mode** end-to-end (`strict`, `noImplicitAny`,
`noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch`, `noImplicitOverride`, …) — `npm run verify` is the single
command that reproduces exactly what CI runs (see
[`docs/ci-workflow.yml.example`](./docs/ci-workflow.yml.example) — copy it to
`.github/workflows/ci.yml` in your own fork/clone to enable it; it ships as a
`.example` file here because this sandbox's push credentials don't have GitHub's
`workflows` permission scope).

## Testing

```bash
npm test              # run the full Jest suite once
npm run test:watch     # watch mode
npm run test:coverage  # run with coverage thresholds enforced (see jest.config.js)
```

The suite has **115 tests across 13 files** and enforces minimum coverage of
**80% statements / 70% branches / 80% functions / 80% lines** (actual: ~94% / 84% /
92% / 96% at time of writing). It covers:

- **`orchestrator.test.ts`** — scoring weights, candidate filtering/ranking/tie-break,
  SSE stream parsing (via real `Response`/`ReadableStream` fixtures), HTTP 429 →
  `RateLimitError`, non-2xx → `ProviderRequestError`, empty-completion skip, full
  multi-candidate failover, abort-signal short-circuiting, `NoProvidersConfiguredError`
  / `AllProvidersFailedError`.
- **`rateLimitTracker.test.ts`** — cooldown windows, exponential backoff + caps,
  independent per-(provider, model) tracking, reward-clears-cooldown, reset.
- **`fileExtractor.test.ts`** — path-comment parsing, positional fallback naming,
  overwrite-by-path semantics, minimum-block-length filtering.
- **`vault.test.ts`** — safe-name sanitization, timestamp slugs, generated-file
  persistence (including nested paths + README index), chat history frontmatter,
  vault-file-as-context reads, project listing/sorting via README frontmatter.
- **`view.test.ts`** — full pipeline sequencing per mode, live file extraction while
  streaming, error handling + Notices, abort/stop, mode switching (incl. being
  disabled mid-build), every button/keyboard interaction (templates, clear, save,
  copy incl. clipboard failure, file tabs, Enter/Shift+Enter).
- **`settings.test.ts`**, **`main.test.ts`**, **`types.test.ts`**, **`errors.test.ts`**,
  **`registry.test.ts`**, **`templates.test.ts`**, **`uuid.test.ts`**,
  **`logger.test.ts`** — settings persistence/sanitization, plugin lifecycle
  (register/activate/reuse leaves/unload), error hierarchy invariants, provider
  registry data integrity, and small pure utilities.

Because the real `obsidian` npm package ships **types only** (no runtime — Obsidian
itself provides the implementation), [`src/__mocks__/obsidian.ts`](./src/__mocks__/obsidian.ts)
is a from-scratch, in-memory reimplementation of the exact slice of the API this
plugin uses (`App`/`Vault`/`TFile`/`TFolder`, `Plugin`, `ItemView`, `PluginSettingTab`,
`Setting` + its field components, `Notice`, `WorkspaceLeaf`) wired up via Jest's
`moduleNameMapper`, plus a `setupFilesAfterEach` polyfill
([`src/__tests__/setup.ts`](./src/__tests__/setup.ts)) for the DOM convenience methods
(`createDiv`, `createEl`, `setText`, `empty`, …) Obsidian installs onto
`HTMLElement.prototype` at runtime. Two `tsconfig`s are used for typechecking:
`tsconfig.json` for production `src/` (excludes tests/mocks) and `tsconfig.test.json`
for the full tree, so the mock's test-only helpers (e.g. `Setting.instances`) don't
leak into the production type-check while still being fully type-checked themselves.

## Building & packaging a release

```bash
npm run build     # strict typecheck + minified production main.js
npm run package    # build + copy main.js/manifest.json/styles.css into release/
                     # and zip them into fullkonk-<version>.zip if `zip` is available
```

To install a built release manually: copy `main.js`, `manifest.json`, and
`styles.css` into `<vault>/.obsidian/plugins/fullkonk/`, then enable the plugin from
Obsidian's Community Plugins settings.

## API reference (internal modules)

These are the plugin's internal module boundaries (there is no public HTTP API — this
is a client-side Obsidian plugin):

### `orchestrate(task, messages, settings, callbacks, signal?, options?)`
Routes a chat completion request to the best available provider for `task`
(`'architect' | 'frontend' | 'backend' | 'verify' | 'review'`), streaming tokens via
`callbacks.onChunk`, and transparently failing over across every configured candidate.
Returns the full completion text; throws `NoProvidersConfiguredError` /
`AllProvidersFailedError` on total failure. See
[`src/orchestrator.ts`](./src/orchestrator.ts).

### `buildCandidates(settings, task, tracker?, providers?)`
Pure function returning the ranked list of usable `{ provider, model, score }`
candidates for a task — the core of the routing algorithm, fully unit-testable
without any network access.

### `VaultManager`
`saveGeneratedFiles(projectName, files)`, `saveChatHistory(projectName, messages, mode,
provider)`, `readFilesAsContext(paths)`, `listProjects()` — all vault I/O, using only
Obsidian's `Vault` API (safe on desktop and mobile). See
[`src/vault.ts`](./src/vault.ts).

### `extractFiles(content)`
Pure function: parses fenced code blocks with an optional leading `// path` / `# path`
comment into `GeneratedFile[]`. See [`src/fileExtractor.ts`](./src/fileExtractor.ts).

### Error hierarchy
`FullKonkError` (base) → `NoProvidersConfiguredError`, `RateLimitError`,
`ProviderRequestError`, `EmptyCompletionError`, `AllProvidersFailedError`,
`AbortedError`, `InvalidSettingsError`, `VaultOperationError`. See
[`src/errors.ts`](./src/errors.ts).

## Troubleshooting

- **"No API keys configured"** — open Settings → fullKONK_> and paste at least one
  provider key.
- **A provider keeps failing over immediately** — check the key is valid and has not
  hit its daily quota; the rate-limit cooldown is per (provider, model) and resets
  automatically (60s–15min depending on failure count).
- **Nothing shows in the file panel** — the pipeline only extracts fenced code blocks
  ≥30 characters with a valid triple-backtick fence; make sure your system prompt
  (customizing prompts isn't exposed in the UI yet — see `src/templates.ts`) asks for
  a leading `// path/to/file` comment per file.
- **Plugin doesn't appear after copying files** — ensure all three of `main.js`,
  `manifest.json`, and `styles.css` are directly inside
  `<vault>/.obsidian/plugins/fullkonk/` (not a nested subfolder), then fully restart
  Obsidian.

## License

[MIT](./LICENSE) — © konkred.xyz
