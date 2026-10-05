# fullKONK_> — Obsidian AI Builder + Vault & Notes Workspace

`fullKONK_>` is an [Obsidian](https://obsidian.md) plugin that combines a
multi-provider, multi-stage AI product builder with a safe, vault-native notes
workspace. The builder is a "Google AI Studio, but with a real backend" that runs
client-side, orchestrating **12 free-tier LLM providers**
(Groq, DeepSeek, Google Gemini, Cerebras, SambaNova, OpenRouter, NVIDIA NIM, GitHub
Models, HuggingFace, Mistral, Together AI, Fireworks AI) with automatic scoring,
rate-limit tracking, per-stage routing, and failover.

No server. No account. No vendor lock-in. Your API keys, notes, and generated files stay
inside your local Obsidian vault. A note's path and content are sent to a configured
provider only when you explicitly opt in and run an AI note action.

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
- **12 built-in free-tier providers**, all OpenAI-`/chat/completions`-compatible
  (including Gemini via its OpenAI compatibility shim), so adding a 13th is a ~20-line
  registry entry (`src/providers/registry.ts`).
- **Automatic scoring + failover** — every (provider, model) candidate is scored per
  task from capability/thinking/speed weights, tie-broken by a curated per-task
  priority order, and re-tried against the next candidate on HTTP 429, any other
  error, or an empty completion — with exponential-backoff cooldowns so a single
  exhausted free tier doesn't get hammered.
- **Per-stage routing pins** — pin a specific provider *and model* to any stage
  (architect / frontend / backend / verify / review) in Settings; the pin is promoted
  to the front of that stage's candidate list while automatic failover keeps working
  behind it.
- **Session stats** — every stage records tokens streamed, wall-clock duration and the
  provider/model that actually served it; a strip under the terminal shows the
  session total (Σ tokens · tok/s · duration) and expands into a per-stage breakdown,
  and the same numbers are written into the saved history note's frontmatter.
- **Export options** — copy a single file (**⎘ COPY**), copy the whole project as one
  Markdown bundle (**⎘ COPY ALL**), save every file individually (**↓ SAVE ALL**),
  write a shareable Markdown bundle (**≡ BUNDLE**) or a real **.zip** archive
  (**⤓ ZIP**) into `<outputFolder>/exports/` — the ZIP is written by a small built-in
  STORE-method writer (`src/utils/zip.ts`), so no native dependency is needed.
- **Live streaming UI** — a two-pane terminal (chat transcript + generated file
  browser with line numbers and tabs) built directly on Obsidian's `ItemView` API,
  no React/webpack/iframe required.
- **Vault-native persistence** — generated files and full chat transcripts are saved
  as real Markdown/code files inside your vault (`fullKONK/<project>-<timestamp>/`),
  fully offline-capable and versionable with the rest of your notes.
- **Vault & Notes workspace** — a separate Obsidian view for reading Markdown notes,
  searching titles/paths/tags/categories (optionally note contents), and sorting by
  name, path, created, or modified date. Read a rendered Markdown preview or open
  notes in Obsidian's editor; stage edits with Markdown formatting shortcuts and
  compare before applying.
- **Safe organization tools** — move or rename one or many notes (using Obsidian's
  link-aware FileManager), batch-add/remove tags, and set/clear a `category` YAML
  frontmatter property. Moves and metadata updates show a preview; edit and batch
  metadata writes check for concurrent changes.
- **Optional AI note assistant** — summarize or rewrite a selected note using the
  configured provider. The view requires explicit consent before transmitting note
  text, and results remain drafts until you preview and apply them.
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

The separate **Vault & Notes** view (`VaultNotesView`) uses Obsidian's own `Vault`,
`MetadataCache`, and `FileManager` APIs for note reads, previewed edits, link-aware
moves, and frontmatter changes; routine organization works without an API key.

Every provider talks OpenAI's `/chat/completions` wire format (`stream: true`,
Server-Sent Events), so `streamCandidate()` is a single, provider-agnostic code path —
adding a provider is purely a registry/data change, not new request logic.

