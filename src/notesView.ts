// src/notesView.ts
//
// A vault-native workspace for finding, reading, editing, and organizing notes.
// Edits and organization actions are staged in the view, previewed, and only
// written after an explicit Apply action.

import { Component, ItemView, MarkdownRenderer, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type FullKonkPlugin from "./main";
import { orchestrate } from "./orchestrator";
import {
  MarkdownFormat,
  MetadataPlanItem,
  MovePlanItem,
  NoteRecord,
  NoteSortField,
  SortDirection,
  buildMetadataPlan,
  buildMovePlan,
  filterAndSortNotes,
  formatSelection,
  parseTagInput,
} from "./notes";
import { VaultNotesManager } from "./notesManager";

export const NOTES_VIEW_TYPE = "fullkonk-notes-view";
const MAX_AI_NOTE_LENGTH = 32_000;
const FORMATTERS: { format: MarkdownFormat; label: string }[] = [
  { format: "bold", label: "BOLD" },
  { format: "italic", label: "ITALIC" },
  { format: "strike", label: "STRIKE" },
  { format: "code", label: "CODE" },
  { format: "link", label: "LINK" },
  { format: "h1", label: "H1" },
  { format: "h2", label: "H2" },
];

type NotesPanel = "move" | "metadata" | "ai" | null;
type AiAction = "summarize" | "rewrite";

interface PendingEdit {
  file: TFile;
  before: string;
  after: string;
}

export class VaultNotesView extends ItemView {
  private readonly plugin: FullKonkPlugin;
  private readonly notesManager: VaultNotesManager;
  private notes: NoteRecord[] = [];
  private filteredNotes: NoteRecord[] = [];
  private selectedPaths = new Set<string>();
  private activePath: string | null = null;
  private originalContent: string | null = null;
  private draftContent: string | null = null;
  private pendingEdit: PendingEdit | null = null;
  private pendingMove: MovePlanItem[] | null = null;
  private pendingMetadata: MetadataPlanItem[] | null = null;
  private panel: NotesPanel = null;
  private sortBy: NoteSortField = "modified";
  private direction: SortDirection = "desc";
  private listRequestId = 0;
  private bodySearchCache = new Map<string, { mtime: number; size: number; content: string }>();
  private aiAction: AiAction = "summarize";
  private aiConsent = false;
  private aiLoading = false;
  private aiRequestId = 0;
  private aiResult = "";
  private aiError = "";
  private aiAbortController: AbortController | null = null;

  private searchEl: HTMLInputElement | null = null;
  private contentSearchEl: HTMLInputElement | null = null;
  private tagFilterEl: HTMLInputElement | null = null;
  private categoryFilterEl: HTMLInputElement | null = null;
  private listEl: HTMLElement | null = null;
  private listStatusEl: HTMLElement | null = null;
  private clearSelectionBtn: HTMLButtonElement | null = null;
  private detailEl: HTMLElement | null = null;
  private editorEl: HTMLTextAreaElement | null = null;
  private renderedComponent: Component | null = null;
  private aiOutputEl: HTMLElement | null = null;
  private aiStatusEl: HTMLElement | null = null;

  private moveFolderDraft = "";
  private moveNameDraft = "";
  private tagDraft = "";
  private tagAction: "add" | "remove" = "add";
  private categoryDraft = "";
  private clearCategoryDraft = false;

  constructor(leaf: WorkspaceLeaf, plugin: FullKonkPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.notesManager = new VaultNotesManager(plugin.app);
  }

  getViewType(): string {
    return NOTES_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Vault & Notes";
  }

  override getIcon(): string {
    return "book-open";
  }

  override async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("fk-notes-root");
    this.buildHeader(root);
    this.buildToolbar(root);

    const layout = root.createDiv({ cls: "fk-notes-layout" });
    const listPane = layout.createDiv({ cls: "fk-notes-list-pane" });
    const listHeading = listPane.createDiv({ cls: "fk-notes-list-heading" });
    listHeading.createSpan({ text: "VAULT NOTES" });
    this.listStatusEl = listHeading.createSpan({ cls: "fk-notes-list-status", text: "Loading…" });
    this.clearSelectionBtn = listHeading.createEl("button", {
      cls: "fk-notes-clear-selection",
      text: "CLEAR",
      attr: { type: "button", "aria-label": "Clear note selection" },
    });
    this.clearSelectionBtn.onclick = (): void => {
      this.selectedPaths.clear();
      this.renderList();
      this.renderDetail();
    };
    this.listEl = listPane.createDiv({ cls: "fk-notes-list" });
    this.detailEl = layout.createDiv({ cls: "fk-notes-detail" });

    await this.refreshNotes();
  }

  override async onClose(): Promise<void> {
    this.aiRequestId++;
    this.aiAbortController?.abort();
    this.aiAbortController = null;
    this.aiLoading = false;
    this.clearRenderedComponent();
  }

  /** Refresh the vault index and keep the current selection when possible. */
  async refreshNotes(): Promise<void> {
    this.notes = this.notesManager.listNotes();
    const existing = new Set(this.notes.map((note) => note.file.path));
    this.selectedPaths = new Set([...this.selectedPaths].filter((path) => existing.has(path)));
    if (this.activePath && !existing.has(this.activePath)) {
      this.activePath = null;
      this.originalContent = null;
      this.draftContent = null;
    }
    await this.refreshList();
    this.renderDetail();
  }

  private async reloadWorkspace(): Promise<void> {
    if (this.aiLoading) {
      new Notice("Cancel the active AI request before refreshing.");
      return;
    }
    if (this.hasPendingPreview() || this.draftContent !== null) {
      new Notice("Apply/cancel the pending preview or discard the draft before refreshing.");
      return;
    }
    this.bodySearchCache.clear();
    await this.refreshNotes();
    const active = this.activeRecord;
    if (!active) return;
    try {
      this.originalContent = await this.notesManager.readNote(active.file);
      this.renderDetail();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not refresh note: ${message}`);
    }
  }

  private buildHeader(root: HTMLElement): void {
    const header = root.createDiv({ cls: "fk-notes-header" });
    const brand = header.createDiv({ cls: "fk-notes-brand" });
    brand.createSpan({ text: "fullKONK" });
    brand.createSpan({ text: " / VAULT & NOTES" });

    const refreshButton = header.createEl("button", { cls: "fk-notes-button", text: "↻ REFRESH" });
    refreshButton.onclick = (): void => {
      void this.reloadWorkspace();
    };
    const builderButton = header.createEl("button", { cls: "fk-notes-button", text: "⚡ BUILDER" });
    builderButton.onclick = (): void => {
      void this.plugin.activateView();
    };
  }

  private buildToolbar(root: HTMLElement): void {
    const toolbar = root.createDiv({ cls: "fk-notes-toolbar" });
    this.searchEl = toolbar.createEl("input", {
      cls: "fk-notes-search",
      attr: { type: "search", "aria-label": "Search notes", placeholder: "Search notes, paths, tags…" },
    });
    this.searchEl.addEventListener("input", () => void this.refreshList());

    const sortLabel = toolbar.createEl("label", { cls: "fk-notes-sort-label", text: "Sort" });
    const sortSelect = sortLabel.createEl("select", { cls: "fk-notes-select" });
    const sortOptions: [NoteSortField, string][] = [
      ["modified", "Modified"],
      ["name", "Name"],
      ["created", "Created"],
      ["path", "Path"],
    ];
    for (const [value, label] of sortOptions) {
      sortSelect.createEl("option", { text: label, attr: { value } });
    }
    sortSelect.value = this.sortBy;
    sortSelect.addEventListener("change", () => {
      this.sortBy = sortSelect.value as NoteSortField;
      void this.refreshList();
    });

    const directionButton = toolbar.createEl("button", { cls: "fk-notes-button", text: "↓ DESC" });
    directionButton.title = "Toggle sort direction";
    directionButton.onclick = (): void => {
      this.direction = this.direction === "desc" ? "asc" : "desc";
      directionButton.setText(this.direction === "desc" ? "↓ DESC" : "↑ ASC");
      void this.refreshList();
    };

    const contentLabel = toolbar.createEl("label", { cls: "fk-notes-checkbox-label" });
    this.contentSearchEl = contentLabel.createEl("input", { attr: { type: "checkbox" } });
    contentLabel.createSpan({ text: "Search inside notes" });
    this.contentSearchEl.addEventListener("change", () => void this.refreshList());

    this.tagFilterEl = toolbar.createEl("input", {
      cls: "fk-notes-filter",
      attr: { type: "search", placeholder: "Filter tag" },
    });
    this.tagFilterEl.setAttribute("aria-label", "Filter by tag");
    this.tagFilterEl.addEventListener("input", () => void this.refreshList());

    this.categoryFilterEl = toolbar.createEl("input", {
      cls: "fk-notes-filter",
      attr: { type: "search", placeholder: "Filter category" },
    });
    this.categoryFilterEl.setAttribute("aria-label", "Filter by category");
    this.categoryFilterEl.addEventListener("input", () => void this.refreshList());
  }

  private async refreshList(): Promise<void> {
    const requestId = ++this.listRequestId;
    const query = this.searchEl?.value.trim() ?? "";
    const tag = this.tagFilterEl?.value ?? "";
    const category = this.categoryFilterEl?.value ?? "";
    const contentSearch = this.contentSearchEl?.checked ?? false;
    let results: NoteRecord[];

    const filterOptions = {
      tag,
      category,
      sortBy: this.sortBy,
      direction: this.direction,
    };

    if (query && contentSearch) {
      this.listStatusEl?.setText("Searching content…");
      const candidates = filterAndSortNotes(this.notes, filterOptions);
      const enriched: NoteRecord[] = [];
      const chunkSize = 12;
      for (let offset = 0; offset < candidates.length; offset += chunkSize) {
        const chunk = candidates.slice(offset, offset + chunkSize);
        const loaded = await Promise.all(
          chunk.map(async (note) => ({
            ...note,
            bodyText: await this.getSearchBody(note.file),
          }))
        );
        enriched.push(...loaded);
        if (requestId !== this.listRequestId) return;
      }
      results = filterAndSortNotes(enriched, { ...filterOptions, query });
    } else {
      results = filterAndSortNotes(this.notes, { ...filterOptions, query });
    }

    if (requestId !== this.listRequestId) return;
    this.filteredNotes = results;
    this.renderList();
  }

  private async getSearchBody(file: TFile): Promise<string> {
    const cached = this.bodySearchCache.get(file.path);
    if (cached?.mtime === file.stat.mtime && cached.size === file.stat.size) return cached.content;
    try {
      const content = await this.notesManager.readNoteForSearch(file);
      this.bodySearchCache.set(file.path, { mtime: file.stat.mtime, size: file.stat.size, content });
      return content;
    } catch {
      return "";
    }
  }

  private renderList(): void {
    if (!this.listEl || !this.listStatusEl) return;
    this.listEl.empty();
    this.listStatusEl.setText(`${this.filteredNotes.length} notes · ${this.selectedPaths.size} selected`);
    if (this.clearSelectionBtn) this.clearSelectionBtn.style.display = this.selectedPaths.size > 0 ? "inline-flex" : "none";

    if (this.filteredNotes.length === 0) {
      this.listEl.createDiv({ cls: "fk-notes-empty", text: this.notes.length ? "No notes match these filters." : "No Markdown notes found in this vault." });
      return;
    }

    for (const note of this.filteredNotes) {
      const row = this.listEl.createDiv({ cls: "fk-note-row" });
      row.toggleClass("is-active", note.file.path === this.activePath);
      const checkbox = row.createEl("input", { attr: { type: "checkbox", "aria-label": `Select ${note.file.path}` } });
      checkbox.checked = this.selectedPaths.has(note.file.path);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selectedPaths.add(note.file.path);
        else this.selectedPaths.delete(note.file.path);
        if (checkbox.checked && !this.activePath) {
          void this.selectNote(note.file);
          return;
        }
        this.renderList();
        this.renderDetail();
      });

      const selectButton = row.createEl("button", { cls: "fk-note-select", attr: { type: "button" } });
      selectButton.createSpan({ cls: "fk-note-title", text: note.file.basename });
      selectButton.createSpan({ cls: "fk-note-path", text: note.file.path });
      const meta = [
        ...note.tags.slice(0, 3).map((tag) => `#${tag}`),
        ...(note.category ? [`· ${note.category}`] : []),
      ];
      if (meta.length) selectButton.createSpan({ cls: "fk-note-meta", text: meta.join("  ") });
      selectButton.onclick = (): void => {
        void this.selectNote(note.file);
      };
    }
  }

  private async selectNote(file: TFile): Promise<void> {
    if (this.aiLoading) {
      if (file.path === this.activePath) return;
      this.invalidateAiAction();
    }
    if (this.hasPendingPreview() && file.path !== this.activePath) {
      new Notice("Cancel or apply the pending preview before switching notes.");
      return;
    }
    if (this.draftContent !== null && this.originalContent !== null && this.draftContent !== this.originalContent) {
      new Notice("Preview or discard your draft before switching notes.");
      return;
    }

    this.activePath = file.path;
    this.originalContent = null;
    this.draftContent = null;
    this.pendingEdit = null;
    this.panel = null;
    this.pendingMove = null;
    this.pendingMetadata = null;
    this.aiResult = "";
    this.aiError = "";
    this.aiConsent = false;
    this.renderList();
    this.renderDetail();
    try {
      const content = await this.notesManager.readNote(file);
      if (this.activePath !== file.path) return;
      this.originalContent = content;
      this.renderDetail();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not read note: ${message}`);
    }
  }

  private get activeRecord(): NoteRecord | undefined {
    return this.notes.find((note) => note.file.path === this.activePath);
  }

  private get operationRecords(): NoteRecord[] {
    const selected = this.notes.filter((note) => this.selectedPaths.has(note.file.path));
    if (selected.length) return selected;
    const active = this.activeRecord;
    return active ? [active] : [];
  }

  private hasPendingPreview(): boolean {
    return this.pendingEdit !== null || this.pendingMove !== null || this.pendingMetadata !== null;
  }

  private togglePanel(panel: Exclude<NotesPanel, null>): void {
    if (this.aiLoading) {
      new Notice("Cancel the active AI request before switching actions.");
      return;
    }
    if (this.hasPendingPreview()) {
      new Notice("Apply or cancel the current preview before starting another action.");
      return;
    }
    if (
      panel !== "ai" &&
      this.draftContent !== null &&
      this.originalContent !== null &&
      this.draftContent !== this.originalContent
    ) {
      new Notice("Preview or discard your draft before moving or changing metadata.");
      return;
    }
    if (!this.activeRecord) {
      new Notice("Select a note first.");
      return;
    }
    this.panel = this.panel === panel ? null : panel;
    this.renderDetail();
  }

  private renderDetail(): void {
    if (!this.detailEl) return;
    this.clearRenderedComponent();
    this.detailEl.empty();
    this.editorEl = null;
    this.aiOutputEl = null;
    this.aiStatusEl = null;

    const record = this.activeRecord;
    if (!record) {
      const empty = this.detailEl.createDiv({ cls: "fk-notes-empty-detail" });
      empty.createDiv({ text: "Choose a note to read or edit." });
      empty.createDiv({ text: "Select checkboxes for batch moves, tags, and categories.", cls: "fk-notes-muted" });
      return;
    }

    const heading = this.detailEl.createDiv({ cls: "fk-notes-detail-heading" });
    heading.createDiv({ cls: "fk-notes-detail-title", text: record.file.basename });
    heading.createDiv({ cls: "fk-notes-detail-path", text: record.file.path });
    const metadataLine = [
      record.category ? `Category: ${record.category}` : "No category",
      record.tags.length ? record.tags.map((tag) => `#${tag}`).join("  ") : "No tags",
    ].join("  ·  ");
    heading.createDiv({ cls: "fk-notes-detail-meta", text: metadataLine });

    const actions = this.detailEl.createDiv({ cls: "fk-notes-actions" });
    this.actionButton(actions, "OPEN IN OBSIDIAN", () => this.openInObsidian(record.file));
    this.actionButton(actions, "EDIT / FORMAT", () => this.beginEdit());
    this.actionButton(actions, "MOVE / RENAME", () => this.togglePanel("move"));
    this.actionButton(actions, "TAGS / CATEGORY", () => this.togglePanel("metadata"));
    this.actionButton(actions, "AI ASSIST", () => this.togglePanel("ai"));

    if (this.pendingEdit) this.renderEditPreview(this.detailEl);
    else if (this.draftContent !== null) this.renderEditor(this.detailEl);
    else if (this.originalContent === null) this.detailEl.createDiv({ cls: "fk-notes-empty", text: "Reading note…" });
    else this.renderMarkdownNote(record, this.originalContent, this.detailEl);

    if (this.panel === "move") this.renderMovePanel(this.detailEl);
    else if (this.panel === "metadata") this.renderMetadataPanel(this.detailEl);
    else if (this.panel === "ai") this.renderAiPanel(this.detailEl);
  }

  private renderMarkdownNote(record: NoteRecord, content: string, parent: HTMLElement): void {
    const rendered = parent.createDiv({ cls: "fk-notes-rendered-content" });
    const component = this.addChild(new Component());
    this.renderedComponent = component;
    void MarkdownRenderer.render(this.plugin.app, content, rendered, record.file.path, component).catch(() => {
      if (rendered.isConnected) rendered.setText(content);
    });
  }

  private clearRenderedComponent(): void {
    if (!this.renderedComponent) return;
    this.removeChild(this.renderedComponent);
    this.renderedComponent = null;
  }

  private actionButton(parent: HTMLElement, label: string, onClick: () => void): void {
    const button = parent.createEl("button", { cls: "fk-notes-button", text: label });
    button.onclick = onClick;
  }

  private openInObsidian(file: TFile): void {
    const leaf = this.plugin.app.workspace.getLeaf(true);
    void leaf.openFile(file).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not open note: ${message}`);
    });
  }

  private async beginEdit(): Promise<void> {
    const record = this.activeRecord;
    if (!record) return;
    if (this.aiLoading) {
      new Notice("Cancel the active AI request before editing.");
      return;
    }
    if (this.hasPendingPreview()) {
      new Notice("Apply or cancel the current preview before editing.");
      return;
    }
    if (this.draftContent !== null) {
      new Notice("A draft is already open. Preview or discard it first.");
      return;
    }
    if (this.originalContent === null) {
      new Notice("Wait for the note to finish loading.");
      return;
    }
    this.draftContent = this.originalContent;
    this.panel = null;
    this.renderDetail();
  }

  private renderEditor(parent: HTMLElement): void {
    const editorPane = parent.createDiv({ cls: "fk-notes-editor-pane" });
    const formatter = editorPane.createDiv({ cls: "fk-notes-format-toolbar" });
    for (const item of FORMATTERS) {
      this.actionButton(formatter, item.label, () => this.applyFormat(item.format));
    }

    this.editorEl = editorPane.createEl("textarea", {
      cls: "fk-notes-editor",
      attr: { "aria-label": "Edit note Markdown", spellcheck: "false" },
    });
    this.editorEl.value = this.draftContent ?? "";
    this.editorEl.addEventListener("input", () => {
      this.draftContent = this.editorEl?.value ?? "";
    });

    const buttons = editorPane.createDiv({ cls: "fk-notes-preview-actions" });
    this.actionButton(buttons, "PREVIEW CHANGES", () => this.previewEdit());
    this.actionButton(buttons, "DISCARD DRAFT", () => this.discardDraft());
    editorPane.createDiv({ cls: "fk-notes-hint", text: "Formatting and edits remain a draft until you review and apply them." });
  }

  private applyFormat(format: MarkdownFormat): void {
    const editor = this.editorEl;
    if (!editor) return;
    const result = formatSelection(editor.value, editor.selectionStart, editor.selectionEnd, format);
    editor.value = result.content;
    editor.setSelectionRange(result.selectionStart, result.selectionEnd);
    editor.focus();
    this.draftContent = result.content;
  }

  private previewEdit(): void {
    if (this.pendingMove || this.pendingMetadata) {
      new Notice("Cancel the other pending preview before reviewing this edit.");
      return;
    }
    const record = this.activeRecord;
    if (!record || this.originalContent === null || this.editorEl === null) return;
    const after = this.editorEl.value;
    if (after === this.originalContent) {
      new Notice("There are no changes to preview.");
      return;
    }
    this.draftContent = after;
    this.pendingEdit = { file: record.file, before: this.originalContent, after };
    this.renderDetail();
  }

  private renderEditPreview(parent: HTMLElement): void {
    const preview = parent.createDiv({ cls: "fk-notes-preview" });
    preview.createDiv({ cls: "fk-notes-preview-title", text: "REVIEW NOTE EDIT" });
    const comparison = preview.createDiv({ cls: "fk-notes-comparison" });
    const before = comparison.createDiv({ cls: "fk-notes-comparison-pane" });
    before.createDiv({ cls: "fk-notes-comparison-label", text: "BEFORE" });
    before.createEl("pre", { text: this.pendingEdit?.before ?? "" });
    const after = comparison.createDiv({ cls: "fk-notes-comparison-pane" });
    after.createDiv({ cls: "fk-notes-comparison-label", text: "PROPOSED" });
    after.createEl("pre", { text: this.pendingEdit?.after ?? "" });
    const controls = preview.createDiv({ cls: "fk-notes-preview-actions" });
    this.actionButton(controls, "APPLY EDIT", () => void this.applyEdit());
    this.actionButton(controls, "BACK TO EDITOR", () => {
      this.pendingEdit = null;
      this.renderDetail();
    });
    preview.createDiv({ cls: "fk-notes-hint", text: "The vault is unchanged until you choose APPLY EDIT." });
  }

  private async applyEdit(): Promise<void> {
    const pending = this.pendingEdit;
    if (!pending) return;
    try {
      await this.notesManager.saveNote(pending.file, pending.before, pending.after);
      this.originalContent = pending.after;
      this.draftContent = null;
      this.pendingEdit = null;
      this.bodySearchCache.delete(pending.file.path);
      new Notice(`Updated ${pending.file.path}`);
      await this.refreshNotes();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Edit not applied: ${message}`);
    }
  }

  private discardDraft(): void {
    this.draftContent = null;
    this.pendingEdit = null;
    this.renderDetail();
  }

  private renderMovePanel(parent: HTMLElement): void {
    const panel = parent.createDiv({ cls: "fk-notes-action-panel" });
    panel.createDiv({ cls: "fk-notes-panel-title", text: "MOVE OR RENAME" });
    const records = this.operationRecords;
    panel.createDiv({ cls: "fk-notes-hint", text: records.length > 1
      ? `${records.length} selected notes will keep their filenames.`
      : "Choose a destination folder; optionally rename this note." });

    const folder = panel.createEl("input", {
      cls: "fk-notes-input",
      attr: { type: "text", placeholder: "Destination folder (vault-relative; blank = vault root)" },
    });
    folder.value = this.moveFolderDraft;
    folder.addEventListener("input", () => (this.moveFolderDraft = folder.value));
    const name = panel.createEl("input", {
      cls: "fk-notes-input",
      attr: { type: "text", placeholder: records.length > 1 ? "Rename disabled for batch moves" : "Optional new name (without extension)" },
    });
    name.value = this.moveNameDraft;
    name.disabled = records.length > 1;
    name.addEventListener("input", () => (this.moveNameDraft = name.value));

    if (this.pendingMove) {
      const preview = panel.createDiv({ cls: "fk-notes-operation-preview" });
      preview.createDiv({ cls: "fk-notes-preview-title", text: "MOVE PREVIEW" });
      for (const item of this.pendingMove) {
        preview.createDiv({ cls: "fk-notes-plan-row", text: `${item.sourcePath}  →  ${item.targetPath}` });
      }
      const controls = panel.createDiv({ cls: "fk-notes-preview-actions" });
      this.actionButton(controls, "APPLY MOVES", () => void this.applyMoves());
      this.actionButton(controls, "CANCEL", () => {
        this.pendingMove = null;
        this.renderDetail();
      });
    } else {
      this.actionButton(panel, "PREVIEW MOVE", () => this.previewMove());
    }
  }

  private previewMove(): void {
    if (this.pendingEdit || this.pendingMetadata) {
      new Notice("Cancel the other pending preview before reviewing these moves.");
      return;
    }
    const records = this.operationRecords;
    if (!records.length) {
      new Notice("Select at least one note to move.");
      return;
    }
    try {
      const plan = buildMovePlan(
        records.map((record) => record.file.path),
        this.moveFolderDraft,
        this.moveNameDraft
      );
      this.notesManager.validateMovePlan(plan);
      if (plan.every((item) => item.sourcePath === item.targetPath)) {
        new Notice("The selected notes are already in that location.");
        return;
      }
      this.pendingMove = plan;
      this.renderDetail();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Move preview failed: ${message}`);
    }
  }

  private async applyMoves(): Promise<void> {
    const plan = this.pendingMove;
    if (!plan) return;
    try {
      const moved = await this.notesManager.moveNotes(plan);
      this.pendingMove = null;
      this.panel = null;
      for (const item of plan) this.bodySearchCache.delete(item.sourcePath);
      const primaryTarget = plan.find((item) => item.sourcePath !== item.targetPath)?.targetPath ?? null;
      this.activePath = primaryTarget;
      this.originalContent = null;
      this.draftContent = null;
      this.selectedPaths = new Set(plan.map((item) => item.targetPath));
      new Notice(`Moved ${moved} ${moved === 1 ? "note" : "notes"}.`);
      await this.refreshNotes();
      const active = this.notes.find((note) => note.file.path === primaryTarget);
      if (active) await this.selectNote(active.file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Move not applied: ${message}`);
    }
  }

  private renderMetadataPanel(parent: HTMLElement): void {
    const panel = parent.createDiv({ cls: "fk-notes-action-panel" });
    panel.createDiv({ cls: "fk-notes-panel-title", text: "TAGS & CATEGORY" });
    const records = this.operationRecords;
    panel.createDiv({ cls: "fk-notes-hint", text: `${records.length} note${records.length === 1 ? "" : "s"} will be updated. Tags and category are stored in YAML frontmatter.` });

    const tagRow = panel.createDiv({ cls: "fk-notes-input-row" });
    const action = tagRow.createEl("select", { cls: "fk-notes-select" });
    action.createEl("option", { text: "Add tags", attr: { value: "add" } });
    action.createEl("option", { text: "Remove tags", attr: { value: "remove" } });
    action.value = this.tagAction;
    action.addEventListener("change", () => (this.tagAction = action.value as "add" | "remove"));
    const tags = tagRow.createEl("input", {
      cls: "fk-notes-input",
      attr: { type: "text", placeholder: "Tags, separated by commas or new lines" },
    });
    tags.value = this.tagDraft;
    tags.addEventListener("input", () => (this.tagDraft = tags.value));

    const category = panel.createEl("input", {
      cls: "fk-notes-input",
      attr: { type: "text", placeholder: "Set category (leave blank to keep existing)" },
    });
    category.value = this.categoryDraft;
    category.addEventListener("input", () => (this.categoryDraft = category.value));
    const clearRow = panel.createEl("label", { cls: "fk-notes-checkbox-label" });
    const clear = clearRow.createEl("input", { attr: { type: "checkbox" } });
    clear.checked = this.clearCategoryDraft;
    clear.addEventListener("change", () => (this.clearCategoryDraft = clear.checked));
    clearRow.createSpan({ text: "Clear category" });

    if (this.pendingMetadata) {
      const preview = panel.createDiv({ cls: "fk-notes-operation-preview" });
      preview.createDiv({ cls: "fk-notes-preview-title", text: "METADATA PREVIEW" });
      for (const item of this.pendingMetadata) {
        preview.createDiv({ cls: "fk-notes-plan-row", text: item.path });
        preview.createDiv({ cls: "fk-notes-plan-detail", text: `Tags: ${displayList(item.before.tags)}  →  ${displayList(item.after.tags)}` });
        preview.createDiv({ cls: "fk-notes-plan-detail", text: `Category: ${item.before.category || "—"}  →  ${item.after.category || "—"}` });
      }
      const controls = panel.createDiv({ cls: "fk-notes-preview-actions" });
      this.actionButton(controls, "APPLY METADATA", () => void this.applyMetadata());
      this.actionButton(controls, "CANCEL", () => {
        this.pendingMetadata = null;
        this.renderDetail();
      });
    } else {
      this.actionButton(panel, "PREVIEW METADATA", () => this.previewMetadata());
    }
  }

  private previewMetadata(): void {
    if (this.pendingEdit || this.pendingMove) {
      new Notice("Cancel the other pending preview before reviewing metadata.");
      return;
    }
    const records = this.operationRecords;
    if (!records.length) {
      new Notice("Select at least one note to update.");
      return;
    }
    const spec: { tagAction?: "add" | "remove"; tags?: string[]; category?: string | null } = {};
    const tags = parseTagInput(this.tagDraft);
    if (tags.length) {
      spec.tagAction = this.tagAction;
      spec.tags = tags;
    }
    if (this.clearCategoryDraft) spec.category = null;
    else if (this.categoryDraft.trim()) spec.category = this.categoryDraft.trim();

    const plans = buildMetadataPlan(records, spec);
    if (plans.every((item) => sameMetadata(item.before, item.after))) {
      new Notice("There are no metadata changes to preview.");
      return;
    }
    this.pendingMetadata = plans;
    this.renderDetail();
  }

  private async applyMetadata(): Promise<void> {
    const plans = this.pendingMetadata;
    if (!plans) return;
    try {
      const count = await this.notesManager.applyMetadata(plans);
      this.pendingMetadata = null;
      this.panel = null;
      this.tagDraft = "";
      this.categoryDraft = "";
      this.clearCategoryDraft = false;
      for (const plan of plans) this.bodySearchCache.delete(plan.path);
      new Notice(`Updated tags/category on ${count} ${count === 1 ? "note" : "notes"}.`);
      const priorActivePath = this.activePath;
      await this.refreshNotes();
      if (priorActivePath && plans.some((plan) => plan.path === priorActivePath)) {
        const active = this.notes.find((note) => note.file.path === priorActivePath);
        if (active) {
          this.originalContent = null;
          await this.selectNote(active.file);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Metadata not applied: ${message}`);
    }
  }

  private renderAiPanel(parent: HTMLElement): void {
    const panel = parent.createDiv({ cls: "fk-notes-action-panel" });
    panel.createDiv({ cls: "fk-notes-panel-title", text: "AI NOTE ASSISTANT" });
    panel.createDiv({ cls: "fk-notes-privacy", text: "The active note's path and Markdown are sent to the configured AI provider only when you run this action. Nothing is changed in the vault unless you later preview and apply an edit." });

    const select = panel.createEl("select", { cls: "fk-notes-select" });
    select.createEl("option", { text: "Summarize this note", attr: { value: "summarize" } });
    select.createEl("option", { text: "Rewrite / improve clarity and formatting", attr: { value: "rewrite" } });
    select.value = this.aiAction;
    select.disabled = this.aiLoading;
    select.addEventListener("change", () => {
      this.aiAction = select.value as AiAction;
      this.aiResult = "";
      this.aiError = "";
      this.renderDetail();
    });

    const consentLabel = panel.createEl("label", { cls: "fk-notes-checkbox-label" });
    const consent = consentLabel.createEl("input", { attr: { type: "checkbox" } });
    consent.checked = this.aiConsent;
    consent.disabled = this.aiLoading;
    consent.addEventListener("change", () => (this.aiConsent = consent.checked));
    consentLabel.createSpan({ text: "I understand this note will be sent to an AI provider." });

    if (this.aiLoading) {
      const cancel = panel.createEl("button", { cls: "fk-notes-button", text: "CANCEL AI" });
      cancel.onclick = (): void => this.cancelAiAction();
    } else {
      const run = panel.createEl("button", { cls: ["fk-notes-button", "fk-notes-primary-button"], text: "RUN AI" });
      run.onclick = (): void => {
        void this.runAiAction();
      };
    }

    this.aiStatusEl = panel.createDiv({ cls: "fk-notes-ai-status" });
    this.aiOutputEl = panel.createEl("pre", { cls: "fk-notes-ai-result", text: this.aiResult });
    if (this.aiError) this.aiStatusEl.setText(this.aiError);
    else if (this.aiLoading) this.aiStatusEl.setText("Waiting for a provider…");

    if (this.aiResult && !this.aiLoading) {
      const useResult = panel.createEl("button", {
        cls: "fk-notes-button",
        text: this.aiAction === "summarize" ? "INSERT SUMMARY INTO DRAFT" : "USE REWRITE AS DRAFT",
      });
      useResult.onclick = (): void => this.useAiResult();
    }
  }

  private async runAiAction(): Promise<void> {
    if (this.aiLoading) return;
    const record = this.activeRecord;
    if (!record || this.originalContent === null) {
      new Notice("Select a loaded note before using AI.");
      return;
    }
    if (!this.aiConsent) {
      new Notice("Confirm that you want to send this note to an AI provider.");
      return;
    }
    const noteText = this.draftContent ?? this.originalContent;
    if (noteText.length > MAX_AI_NOTE_LENGTH) {
      new Notice(`AI note actions are limited to ${MAX_AI_NOTE_LENGTH.toLocaleString()} characters. Trim the draft first.`);
      return;
    }

    const system = this.aiAction === "summarize"
      ? "Summarize the user's Obsidian Markdown note. Preserve its important facts, decisions, and open questions. Do not invent information. Return a concise, useful Markdown summary only."
      : "Improve the user's Obsidian Markdown note for clarity, structure, and formatting while preserving its meaning, wikilinks, code, and YAML frontmatter. Return the complete revised note only; do not wrap it in a Markdown code fence and do not add commentary.";
    const user = `Note path: ${record.file.path}\n\nNOTE CONTENT START\n${noteText}\nNOTE CONTENT END`;

    this.aiLoading = true;
    this.aiRequestId += 1;
    const requestId = this.aiRequestId;
    this.aiResult = "";
    this.aiError = "";
    this.renderDetail();
    const signalController = new AbortController();
    this.aiAbortController = signalController;
    try {
      const completion = await orchestrate(
        "review",
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        this.plugin.settings,
        {
          onChunk: (chunk: string): void => {
            if (requestId !== this.aiRequestId) return;
            this.aiResult += chunk;
            if (this.aiOutputEl) this.aiOutputEl.setText(this.aiResult);
          },
          onProvider: (provider: string, model: string): void => {
            if (requestId === this.aiRequestId && this.aiStatusEl) {
              this.aiStatusEl.setText(`Using ${provider} / ${model}…`);
            }
          },
          onFailover: (from: string, to: string): void => {
            if (requestId === this.aiRequestId && this.aiStatusEl) {
              this.aiStatusEl.setText(`${from} failed; switching to ${to}…`);
            }
          },
          onMetrics: (): void => undefined,
        },
        signalController.signal
      );
      if (requestId !== this.aiRequestId) return;
      if (!this.aiResult.trim()) this.aiResult = completion;
      if (!this.aiResult.trim()) throw new Error("The provider returned an empty response.");
      this.aiResult = stripOuterFence(this.aiResult.trim());
      new Notice("AI result ready. Review it before using it in a note.");
    } catch (error) {
      if (requestId !== this.aiRequestId) return;
      this.aiError = error instanceof Error ? error.message : String(error);
      if (this.aiStatusEl) this.aiStatusEl.setText(`AI request failed: ${this.aiError}`);
    } finally {
      if (requestId === this.aiRequestId) {
        this.aiLoading = false;
        this.aiAbortController = null;
        this.renderDetail();
      }
    }
  }

  private cancelAiAction(): void {
    if (!this.aiLoading) return;
    this.invalidateAiAction();
    this.aiError = "AI request cancelled.";
    this.renderDetail();
  }

  private invalidateAiAction(): void {
    this.aiRequestId += 1;
    this.aiAbortController?.abort();
    this.aiAbortController = null;
    this.aiLoading = false;
    this.aiResult = "";
    this.aiError = "";
  }

  private useAiResult(): void {
    if (!this.aiResult.trim() || this.originalContent === null) return;
    if (this.aiAction === "rewrite") {
      this.draftContent = this.aiResult.trim();
      this.pendingEdit = null;
      this.panel = null;
      this.renderDetail();
      new Notice("Rewrite loaded as a draft. Preview it before applying.");
      return;
    }
    const current = this.draftContent ?? this.originalContent;
    const separator = current.endsWith("\n") ? "\n" : "\n\n";
    this.draftContent = `${current}${separator}## Summary\n\n${this.aiResult.trim()}\n`;
    this.panel = null;
    this.renderDetail();
    new Notice("Summary inserted into the draft. Preview it before applying.");
  }
}

function displayList(values: string[]): string {
  return values.length ? values.map((value) => `#${value}`).join(", ") : "—";
}

function sameMetadata(a: { tags: string[]; category: string }, b: { tags: string[]; category: string }): boolean {
  return a.category === b.category && a.tags.length === b.tags.length && a.tags.every((tag, index) => tag === b.tags[index]);
}

function stripOuterFence(value: string): string {
  const match = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(value);
  return match ? match[1] : value;
}
