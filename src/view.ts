// src/view.ts
//
// The main fullKONK_> workspace view: a two-pane terminal (chat transcript +
// generated file browser) driving a multi-stage build pipeline through the
// provider orchestrator.

import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type FullKonkPlugin from "./main";
import { orchestrate } from "./orchestrator";
import { SHOWCASE_TEMPLATES, SYSTEM_PROMPTS } from "./templates";
import { VaultManager, timestampSlug } from "./vault";
import { extractFiles } from "./fileExtractor";
import { buildBundleMarkdown } from "./exporter";
import { generateId } from "./utils/uuid";
import { AbortedError } from "./errors";
import {
  SessionStats,
  StageStat,
  createSessionStats,
  estimateTokens,
  formatStageLine,
  formatSummaryLine,
  recordStage,
  startSession,
  summarize,
} from "./stats";
import {
  BuildMode,
  ChatMessage,
  FKMessage,
  GeneratedFile,
  OrchestratorCallbacks,
  PipelineStage,
  TaskType,
} from "./types";

export const FK_VIEW_TYPE = "fullkonk-view";

const MODES: { id: BuildMode; label: string }[] = [
  { id: "fullstack", label: "⬡ FULL-STACK" },
  { id: "frontend", label: "◈ FRONTEND" },
  { id: "backend", label: "⬢ BACKEND" },
  { id: "review", label: "◎ REVIEW" },
];

const STAGE_ORDER: PipelineStage[] = ["architect", "frontend", "backend", "verify", "done"];

export class FullKonkView extends ItemView {
  private readonly plugin: FullKonkPlugin;
  private readonly vault: VaultManager;

  private messages: FKMessage[] = [];
  private files: GeneratedFile[] = [];
  private mode: BuildMode;
  private stage: PipelineStage = "idle";
  private streaming = false;
  private activeFile: string | null = null;
  private liveProvider = "";
  private liveModel = "";
  private liveTokens = 0;
  private liveTps = 0;
  private abortCtrl: AbortController | null = null;
  private stats: SessionStats = createSessionStats();
  private sessionTokens = 0; // tokens produced by completed stages in this build
  private stageTokens = 0; // tokens produced by the stage currently streaming
  private statsExpanded = false;

