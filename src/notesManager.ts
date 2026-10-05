// src/notesManager.ts
//
// Obsidian-native operations for browsing and organizing Markdown notes.
// Moves use FileManager.renameFile so Obsidian can update links; frontmatter
// changes use processFrontMatter so unrelated YAML properties stay intact.

import { App, TFile, TFolder, normalizePath, parseYaml } from "obsidian";
import {
  FrontmatterSnapshot,
  MetadataPlanItem,
  MovePlanItem,
  NoteRecord,
  categoryFromFrontmatter,
  mergeTags,
  normalizeFrontmatterTags,
  normalizeVaultPath,
  snapshotFrontmatter,
} from "./notes";

export class NoteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoteConflictError";
  }
}

export class VaultNotesManager {
  constructor(private readonly app: App) {}

  listNotes(): NoteRecord[] {
    return this.app.vault.getMarkdownFiles().map((file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter;
      const frontmatterTags = normalizeFrontmatterTags(frontmatter?.tags);
      const inlineAndCachedTags = (cache?.tags ?? []).map((tag) => tag.tag);
      return {
        file,
        tags: mergeTags(frontmatterTags, inlineAndCachedTags),
        frontmatterTags,
        category: categoryFromFrontmatter(frontmatter?.category),
      };
    });
  }

  readNote(file: TFile): Promise<string> {
    return this.app.vault.read(file);
  }

  readNoteForSearch(file: TFile): Promise<string> {
    return this.app.vault.cachedRead(file);
  }

  async saveNote(file: TFile, expectedContent: string, nextContent: string): Promise<void> {
    const currentFile = this.app.vault.getAbstractFileByPath(file.path);
    if (!(currentFile instanceof TFile)) {
      throw new NoteConflictError(`This note is no longer in the vault: ${file.path}`);
    }
    const currentContent = await this.app.vault.read(currentFile);
    if (currentContent !== expectedContent) {
      throw new NoteConflictError(
        `This note changed after the preview was created. Reload it before applying edits: ${file.path}`
      );
    }
    await this.app.vault.modify(currentFile, nextContent);
  }

  validateMovePlan(plan: MovePlanItem[]): void {
    if (plan.length === 0) throw new Error("There are no note moves to apply.");

    const targets = new Set<string>();
    for (const item of plan) {
      const sourcePath = normalizeVaultPath(item.sourcePath);
      const targetPath = normalizeVaultPath(item.targetPath);
      if (sourcePath !== item.sourcePath || targetPath !== item.targetPath || !targetPath) {
        throw new Error("The move plan contains an invalid vault path.");
      }
      if (!(this.app.vault.getAbstractFileByPath(sourcePath) instanceof TFile)) {
        throw new Error(`The source note no longer exists: ${sourcePath}`);
      }
      const targetKey = targetPath.toLocaleLowerCase();
      if (targets.has(targetKey)) throw new Error(`Duplicate move destination: ${targetPath}`);
      targets.add(targetKey);

      if (sourcePath !== targetPath) {
        const exact = this.app.vault.getAbstractFileByPath(targetPath);
        const existing = exact ?? this.app.vault.getAllLoadedFiles().find(
          (item) => item.path.toLocaleLowerCase() === targetKey
        );
        if (existing && existing.path !== sourcePath) {
          throw new Error(`A vault item already exists at the destination: ${targetPath}`);
        }
      }
    }
  }