## Quickstart

**Requirements:** Node.js ≥ 18 (Node 20+ recommended), Obsidian ≥ 1.4.4, an Obsidian
vault, and at least one free API key from any provider below for the builder/AI note
assistant. Reading and organizing vault notes does not require an API key.

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
| Mistral | Free experiment tier (Mistral Large / Codestral) | https://console.mistral.ai |
| Together AI | Free Llama 3.3 / R1 Distill endpoints | https://api.together.xyz/settings/api-keys |
| Fireworks AI | Free starting credit, very fast inference | https://fireworks.ai/account/api-keys |

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
- **Per-Stage Routing** — one row per stage with a provider dropdown
  (`Auto (recommended)` + every provider) and, once a provider is pinned, a model
  dropdown for that provider. Pins are advisory-first, not exclusive: the pinned
  pair is tried first and the automatic ranking remains as fallback.
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
   panel. From left to right the action bar offers: **⎘ COPY** (active file),
   **⎘ COPY ALL** (whole project as one Markdown bundle on the clipboard),
   **⤓ ZIP** (real `.zip` archive), **≡ BUNDLE** (single Markdown bundle note) and
   **↓ SAVE ALL** (every file written individually under
   `<outputFolder>/<slug>-<timestamp>/`, alongside an auto-generated `README.md`
   index). ZIP and bundle exports land in `<outputFolder>/exports/`.
6. Under the terminal, a stats strip appears once a build finishes: click it to expand
   the per-stage breakdown (tokens · duration · provider/model); the collapsed line
   shows the session totals.
7. If a provider is rate-limited or errors out mid-stream, you'll see a transient
   notice (`"<provider> rate limited → switching to <provider>"`) and the pipeline
   keeps going on the next-best candidate — no user action needed.
8. Open **Vault & Notes** from the command palette (`fullKONK_>: Open Vault & Notes`)
   or the **☷ NOTES** button. Search note titles/paths/tags/categories; enable
   **Search inside notes** to scan note bodies; sort and filter the list; select one or
   more notes to move them or update frontmatter tags/categories. Select a note to read
   it, open it in Obsidian, or edit and format a draft. Review the before/proposed
   preview and choose Apply before any change is written. AI summary/rewrite is optional
   and requires a separate consent checkbox.

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
4. Promotes any per-stage pin from settings (`applyStagePin()`) to the head of the
   list. A pin that can't be honored — unknown provider id, no API key configured, or
   every model of that provider in cooldown — is ignored, so stale `data.json`
   contents can never break routing.

`orchestrate()` walks that ranked list, streaming from each candidate in turn via
`streamCandidate()` until one returns a non-empty completion, emitting `onProvider` /
`onFailover` / `onMetrics` callbacks the view uses to update the UI live. If every
candidate fails, it throws `AllProvidersFailedError`; if no provider has a key
configured at all, it throws `NoProvidersConfiguredError` up front.

## Project layout