  private chatEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private codeTabsEl: HTMLElement | null = null;
  private codeBodyEl: HTMLElement | null = null;
  private stageBarEl: HTMLElement | null = null;
  private sendBtnEl: HTMLButtonElement | null = null;
  private statsEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: FullKonkPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.mode = plugin.settings.defaultMode;
    this.vault = new VaultManager(plugin.app, plugin.settings.outputFolder);
  }

  getViewType(): string {
    return FK_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "fullKONK_>";
  }

  override getIcon(): string {
    return "zap";
  }

  // ─── LIFECYCLE ──────────────────────────────────────────────────────────

  override async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("fk-root");
    root.style.cssText =
      'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#000;color:#fff;font-family:"Space Grotesk",sans-serif;';

    this.buildTopBar(root);
    this.buildStageBar(root);
    this.buildMainArea(root);
  }

  override async onClose(): Promise<void> {
    this.abortCtrl?.abort();
  }

  // ─── TOP BAR ────────────────────────────────────────────────────────────

  private buildTopBar(root: HTMLElement): void {
    root.querySelector(".fk-topbar")?.remove();

    const bar = root.createDiv({ cls: "fk-topbar" });
    bar.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:0 12px;height:48px;background:#000;border-bottom:2px solid #111;flex-shrink:0;flex-wrap:wrap;";
    // Ensure the topbar renders before the stage bar / main area on re-render.
    root.prepend(bar);

    const brand = bar.createDiv();
    brand.style.cssText =
      'font-family:"JetBrains Mono",monospace;font-size:13px;font-weight:700;color:#FFD700;letter-spacing:3px;margin-right:auto;';
    brand.setText("fullKONK_>");

    const modeWrap = bar.createDiv();
    modeWrap.style.cssText = "display:flex;";
    MODES.forEach((m, i) => {
      const btn = modeWrap.createEl("button");
      btn.setText(m.label);
      const active = this.mode === m.id;
      btn.style.cssText = `padding:3px 10px;background:${active ? "#FFD700" : "transparent"};border:1px solid ${
        active ? "#FFD700" : "#222"
      };${i < MODES.length - 1 ? "border-right:none;" : ""}color:${
        active ? "#000" : "#444"
      };font-family:"JetBrains Mono",monospace;font-size:8px;font-weight:700;letter-spacing:2px;cursor:pointer;`;
      btn.disabled = this.streaming;
      btn.onclick = (): void => {
        if (this.streaming) return;
        this.mode = m.id;
        this.buildTopBar(root);
        this.renderStageBar();
      };
    });

    const notesBtn = bar.createEl("button");
    notesBtn.setText("☷ NOTES");
    notesBtn.title = "Open Vault & Notes workspace";
    notesBtn.style.cssText =
      'padding:3px 10px;background:none;border:1px solid #222;color:#555;font-family:"JetBrains Mono",monospace;font-size:8px;font-weight:700;letter-spacing:2px;cursor:pointer;';
    notesBtn.onclick = (): void => {
      void this.plugin.activateNotesView();
    };

    const saveBtn = bar.createEl("button");
    saveBtn.setText("↓ SAVE");
    saveBtn.style.cssText =
      'padding:3px 10px;background:none;border:1px solid #222;color:#555;font-family:"JetBrains Mono",monospace;font-size:8px;font-weight:700;letter-spacing:2px;cursor:pointer;';
    saveBtn.onclick = (): void => {
      void this.saveToVault();
    };
  }

  // ─── STAGE BAR ──────────────────────────────────────────────────────────

  private buildStageBar(root: HTMLElement): void {
    this.stageBarEl = root.createDiv({ cls: "fk-stagebar" });
    this.stageBarEl.style.cssText = "background:#040404;border-bottom:1px solid #111;flex-shrink:0;display:none;";
    this.renderStageBar();
  }

  private renderStageBar(): void {
    if (!this.stageBarEl) return;
    if (this.stage === "idle") {
      this.stageBarEl.style.display = "none";
      return;
    }
    this.stageBarEl.style.display = "block";
    this.stageBarEl.empty();

    const inner = this.stageBarEl.createDiv();
    inner.style.cssText = "display:flex;align-items:center;gap:10px;padding:6px 14px;flex-wrap:wrap;";

    const stagesByMode: Record<BuildMode, { id: PipelineStage; label: string }[]> = {
      review: [
        { id: "review", label: "REVIEW" },
        { id: "done", label: "DONE" },
      ],
      frontend: [
        { id: "architect", label: "ARCH" },
        { id: "frontend", label: "FRONT" },
        { id: "done", label: "DONE" },
      ],
      backend: [
        { id: "architect", label: "ARCH" },
        { id: "backend", label: "BACK" },
        { id: "done", label: "DONE" },
      ],
      fullstack: [
        { id: "architect", label: "ARCH" },
        { id: "frontend", label: "FRONT" },
        { id: "backend", label: "BACK" },
        { id: "verify", label: "VERIFY" },
        { id: "done", label: "DONE" },
      ],
    };
    const stages = stagesByMode[this.mode];

    const currentIdx = STAGE_ORDER.indexOf(this.stage);
    stages.forEach((s, i) => {
      const idx = STAGE_ORDER.indexOf(s.id);
      const done = currentIdx > idx;
      const active = this.stage === s.id;
      const color = done ? "#00FF88" : active ? "#FFD700" : "#2a2a2a";

      const stageEl = inner.createDiv();
      stageEl.style.cssText = `display:flex;align-items:center;gap:4px;font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:1px;color:${color};`;

      const box = stageEl.createDiv();
      box.style.cssText = `width:14px;height:14px;border:1px solid ${color};display:flex;align-items:center;justify-content:center;font-size:7px;`;
      box.setText(done ? "✓" : String(i + 1));

      stageEl.createSpan({ text: s.label });

      if (i < stages.length - 1) {
        const sep = inner.createDiv();
        sep.style.cssText = `width:14px;height:1px;background:${done ? "#00FF88" : "#111"};`;
      }
    });

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

    if (this.streaming) {
      const stopBtn = inner.createEl("button");
      stopBtn.setText("■ STOP");
      stopBtn.style.cssText =
        'background:#FF003C;border:none;color:#fff;font-family:"JetBrains Mono",monospace;font-size:8px;font-weight:700;letter-spacing:2px;padding:3px 10px;cursor:pointer;margin-left:auto;';
      stopBtn.onclick = (): void => this.stop();
    }
  }

  // ─── MAIN AREA ──────────────────────────────────────────────────────────

  private buildMainArea(root: HTMLElement): void {
    const main = root.createDiv();
    main.style.cssText = "display:grid;grid-template-columns:1fr 1fr;flex:1;overflow:hidden;";

    this.buildChatPanel(main);
    this.buildCodePanel(main);
  }

  // ─── CHAT PANEL ─────────────────────────────────────────────────────────

  private buildChatPanel(parent: HTMLElement): void {
    const panel = parent.createDiv();
    panel.style.cssText = "display:flex;flex-direction:column;border-right:2px solid #111;overflow:hidden;background:#080808;";

    const toolbar = panel.createDiv();
    toolbar.style.cssText = "display:flex;align-items:center;padding:6px 10px;border-bottom:1px solid #111;gap:6px;flex-shrink:0;";

    const label = toolbar.createDiv();
    label.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:3px;color:#2a2a2a;margin-right:auto;';
    label.setText("// TERMINAL");

    const clearBtn = toolbar.createEl("button");
    clearBtn.setText("✕ CLEAR");
    clearBtn.style.cssText =
      'background:none;border:1px solid #1a1a1a;color:#444;padding:2px 8px;font-family:"JetBrains Mono",monospace;font-size:8px;cursor:pointer;letter-spacing:1px;';
    clearBtn.onclick = (): void => this.clear();

    const tplWrap = panel.createDiv();
    tplWrap.style.cssText = "padding:8px;border-bottom:1px solid #0d0d0d;display:flex;flex-wrap:wrap;gap:4px;flex-shrink:0;";
    const tplLabel = tplWrap.createDiv();
    tplLabel.style.cssText = 'width:100%;font-family:"JetBrains Mono",monospace;font-size:7px;color:#1a1a1a;letter-spacing:2px;margin-bottom:3px;';
    tplLabel.setText("// SHOWCASE TEMPLATES");
    SHOWCASE_TEMPLATES.forEach((tpl) => {
      const btn = tplWrap.createEl("button");
      btn.setText(tpl.name);
      btn.style.cssText = `background:none;border:1px solid #1a1a1a;color:#444;padding:2px 7px;font-family:"JetBrains Mono",monospace;font-size:7px;cursor:pointer;letter-spacing:1px;transition:all .15s;`;
      btn.onmouseenter = (): void => {
        btn.style.borderColor = tpl.accent;
        btn.style.color = tpl.accent;
      };
      btn.onmouseleave = (): void => {
        btn.style.borderColor = "#1a1a1a";
        btn.style.color = "#444";
      };
      btn.onclick = (): void => {
        if (this.inputEl) {
          this.inputEl.value = tpl.prompt;
          this.inputEl.focus();
        }
      };
    });

    this.chatEl = panel.createDiv();
    this.chatEl.style.cssText = "flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;";
    this.renderEmpty();

    const inputArea = panel.createDiv();
    inputArea.style.cssText = "display:flex;gap:6px;padding:8px;border-top:1px solid #111;flex-shrink:0;background:#050505;";

    this.inputEl = inputArea.createEl("textarea");
    this.inputEl.placeholder = "Describe what you want to build...";
    this.inputEl.rows = 2;
    this.inputEl.style.cssText =
      'flex:1;background:#0d0d0d;border:1px solid #222;color:#fff;font-family:"Space Grotesk",sans-serif;font-size:12px;padding:6px 9px;outline:none;resize:none;line-height:1.5;';
    this.inputEl.onkeydown = (e: KeyboardEvent): void => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void this.send();
      }
    };

    this.sendBtnEl = inputArea.createEl("button");
    this.sendBtnEl.setText("BUILD →");
    this.sendBtnEl.style.cssText =
      'background:#FFD700;border:none;color:#000;font-family:"JetBrains Mono",monospace;font-size:9px;font-weight:700;letter-spacing:2px;padding:6px 12px;cursor:pointer;align-self:flex-end;';
    this.sendBtnEl.onclick = (): void => {
      void this.send();
    };

    this.statsEl = panel.createDiv({ cls: "fk-stats" });
    this.statsEl.style.cssText =
      'border-top:1px solid #0d0d0d;background:#040404;font-family:"JetBrains Mono",monospace;display:none;';
    this.statsEl.onclick = (): void => {
      this.statsExpanded = !this.statsExpanded;
      this.renderStats();
    };
    this.renderStats();
  }

  // ─── CODE PANEL ─────────────────────────────────────────────────────────

  private buildCodePanel(parent: HTMLElement): void {
    const panel = parent.createDiv();
    panel.style.cssText = "display:flex;flex-direction:column;overflow:hidden;background:#050505;";

    this.codeTabsEl = panel.createDiv();
    this.codeTabsEl.style.cssText =
      "display:flex;overflow-x:auto;background:#030303;border-bottom:1px solid #0d0d0d;flex-shrink:0;min-height:30px;";

    const actBar = panel.createDiv();
    actBar.style.cssText = "display:flex;gap:0;border-bottom:1px solid #080808;flex-shrink:0;";

    const copyBtn = actBar.createEl("button");
    copyBtn.setText("⎘ COPY");
    copyBtn.style.cssText =
      'background:none;border:none;border-right:1px solid #0d0d0d;color:#444;padding:5px 12px;font-family:"JetBrains Mono",monospace;font-size:8px;cursor:pointer;letter-spacing:1px;';
    copyBtn.onclick = (): void => this.copyActiveFile();

    const copyAllBtn = actBar.createEl("button");
    copyAllBtn.setText("⎘ COPY ALL");
    copyAllBtn.style.cssText =
      'background:none;border:none;border-right:1px solid #0d0d0d;color:#444;padding:5px 12px;font-family:"JetBrains Mono",monospace;font-size:8px;cursor:pointer;letter-spacing:1px;';
    copyAllBtn.onclick = (): void => this.copyAllFiles();

    const zipBtn = actBar.createEl("button");
    zipBtn.setText("⤓ ZIP");
    zipBtn.style.cssText =
      'background:none;border:none;border-right:1px solid #0d0d0d;color:#444;padding:5px 12px;font-family:"JetBrains Mono",monospace;font-size:8px;cursor:pointer;letter-spacing:1px;';
    zipBtn.onclick = (): void => {
      void this.exportZip();
    };

    const bundleBtn = actBar.createEl("button");
    bundleBtn.setText("≡ BUNDLE");
    bundleBtn.style.cssText =
      'background:none;border:none;border-right:1px solid #0d0d0d;color:#444;padding:5px 12px;font-family:"JetBrains Mono",monospace;font-size:8px;cursor:pointer;letter-spacing:1px;';
    bundleBtn.onclick = (): void => {
      void this.exportBundle();
    };

    const saveBtn = actBar.createEl("button");
    saveBtn.setText("↓ SAVE ALL");
    saveBtn.style.cssText =
      'background:none;border:none;color:#444;padding:5px 12px;font-family:"JetBrains Mono",monospace;font-size:8px;cursor:pointer;letter-spacing:1px;margin-left:auto;';
    saveBtn.onclick = (): void => {
      void this.saveToVault();
    };

    this.codeBodyEl = panel.createDiv();
    this.codeBodyEl.style.cssText = "flex:1;overflow:auto;";
    this.renderCodeBody();
  }

  // ─── RENDER HELPERS ─────────────────────────────────────────────────────

  private renderEmpty(): void {
    if (!this.chatEl) return;
    this.chatEl.empty();
    const empty = this.chatEl.createDiv();
    empty.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;opacity:.4;";
    const icon = empty.createDiv();
    icon.style.cssText = "font-size:28px;";
    icon.setText("⚡");
    const title = empty.createDiv();
    title.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:14px;font-weight:700;color:#FFD700;letter-spacing:3px;';
    title.setText("fullKONK_>");
    const sub = empty.createDiv();
    sub.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:9px;color:#333;letter-spacing:1px;';
    sub.setText("DESCRIBE WHAT YOU WANT TO BUILD");
  }

  private appendMessage(msg: FKMessage): void {
    if (!this.chatEl) return;
    if (this.messages.length === 1 && this.messages[0] === msg) {
      this.chatEl.empty();
    }

    const el = this.chatEl.createDiv();
    el.setAttribute("data-id", msg.id);

    if (msg.role === "user") {
      el.style.cssText = "background:#111;border:1px solid #222;padding:8px 10px;font-size:12px;color:#fff;";
      el.setText(msg.content);
    } else {
      el.style.cssText = "position:relative;background:#030f03;border:1px solid #0f200f;padding:8px 10px;";
      const badge = el.createDiv();
      badge.style.cssText =
        'position:absolute;top:-7px;right:6px;background:#00FF88;color:#000;font-family:"JetBrains Mono",monospace;font-size:6px;font-weight:700;padding:1px 4px;letter-spacing:1px;';
      badge.setText(msg.stage?.toUpperCase() ?? "AI");
      const pre = el.createEl("pre");
      pre.id = `fk-msg-${msg.id}`;
      pre.style.cssText =
        'font-family:"JetBrains Mono",monospace;font-size:9px;color:#00FF88;line-height:1.7;white-space:pre-wrap;word-break:break-word;margin:0;';
      pre.setText(msg.content);
    }

    this.chatEl.scrollTop = this.chatEl.scrollHeight;
  }

  private appendChunkToLastMsg(): void {
    if (!this.chatEl) return;
    const last = this.messages[this.messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const pre = this.chatEl.querySelector<HTMLElement>(`#fk-msg-${last.id}`);
    if (pre) pre.setText(last.content);
    this.chatEl.scrollTop = this.chatEl.scrollHeight;
  }

  private renderFileTabs(): void {
    if (!this.codeTabsEl) return;
    this.codeTabsEl.empty();
    this.files.forEach((f) => {
      const tab = this.codeTabsEl!.createEl("button");
      const isActive = f.path === this.activeFile;
      tab.style.cssText = `display:flex;align-items:center;gap:4px;padding:5px 11px;border:none;border-right:1px solid #0d0d0d;border-bottom:${
        isActive ? "2px solid #FFD700" : "2px solid transparent"
      };background:${isActive ? "#050505" : "transparent"};color:${
        isActive ? "#fff" : "#444"
      };font-family:"JetBrains Mono",monospace;font-size:8px;cursor:pointer;white-space:nowrap;flex-shrink:0;`;
      const dot = tab.createDiv();
      dot.style.cssText = "width:4px;height:4px;background:#FFD700;flex-shrink:0;";
      tab.createSpan({ text: f.path.split("/").pop() ?? f.path });
      tab.onclick = (): void => {
        this.activeFile = f.path;
        this.renderFileTabs();
        this.renderCodeBody();
      };
    });
  }

  private renderCodeBody(): void {
    if (!this.codeBodyEl) return;
    this.codeBodyEl.empty();

    if (this.files.length === 0) {
      const empty = this.codeBodyEl.createDiv();
      empty.style.cssText =
        'display:flex;align-items:center;justify-content:center;height:100%;opacity:.3;font-family:"JetBrains Mono",monospace;font-size:11px;color:#333;letter-spacing:2px;';
      empty.setText(this.streaming ? "GENERATING..." : "OUTPUT APPEARS HERE");
      return;
    }

    const current = this.files.find((f) => f.path === this.activeFile) ?? this.files[0];
    if (!current) return;

    const wrap = this.codeBodyEl.createDiv();
    wrap.style.cssText = "display:flex;height:100%;";

    const nums = wrap.createDiv();
    nums.style.cssText = "padding:12px 0;background:#030303;border-right:1px solid #0a0a0a;flex-shrink:0;user-select:none;";
    current.content.split("\n").forEach((_, i) => {
      const n = nums.createDiv();
      n.style.cssText = 'padding:0 9px;font-family:"JetBrains Mono",monospace;font-size:9px;line-height:1.7;color:#1a1a1a;text-align:right;min-width:32px;';
      n.setText(String(i + 1));
    });

    const pre = wrap.createEl("pre");
    pre.style.cssText = 'margin:0;padding:12px 16px;font-family:"JetBrains Mono",monospace;font-size:9px;line-height:1.7;color:#ccc;white-space:pre;flex:1;min-width:0;';
    pre.setText(current.content);
  }

  // ─── STATS STRIP ────────────────────────────────────────────────────────

  /** Render the session summary strip (click to expand the per-stage breakdown). */
  private renderStats(): void {
    if (!this.statsEl) return;
    const summary = summarize(this.stats);
    if (summary.stageCount === 0) {
      this.statsEl.empty();
      this.statsEl.style.display = "none";
      return;
    }

    this.statsEl.empty();
    this.statsEl.style.display = "block";

    const line = this.statsEl.createDiv();
    line.style.cssText = "padding:4px 10px;font-size:8px;letter-spacing:1px;color:#555;cursor:pointer;user-select:none;";
    line.setText(`${this.statsExpanded ? "▾" : "▸"} ${formatSummaryLine(summary)}`);

    if (this.statsExpanded) {
      const detail = this.statsEl.createDiv();
      detail.style.cssText = "padding:0 10px 6px;display:flex;flex-direction:column;gap:2px;";
      for (const stage of this.stats.stages) {
        const row = detail.createDiv();
        row.style.cssText = `font-size:8px;letter-spacing:1px;color:${stage.failed ? "#FF003C" : "#3a3a3a"};`;
        row.setText(formatStageLine(stage));
      }
    }
  }

  // ─── PIPELINE ───────────────────────────────────────────────────────────

  /**
   * Run one orchestration stage and record its statistics (tokens streamed,
   * wall-clock duration, provider/model actually used, success/failure) in the
   * session stats before returning or re-throwing.
   */
  private async runStage(
    task: TaskType,
    messages: ChatMessage[],
    stage: PipelineStage,
    signal: AbortSignal
  ): Promise<string> {
    const startedAt = Date.now();
    let failed = false;
    try {
      return await orchestrate(task, messages, this.plugin.settings, this.buildCallbacks(), signal);
    } catch (err) {
      failed = true;
      throw err;
    } finally {
      const stat: StageStat = {
        stage,
        provider: this.liveProvider,
        model: this.liveModel,
        tokens: this.stageTokens,
        durationMs: Date.now() - startedAt,
        failed,
      };
      this.sessionTokens += this.stageTokens;
      this.stageTokens = 0;
      recordStage(this.stats, stat);
      this.renderStats();
    }
  }

  private buildCallbacks(): OrchestratorCallbacks {
    return {
      onChunk: (text: string): void => {
        const last = this.messages[this.messages.length - 1];
        if (last?.role !== "assistant") return;
        last.content += text;
        this.stageTokens += estimateTokens(text);
        this.appendChunkToLastMsg();
        this.refreshExtractedFiles();
      },
      onProvider: (provider: string, model: string): void => {
        this.liveProvider = provider;
        this.liveModel = model;
        this.liveTokens = this.stageTokens;
        this.renderStageBar();
      },
      onFailover: (from: string, to: string, reason = "provider failed"): void => {
        const shortReason = reason.length > 140 ? `${reason.slice(0, 140)}…` : reason;
        new Notice(`fullKONK_>: ${from} failed (${shortReason}) → switching to ${to}`, 3000);
        // Discard streamed partial output from the failed provider so the next
        // completion starts cleanly rather than being concatenated onto it.
        const last = this.messages[this.messages.length - 1];
        if (last?.role === "assistant" && last.content) {
          last.content = "";
          this.appendChunkToLastMsg();
          this.refreshExtractedFiles();
        }
        this.renderStageBar();
      },
      onMetrics: (tps: number, total: number): void => {
        this.liveTps = tps;
        // `total` is the *current stage's* running token count as reported by
        // the orchestrator; keep whichever estimate is larger so chunk counting
        // and provider-reported accounting never regress or double-count. The
        // strip below the input shows the session-wide totals instead.
        this.stageTokens = Math.max(this.stageTokens, total);
        this.liveTokens = this.stageTokens;
        this.renderStageBar();
      },
    };
  }

  private refreshExtractedFiles(): void {
    const combined = this.messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content)
      .join("\n");
    const extracted = extractFiles(combined);
    const changed =
      extracted.length !== this.files.length ||
      extracted.some((f, i) => f.content !== this.files[i]?.content || f.path !== this.files[i]?.path);
    if (!changed) return;

    this.files = extracted;
    if (!this.activeFile || !extracted.some((file) => file.path === this.activeFile)) {
      this.activeFile = extracted[0]?.path ?? null;
    }
    this.renderFileTabs();
    this.renderCodeBody();
  }

  private addAssistantMessage(stage: PipelineStage): FKMessage {
    const msg: FKMessage = { id: generateId(), role: "assistant", content: "", stage, timestamp: Date.now() };
    this.messages.push(msg);
    this.appendMessage(msg);
    return msg;
  }

  private setStreamingUi(streaming: boolean): void {
    this.streaming = streaming;
    if (!this.sendBtnEl) return;
    if (streaming) {
      this.sendBtnEl.setText("■ STOP");
      this.sendBtnEl.style.background = "#FF003C";
      this.sendBtnEl.style.color = "#fff";
      this.sendBtnEl.onclick = (): void => this.stop();
    } else {
      this.sendBtnEl.setText("BUILD →");
      this.sendBtnEl.style.background = "#FFD700";
      this.sendBtnEl.style.color = "#000";
      this.sendBtnEl.onclick = (): void => {
        void this.send();
      };
    }
  }

  async send(): Promise<void> {
    if (!this.inputEl) return;
    const prompt = this.inputEl.value.trim();
    if (!prompt || this.streaming) return;

    this.inputEl.value = "";
    this.setStreamingUi(true);
    this.files = [];
    this.activeFile = null;
    this.liveTokens = 0;
    this.liveTps = 0;
    this.sessionTokens = 0;
    this.stageTokens = 0;
    startSession(this.stats);
    this.renderStats();
    this.renderCodeBody();

    this.abortCtrl = new AbortController();
    const signal = this.abortCtrl.signal;

    const userMsg: FKMessage = { id: generateId(), role: "user", content: prompt, timestamp: Date.now() };
    this.messages.push(userMsg);
    this.appendMessage(userMsg);

    try {
      if (this.mode === "review") {
        this.setStage("review");
        this.addAssistantMessage("review");
        await this.runStage(
          "review",
          asMessages([
            { role: "system", content: SYSTEM_PROMPTS.verify },
            { role: "user", content: prompt },
          ]),
          "review",
          signal
        );
        this.setStage("done");
      } else {
        this.setStage("architect");
        this.addAssistantMessage("architect");
        const archMsg = this.messages[this.messages.length - 1];
        await this.runStage(
          "architect",
          asMessages([
            { role: "system", content: SYSTEM_PROMPTS.architect },
            { role: "user", content: `Design architecture for: ${prompt}` },
          ]),
          "architect",
          signal
        );
        const architecture = archMsg.content;

        if (signal.aborted) return;

        let frontend = "";
        if (this.mode === "frontend" || this.mode === "fullstack") {
          this.setStage("frontend");
          this.addAssistantMessage("frontend");
          const feMsg = this.messages[this.messages.length - 1];
          await this.runStage(
            "frontend",
            asMessages([
              { role: "system", content: SYSTEM_PROMPTS.frontend },
              { role: "user", content: `Architecture:\n${architecture}\n\nBuild complete frontend.` },
            ]),
            "frontend",
            signal
          );
          frontend = feMsg.content;
        }

        if (this.mode === "fullstack" && !signal.aborted) {
          this.setStage("backend");
          this.addAssistantMessage("backend");
          const beMsg = this.messages[this.messages.length - 1];
          await this.runStage(
            "backend",
            asMessages([
              { role: "system", content: SYSTEM_PROMPTS.backend },
              { role: "user", content: `Architecture:\n${architecture}\n\nFrontend built. Build complete backend.` },
            ]),
            "backend",
            signal
          );
          const backend = beMsg.content;

          if (!signal.aborted) {
            this.setStage("verify");
            this.addAssistantMessage("verify");
            await this.runStage(
              "verify",
              asMessages([
                { role: "system", content: SYSTEM_PROMPTS.verify },
                {
                  role: "user",
                  content: `Architecture:\n${architecture}\n\nFrontend:\n${frontend}\n\nBackend:\n${backend}\n\nVerify and fix integration.`,
                },
              ]),
              "verify",
              signal
            );
          }
        } else if (this.mode === "backend") {
          this.setStage("backend");
          this.addAssistantMessage("backend");
          await this.runStage(
            "backend",
            asMessages([
              { role: "system", content: SYSTEM_PROMPTS.backend },
              { role: "user", content: `Architecture:\n${architecture}\n\nBuild complete backend.` },
            ]),
            "backend",
            signal
          );
        }

        this.setStage("done");
      }

      if (this.plugin.settings.saveHistory && this.messages.length > 0) {
        await this.vault
          .saveChatHistory(prompt.slice(0, 40), this.messages, this.mode, this.liveProvider, this.stats)
          .catch(() => {
            /* best-effort persistence; surfaced failures would be noisy on every send */
          });
      }
    } catch (err) {
      if (err instanceof AbortedError || (err instanceof Error && err.name === "AbortError")) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.setStage("error");
      new Notice(`fullKONK_>: ${message}`, 5000);
      const errMsg: FKMessage = {
        id: generateId(),
        role: "assistant",
        content: `ERROR: ${message}`,
        stage: "error",
        timestamp: Date.now(),
      };
      this.messages.push(errMsg);
      this.appendMessage(errMsg);
    } finally {
      this.setStreamingUi(false);
    }
  }

  // ─── HELPERS ────────────────────────────────────────────────────────────

  private setStage(stage: PipelineStage): void {
    this.stage = stage;
    this.renderStageBar();
  }

  stop(): void {
    this.abortCtrl?.abort();
    this.setStreamingUi(false);
    this.setStage("idle");
  }

  clear(): void {
    this.messages = [];
    this.files = [];
    this.activeFile = null;
    this.stage = "idle";
    this.liveProvider = "";
    this.liveModel = "";
    this.liveTokens = 0;
    this.liveTps = 0;
    this.sessionTokens = 0;
    this.stageTokens = 0;
    this.statsExpanded = false;
    this.stats = createSessionStats();
    this.renderEmpty();
    this.renderFileTabs();
    this.renderCodeBody();
    this.renderStageBar();
    this.renderStats();
  }

  private copyActiveFile(): void {
    const file = this.files.find((f) => f.path === this.activeFile) ?? this.files[0];
    if (!file) return;
    navigator.clipboard
      .writeText(file.content)
      .then(() => new Notice("Copied to clipboard"))
      .catch(() => {
        /* clipboard permission denied — silently ignore, non-critical UX affordance */
      });
  }

  /** Copy every generated file as one Markdown bundle (same format as `exportBundle`). */
  private copyAllFiles(): void {
    if (this.files.length === 0) {
      new Notice("No files to copy yet.");
      return;
    }
    const markdown = buildBundleMarkdown(this.currentProjectName(), this.files, timestampSlug());
    navigator.clipboard
      .writeText(markdown)
      .then(() => new Notice(`Copied ${this.files.length} files to clipboard`))
      .catch(() => {
        /* clipboard permission denied — silently ignore, non-critical UX affordance */
      });
  }

  /** Export every generated file as a single Markdown bundle note in the vault. */
  async exportBundle(): Promise<void> {
    if (this.files.length === 0) {
      new Notice("No files to export yet.");
      return;
    }
    try {
      const path = await this.vault.saveBundle(this.currentProjectName(), this.files);
      new Notice(`Exported bundle → ${path}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Export failed: ${message}`);
    }
  }

  /** Export every generated file as a `.zip` archive written into the vault. */
  async exportZip(): Promise<void> {
    if (this.files.length === 0) {
      new Notice("No files to export yet.");
      return;
    }
    try {
      const path = await this.vault.exportZip(this.currentProjectName(), this.files);
      new Notice(`Exported ZIP → ${path}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Export failed: ${message}`);
    }
  }

  /** Project name derived from the first user prompt (mirrors history/bundle naming). */
  private currentProjectName(): string {
    return (this.messages.find((m) => m.role === "user")?.content ?? "fullkonk-output").slice(0, 40);
  }

  async saveToVault(): Promise<void> {
    if (this.files.length === 0) {
      new Notice("No files to save yet.");
      return;
    }
    try {
      const folder = await this.vault.saveGeneratedFiles(this.currentProjectName(), this.files);
      new Notice(`Saved ${this.files.length} files to ${folder}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Save failed: ${message}`);
    }
  }

  // ─── Test-only accessors ────────────────────────────────────────────────
  // Exposed narrowly so unit tests can assert on internal pipeline state
  // without reaching into private fields directly.

  getMessagesSnapshot(): readonly FKMessage[] {
    return this.messages;
  }

  getFilesSnapshot(): readonly GeneratedFile[] {
    return this.files;
  }

  getStage(): PipelineStage {
    return this.stage;
  }

  isStreaming(): boolean {
    return this.streaming;
  }

  getStageStatsSnapshot(): readonly StageStat[] {
    return this.stats.stages;
  }

  getStatsLine(): string {
    return formatSummaryLine(summarize(this.stats));
  }
}

function asMessages(messages: { role: ChatMessage["role"]; content: string }[]): ChatMessage[] {
  return messages;
}
