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

export interface VaultProjectSummary {
  name: string;
  path: string;
  generatedAt: string;
}

const MAX_SAFE_NAME_LENGTH = 40;

/** Sanitize a free-form string into a filesystem-safe folder/file name segment. */
export function toSafeName(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  const truncated = cleaned.slice(0, MAX_SAFE_NAME_LENGTH);
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

  // ─── Save chat history ─────────────────────────────────────────────────

  /** Persist a full pipeline transcript as a single Markdown note. */
  async saveChatHistory(
    projectName: string,
    messages: FKMessage[],
    mode: BuildMode,
    provider: string
  ): Promise<string> {
    const safeName = toSafeName(projectName);
    const timestamp = timestampSlug(this.now());
    const folder = normalizePath(`${this.outputFolder}/history`);

    await this.ensureFolder(this.outputFolder);
    await this.ensureFolder(folder);

    const content = [
      "---",
      `project: ${projectName.replace(/"/g, "'")}`,
      `mode: ${mode}`,
      `provider: ${provider || "unknown"}`,
      `date: ${timestamp}`,
      `tags: [fullkonk, ${mode}]`,
      "---",
      "",
      `# fullKONK_> — ${projectName}`,
      "",
      ...messages.map((m) => {
        const role = m.role === "user" ? "**You**" : `**AI** (${m.stage ?? "response"})`;
        return `### ${role}\n${m.content}\n`;
      }),
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