```
obsidian-fullkonk-plugin/
├── manifest.json            # Obsidian plugin manifest (isDesktopOnly: false)
├── styles.css               # Builder + theme-aware Vault & Notes workspace styles
├── package.json / tsconfig.json / tsconfig.test.json / esbuild.config.mjs
├── .env.example             # Documents dev/CI-only env vars (no plugin secrets)
├── src/
│   ├── main.ts               # Plugin entry point (onload/onunload/activateView)
│   ├── view.ts                # FullKonkView — builder ItemView + pipeline
│   ├── notesView.ts           # VaultNotesView — browse/read/edit/organize ItemView
│   ├── notesManager.ts        # VaultNotesManager — guarded Vault/FileManager operations
│   ├── notes.ts               # Search/sort/formatting + move/metadata planning helpers
│   ├── settings.ts            # FullKonkSettingsTab — Obsidian settings UI
│   ├── orchestrator.ts        # Scoring, candidate ranking, SSE streaming, failover
│   ├── providers/
│   │   ├── registry.ts        # Static provider/model definitions
│   │   └── rateLimitTracker.ts# Per (provider, model) cooldown tracking
│   ├── templates.ts           # System prompts per stage + showcase prompt gallery
│   ├── fileExtractor.ts       # Parses generated files out of fenced code blocks
│   ├── vault.ts                # VaultManager — save/read generated files & history
│   ├── exporter.ts             # Pure Markdown-bundle builder (clipboard + vault)
│   ├── stats.ts                # Pure session/stage token-throughput accounting
│   ├── errors.ts               # Structured error hierarchy (FullKonkError subtypes)
│   ├── types.ts                 # Shared types + settings sanitizer
│   ├── utils/
│   │   ├── uuid.ts              # crypto.randomUUID() with a manual v4 fallback
│   │   ├── zip.ts               # Dependency-free STORE-method ZIP writer
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

The suite has **227 tests across 19 files** and enforces minimum coverage of
**80% statements / 70% branches / 80% functions / 80% lines** (current: 90.23% /
75.06% / 90.39% / 92.59%). It covers:

- **`orchestrator.test.ts`** — scoring weights, candidate filtering/ranking/tie-break,
  per-stage pin promotion (exact model, model fallback within a pinned provider,
  unknown/unconfigured/cooled-down pins ignored, per-stage scoping), SSE stream
  parsing across fragmented chunks, provider-specific OpenRouter headers, HTTP 429 →
  `RateLimitError` with Retry-After, non-2xx → `ProviderRequestError`, empty-completion
  skip, full multi-candidate failover with reason reporting, abort-signal short-circuiting,
  and distinct `NoProvidersConfiguredError` / `AllProvidersCoolingDownError` /
  `AllProvidersFailedError` cases.
- **`rateLimitTracker.test.ts`** — cooldown windows, exponential backoff + caps,
  server-specified Retry-After delays, independent per-(provider, model) tracking,
  reward-clears-cooldown, reset.
- **`fileExtractor.test.ts`** — path-comment parsing, positional fallback naming,
  overwrite-by-path semantics, minimum-block-length filtering, nested Markdown fences.
- **`vault.test.ts`** — Unicode-safe name sanitization, timestamp slugs, generated-file
  persistence (including nested paths + README index), chat history frontmatter with
  and without session stats, ZIP + Markdown-bundle exports (byte-level signature and
  entry assertions), vault-file-as-context reads, project listing/sorting via README
  frontmatter.
- **`zip.test.ts`** — canonical CRC-32 vectors, local/central/EOCD record layout
  (parsed back by an in-test ZIP reader), UTF-8 names and content, path normalization,
  DOS timestamps incl. pre-1980 clamping, empty archives and empty-path rejection.
- **`stats.test.ts` / `exporter.test.ts`** — session aggregation, token estimation,
  duration/tps formatters, fence widening for nested backticks, and bundle frontmatter.
- **`notes.test.ts`** — tag/category normalization, search and sorting, Markdown
  formatting transforms, traversal-safe path validation, move planning, and metadata previews.
- **`notesManager.test.ts`** — vault note indexing/reading, edit conflict detection,
  nested link-aware moves, collision/rollback safety, and frontmatter updates that
  preserve unrelated properties and reject stale batch previews.
- **`notesView.test.ts`** — note listing/search/content search, preview-first editing
  and formatting, opening notes in Obsidian, move/rename and multi-note metadata UI,
  explicit AI consent, summary/rewrite drafts, stale-edit rejection, refresh safety,
  and cancellation of late responses when switching notes.
- **`view.test.ts`** — full pipeline sequencing per mode, mode-accurate stage bars,
  live file extraction while streaming, clean partial-output failover, error handling +
  Notices, abort/stop, mode switching (incl. being disabled mid-build), every button/keyboard interaction (templates, clear, save,
  copy incl. clipboard failure, file tabs, Enter/Shift+Enter), the session-stats strip
  (hidden until a build, per-stage recording, expansion, failure marking, reset) and
  every export action incl. failure paths.
- **`settings.test.ts`**, **`main.test.ts`**, **`types.test.ts`**, **`errors.test.ts`**,
  **`registry.test.ts`**, **`templates.test.ts`**, **`uuid.test.ts`**,
  **`logger.test.ts`** — settings persistence/sanitization (incl. routing-pin
  sanitization and the per-stage dropdowns), plugin lifecycle
  (register/activate/reuse leaves/unload), error hierarchy invariants, provider
  registry data integrity (12 providers, unique ids/settings keys), and small pure
  utilities.

Because the real `obsidian` npm package ships **types only** (no runtime — Obsidian
itself provides the implementation), [`src/__mocks__/obsidian.ts`](./src/__mocks__/obsidian.ts)
is a from-scratch, in-memory reimplementation of the exact slice of the API this
plugin uses (`App`/`Vault`/`TFile`/`TFolder`, `FileManager`, `MetadataCache`,
`MarkdownRenderer`, `Plugin`, `ItemView`, `PluginSettingTab`, `Setting` + its field
components, `Notice`, `WorkspaceLeaf`) wired up via Jest's
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
without any network access. Honors `settings.stageRouting[task]` by calling
`applyStagePin()` before returning.

### `applyStagePin(candidates, settings, task)`
Moves the pinned (provider, model) for a task to the head of the candidate list.
Silently returns the input unchanged when the pin is unknown, unconfigured, or fully
cooled down.

### `VaultManager`
`saveGeneratedFiles(projectName, files)`, `saveChatHistory(projectName, messages, mode,
provider, stats?)`, `exportZip(projectName, files)` (→
`<outputFolder>/exports/<name>-<timestamp>.zip`), `saveBundle(projectName, files)`
(→ `.../<name>-<timestamp>.md`), `readFilesAsContext(paths)`, `listProjects()` — all
vault I/O, using only Obsidian's `Vault`/`createBinary` API (safe on desktop and
mobile). See [`src/vault.ts`](./src/vault.ts).

### `VaultNotesManager`
`listNotes()`, `readNote()`, `saveNote(file, expected, next)` (rejects stale edit
previews), `validateMovePlan()` / `moveNotes()` (link-aware `FileManager.renameFile`),
and `applyMetadata()` (Obsidian `processFrontMatter`, preserving unrelated YAML).
Batch frontmatter is preflighted before writes and rechecked during each atomic note
update. See [`src/notesManager.ts`](./src/notesManager.ts).

### `notes.ts`
Pure helpers for filtering/sorting note records, tag normalization, frontmatter change
plans, safe vault-relative move plans, and selection-based Markdown formatting. The
move planner rejects traversal, invalid names, and duplicate destinations.
The UI is `VaultNotesView` (`src/notesView.ts`), opened with the command
`fullKONK_>: Open Vault & Notes` or the builder's **☷ NOTES** button.

### `extractFiles(content)`
Pure function: parses fenced code blocks with an optional leading `// path` / `# path`
comment into `GeneratedFile[]`. See [`src/fileExtractor.ts`](./src/fileExtractor.ts).

### `stats.ts`
`createSessionStats()`, `startSession()`, `recordStage()`, `estimateTokens()` (~4
chars/token), `totalTokens()`, `totalDurationMs()`, `averageTps()`, `summarize()`, plus
`formatTokens/formatDuration/formatTps/formatSummaryLine/formatStageLine`. Pure and
`obsidian`-free.

### `exporter.ts`
`fenceCode(content, language)` (widens the fence when the body contains backticks) and
`buildBundleMarkdown(projectName, files, timestamp)` — the single source of truth for
the bundle format used by both the vault export and the clipboard "copy all" action.

### `utils/zip.ts`
`createZip(entries, date?)` → `Uint8Array`, plus `crc32()` and `normalizeZipPath()`.
Dependency-free STORE-method (uncompressed) ZIP writer with UTF-8 filenames; used by
`VaultManager.exportZip()`.

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
