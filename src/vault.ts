// src/vault.ts
//
// Reads and writes generated projects, chat history, and context files to the
// user's Obsidian vault. All paths are normalized and every intermediate
// folder is created on demand so this works identically on desktop and
// mobile (no Node `fs`/`path` usage — Obsidian's own Vault API only).

import { App, TFile, TFolder, normalizePath } from "obsidian";
import { BuildMode, FKMessage, GeneratedFile } from "./types";
import { VaultOperationError } from "./errors";
import { logger } from "./utils/logger";
import { SessionStats, formatDuration, formatStageLine, formatTokens, summarize } from "./stats";
import { createZip, ZipEntry } from "./utils/zip";
import { buildBundleMarkdown } from "./exporter";

export interface VaultProjectSummary {
  name: string;
  path: string;
  generatedAt: string;
}

const MAX_SAFE_NAME_LENGTH = 40;

// Reserved path characters across supported desktop/mobile filesystems, plus
// ASCII controls. Other scripts are preserved instead of being dropped.
// eslint-disable-next-line no-control-regex -- intentionally strips ASCII control characters from file names
const UNSAFE_PATH_CHARS_RE = /[\\/:*?"<>|\u0000-\u001f]/g;
const NON_WORD_RUN_RE = /[^\p{L}\p{N}_-]+/gu;

/** Sanitize a free-form string while preserving letters from every script. */
export function toSafeName(input: string): string {
  const withoutUnsafeChars = input.replace(UNSAFE_PATH_CHARS_RE, " ");
  const collapsed = withoutUnsafeChars.replace(NON_WORD_RUN_RE, "_").replace(/^_+|_+$/g, "");
  // Slice by Unicode code point so a surrogate pair is never split.
  const truncated = Array.from(collapsed).slice(0, MAX_SAFE_NAME_LENGTH).join("");
  return truncated.length > 0 ? truncated : "untitled";
}

/** Build a sortable, filesystem-safe timestamp, e.g. `2026-09-29-14-05-00`. */
export function timestampSlug(date: Date = new Date()): string {
  return date.toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

export class VaultManager {
  constructor(
    private readonly app: App,
    private readonly outputFolder: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  // ─── Folder helpers ────────────────────────────────────────────────────

  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (normalized === "" || normalized === "/") return;
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing) {
      if (!(existing instanceof TFolder)) {
        throw new VaultOperationError(`Path already exists and is not a folder: ${normalized}`);
      }
      return;
    }
    try {
      await this.app.vault.createFolder(normalized);
    } catch (err) {
      // Tolerate a benign race where the folder was created concurrently.
      if (!this.app.vault.getAbstractFileByPath(normalized)) {
        throw new VaultOperationError(`Failed to create folder: ${normalized}`, err);
      }
      logger.debug(`ensureFolder: tolerated concurrent creation race for ${normalized}`);
    }
  }

  private async ensureParentFolders(filePath: string): Promise<void> {
    const parts = filePath.split("/");
    if (parts.length <= 1) return;
    let cursor = "";
    for (const part of parts.slice(0, -1)) {
      cursor = cursor ? `${cursor}/${part}` : part;
      await this.ensureFolder(cursor);
    }
  }

  private async writeFile(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    await this.ensureParentFolders(normalized);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(normalized, content);
    }
  }

  private async writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
    const normalized = normalizePath(path);
    await this.ensureParentFolders(normalized);
    // `slice()` guarantees a tightly-sized ArrayBuffer even when the view is a
    // window into a larger buffer, which some Vault implementations reject.
    const buffer = bytes.slice().buffer;
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, buffer);
    } else {
      await this.app.vault.createBinary(normalized, buffer);
    }
  }

  // ─── Save generated files ──────────────────────────────────────────────

  /** Persist a batch of generated files under `<outputFolder>/<name>-<timestamp>/`. */
  async saveGeneratedFiles(projectName: string, files: GeneratedFile[]): Promise<string> {
    if (files.length === 0) {
      throw new VaultOperationError("saveGeneratedFiles() called with an empty file list.");
    }

    const safeName = toSafeName(projectName);
    const timestamp = timestampSlug(this.now());
    const folder = normalizePath(`${this.outputFolder}/${safeName}-${timestamp}`);

    await this.ensureFolder(this.outputFolder);
    await this.ensureFolder(folder);

    for (const file of files) {
      await this.writeFile(`${folder}/${file.path}`, file.content);
    }

    const indexPath = normalizePath(`${folder}/README.md`);
    const indexContent = this.buildReadme(projectName, files, timestamp);
    await this.writeFile(indexPath, indexContent);

    return folder;
  }

  // ─── Exports ───────────────────────────────────────────────────────────

  /**
   * Export generated files as a ZIP archive under `<outputFolder>/exports/`.
   * Returns the vault path of the written archive.
   */
  async exportZip(projectName: string, files: GeneratedFile[]): Promise<string> {
    if (files.length === 0) {
      throw new VaultOperationError("exportZip() called with an empty file list.");
    }

    const safeName = toSafeName(projectName);
    const timestamp = timestampSlug(this.now());
    const folder = normalizePath(`${this.outputFolder}/exports`);

    await this.ensureFolder(this.outputFolder);
    await this.ensureFolder(folder);

    const entries: ZipEntry[] = files.map((file) => ({ path: file.path, content: file.content }));
    const archive = createZip(entries, this.now());
    const path = normalizePath(`${folder}/${safeName}-${timestamp}.zip`);
    await this.writeBinaryFile(path, archive);
    return path;
  }

  /**
   * Export every generated file into a single Markdown bundle (fenced code
   * blocks with path headers) — handy for sharing a whole project as one note.
   */
  async saveBundle(projectName: string, files: GeneratedFile[]): Promise<string> {
    if (files.length === 0) {
      throw new VaultOperationError("saveBundle() called with an empty file list.");
    }

    const safeName = toSafeName(projectName);
    const timestamp = timestampSlug(this.now());
    const folder = normalizePath(`${this.outputFolder}/exports`);

    await this.ensureFolder(this.outputFolder);
    await this.ensureFolder(folder);

    const content = buildBundleMarkdown(projectName, files, timestamp);
    const path = normalizePath(`${folder}/${safeName}-${timestamp}.md`);
    await this.writeFile(path, content);
    return path;
  }

  // ─── Save chat history ─────────────────────────────────────────────────

  /** Persist a full pipeline transcript as a single Markdown note. */
  async saveChatHistory(
    projectName: string,
    messages: FKMessage[],
    mode: BuildMode,
    provider: string,
    stats?: SessionStats
  ): Promise<string> {
    const safeName = toSafeName(projectName);
    const timestamp = timestampSlug(this.now());
    const folder = normalizePath(`${this.outputFolder}/history`);

    await this.ensureFolder(this.outputFolder);
    await this.ensureFolder(folder);

    const summary = stats && stats.stages.length > 0 ? summarize(stats) : null;

    const content = [
      "---",
      `project: ${projectName.replace(/"/g, "'")}`,
      `mode: ${mode}`,
      `provider: ${provider || "unknown"}`,
      `date: ${timestamp}`,
      ...(summary
        ? [
            `tokens: ${summary.totalTokens}`,
            `duration: ${formatDuration(summary.totalDurationMs)}`,
            `stages: ${summary.stageCount}`,
          ]
        : []),
      `tags: [fullkonk, ${mode}]`,
      "---",
      "",
      `# fullKONK_> — ${projectName}`,
      "",
      ...messages.map((m) => {
        const role = m.role === "user" ? "**You**" : `**AI** (${m.stage ?? "response"})`;
        return `### ${role}\n${m.content}\n`;
      }),
      ...(summary
        ? [
            "## Session stats",
            "",
            `- **Total:** ${formatTokens(summary.totalTokens)} tokens · ${formatDuration(
              summary.totalDurationMs
            )} · ${summary.averageTps.toFixed(1)} tok/s`,
            ...stats!.stages.map((stage) => `- ${formatStageLine(stage)}`),
            "",
          ]
        : []),
    ].join("\n");

    const path = normalizePath(`${folder}/${safeName}-${timestamp}.md`);
    await this.writeFile(path, content);
    return path;
  }

  // ─── Read vault files as LLM context ───────────────────────────────────

  /** Read a list of vault-relative file paths and concatenate them as fenced context blocks. */
  async readFilesAsContext(paths: string[]): Promise<string> {
    const parts: string[] = [];
    for (const p of paths) {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(p));
      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        parts.push(`## File: ${p}\n\`\`\`\n${content}\n\`\`\``);
      }
    }
    return parts.join("\n\n");
  }

  // ─── List previously generated projects ────────────────────────────────

  /** List every generated project folder, newest first. */
  async listProjects(): Promise<VaultProjectSummary[]> {
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.outputFolder));
    if (!(folder instanceof TFolder)) return [];

    const summaries: VaultProjectSummary[] = [];
    for (const child of folder.children) {
      if (!(child instanceof TFolder)) continue;
      const readmePath = normalizePath(`${child.path}/README.md`);
      const readme = this.app.vault.getAbstractFileByPath(readmePath);
      let generatedAt = "";
      let name = child.name;
      if (readme instanceof TFile) {
        const text = await this.app.vault.read(readme);
        const generatedMatch = /^generated:\s*(.+)$/m.exec(text);
        const titleMatch = /^#\s+(.+)$/m.exec(text);
        if (generatedMatch) generatedAt = generatedMatch[1].trim();
        if (titleMatch) name = titleMatch[1].trim();
      }
      summaries.push({ name, path: child.path, generatedAt });
    }

    return summaries.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  }

  // ─── README builder ─────────────────────────────────────────────────────

  private buildReadme(projectName: string, files: GeneratedFile[], timestamp: string): string {
    const fileList = files.map((f) => `- [[${f.path}]] (${f.language})`).join("\n");

    return [
      "---",
      `generated: ${timestamp}`,
      "tags: [fullkonk, generated]",
      "---",
      "",
      `# ${projectName}`,
      "",
      "Generated by **fullKONK_>** on konkred.xyz",
      "",
      "## Files",
      "",
      fileList,
    ].join("\n");
  }
}