  async moveNotes(plan: MovePlanItem[]): Promise<number> {
    this.validateMovePlan(plan);
    const moves = plan.filter((item) => item.sourcePath !== item.targetPath);
    if (moves.length === 0) return 0;

    const resolved = moves.map((item) => {
      const file = this.app.vault.getAbstractFileByPath(item.sourcePath);
      if (!(file instanceof TFile)) throw new Error(`The source note no longer exists: ${item.sourcePath}`);
      return { file, sourcePath: item.sourcePath, targetPath: item.targetPath };
    });

    // Create all destination folders before renaming anything. A conflicting
    // file is rejected rather than implicitly overwritten.
    for (const item of resolved) {
      const slash = item.targetPath.lastIndexOf("/");
      if (slash >= 0) await this.ensureFolder(item.targetPath.slice(0, slash));
    }

    const completed: typeof resolved = [];
    try {
      for (const item of resolved) {
        await this.app.fileManager.renameFile(item.file, item.targetPath);
        completed.push(item);
      }
    } catch (error) {
      const rollbackErrors: string[] = [];
      for (const item of completed.reverse()) {
        try {
          await this.app.fileManager.renameFile(item.file, item.sourcePath);
        } catch {
          rollbackErrors.push(item.sourcePath);
        }
      }
      const reason = error instanceof Error ? error.message : String(error);
      const rollback = rollbackErrors.length
        ? ` Rollback also failed for: ${rollbackErrors.join(", ")}.`
        : " Completed moves were rolled back.";
      throw new Error(`Move failed: ${reason}.${rollback}`);
    }
    return completed.length;
  }

  async applyMetadata(plans: MetadataPlanItem[]): Promise<number> {
    // Read every note and check its current frontmatter before changing any of
    // them. Each write repeats the comparison atomically inside processFrontMatter
    // to catch a concurrent edit that lands after this batch preflight.
    for (const plan of plans) {
      const file = this.app.vault.getAbstractFileByPath(plan.path);
      if (!(file instanceof TFile)) throw new NoteConflictError(`This note is no longer in the vault: ${plan.path}`);
      const content = await this.app.vault.read(file);
      const actual = snapshotFromContent(content);
      if (!sameSnapshot(actual, plan.before)) {
        throw new NoteConflictError(
          `Metadata changed after the preview was created. Rebuild the preview for: ${plan.path}`
        );
      }
    }

    let applied = 0;
    for (const plan of plans) {
      try {
        const file = this.app.vault.getAbstractFileByPath(plan.path);
        if (!(file instanceof TFile)) throw new NoteConflictError(`This note is no longer in the vault: ${plan.path}`);

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          const actual: FrontmatterSnapshot = {
            tags: normalizeFrontmatterTags(frontmatter.tags),
            category: categoryFromFrontmatter(frontmatter.category),
          };
          if (!sameSnapshot(actual, plan.before)) {
            throw new NoteConflictError(
              `Metadata changed after the preview was created. Rebuild the preview for: ${plan.path}`
            );
          }

          if (plan.after.tags.length > 0) frontmatter.tags = [...plan.after.tags];
          else delete frontmatter.tags;

          if (plan.after.category) frontmatter.category = plan.after.category;
          else delete frontmatter.category;
        });
        applied += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (applied > 0) {
          throw new Error(`Updated ${applied} of ${plans.length} notes before stopping at ${plan.path}: ${reason}`);
        }
        throw error;
      }
    }
    return applied;
  }

  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(normalizeVaultPath(path));
    if (!normalized) return;
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing) {
      if (!(existing instanceof TFolder)) throw new Error(`A file blocks the destination folder: ${normalized}`);
      return;
    }

    const slash = normalized.lastIndexOf("/");
    if (slash >= 0) await this.ensureFolder(normalized.slice(0, slash));
    try {
      await this.app.vault.createFolder(normalized);
    } catch (error) {
      // Accept a concurrent folder creation only; never mask a file collision.
      const appeared = this.app.vault.getAbstractFileByPath(normalized);
      if (!(appeared instanceof TFolder)) throw error;
    }
  }
}

function snapshotFromContent(content: string): FrontmatterSnapshot {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { tags: [], category: "" };
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closing < 0) return { tags: [], category: "" };
  const parsed = parseYaml(lines.slice(1, closing).join("\n")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { tags: [], category: "" };
  return snapshotFrontmatter(parsed as { tags?: unknown; category?: unknown });
}

function sameSnapshot(a: FrontmatterSnapshot, b: FrontmatterSnapshot): boolean {
  return (
    a.category === b.category &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, index) => tag === b.tags[index])
  );
}
