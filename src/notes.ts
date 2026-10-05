// src/notes.ts
//
// Dependency-light helpers for browsing, searching, formatting, and planning
// safe vault organization operations. Actual writes go through Obsidian's Vault
// and FileManager APIs in notesManager.ts.

import type { TFile } from "obsidian";

export type NoteSortField = "name" | "path" | "modified" | "created";
export type SortDirection = "asc" | "desc";

export interface NoteRecord {
  file: TFile;
  tags: string[];
  frontmatterTags: string[];
  category: string;
  /** Optional in-memory body text, populated only for content searches. */
  bodyText?: string;
}

export interface NoteSearchOptions {
  query?: string;
  tag?: string;
  category?: string;
  sortBy?: NoteSortField;
  direction?: SortDirection;
}

export interface MarkdownFormatResult {
  content: string;
  selectionStart: number;
  selectionEnd: number;
}

export type MarkdownFormat = "bold" | "italic" | "strike" | "code" | "link" | "h1" | "h2";

export interface MovePlanItem {
  sourcePath: string;
  targetPath: string;
}

export interface FrontmatterSnapshot {
  tags: string[];
  category: string;
}

export interface MetadataChangeSpec {
  tagAction?: "add" | "remove";
  tags?: string[];
  /** undefined = leave alone, null = clear, string = set */
  category?: string | null;
}

export interface MetadataPlanItem {
  path: string;
  before: FrontmatterSnapshot;
  after: FrontmatterSnapshot;
}

export function normalizeTag(value: string): string {
  return value.trim().replace(/^#+\s*/, "").replace(/\s+/g, "-");
}

export function parseTagInput(value: string): string[] {
  const tags = value
    .split(/[\n,]+/)
    .map(normalizeTag)
    .filter(Boolean);
  return uniqueTags(tags);
}

export function normalizeFrontmatterTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueTags(value.filter((tag): tag is string => typeof tag === "string").map(normalizeTag));
  }
  if (typeof value === "string") return parseTagInput(value);
  return [];
}

export function uniqueTags(tags: string[]): string[] {
  const found = new Set<string>();
  const output: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    const key = tag.toLocaleLowerCase();
    if (tag && !found.has(key)) {
      found.add(key);
      output.push(tag);
    }
  }
  return output;
}

export function mergeTags(...lists: string[][]): string[] {
  return uniqueTags(lists.flat());
}

export function categoryFromFrontmatter(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join(", ");
  return "";
}

export function snapshotFrontmatter(value: { tags?: unknown; category?: unknown }): FrontmatterSnapshot {
  return {
    tags: normalizeFrontmatterTags(value.tags),
    category: categoryFromFrontmatter(value.category),
  };
}

export function filterAndSortNotes(notes: NoteRecord[], options: NoteSearchOptions = {}): NoteRecord[] {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  const tag = normalizeTag(options.tag ?? "").toLocaleLowerCase();
  const category = options.category?.trim().toLocaleLowerCase() ?? "";
  const sortBy = options.sortBy ?? "modified";
  const direction = options.direction ?? "desc";

  const filtered = notes.filter((note) => {
    const searchable = [
      note.file.basename,
      note.file.path,
      note.category,
      ...note.tags,
      note.bodyText ?? "",
    ]
      .join("\n")
      .toLocaleLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (tag && !note.tags.some((candidate) => candidate.toLocaleLowerCase().includes(tag))) return false;
    if (category && !note.category.toLocaleLowerCase().includes(category)) return false;
    return true;
  });

  const directionFactor = direction === "asc" ? 1 : -1;
  return filtered.sort((a, b) => {
    let result = 0;
    switch (sortBy) {
      case "name":
        result = a.file.basename.localeCompare(b.file.basename);
        break;
      case "path":
        result = a.file.path.localeCompare(b.file.path);
        break;
      case "created":
        result = a.file.stat.ctime - b.file.stat.ctime;
        break;
      case "modified":
      default:
        result = a.file.stat.mtime - b.file.stat.mtime;
        break;
    }
    return result === 0 ? a.file.path.localeCompare(b.file.path) : result * directionFactor;
  });
}

export function formatSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: MarkdownFormat
): MarkdownFormatResult {
  const start = clamp(Math.min(selectionStart, selectionEnd), 0, text.length);
  const end = clamp(Math.max(selectionStart, selectionEnd), 0, text.length);
  const selected = text.slice(start, end);

  if (format === "h1" || format === "h2") {
    const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const prefix = format === "h1" ? "# " : "## ";
    const lineEndIndex = text.indexOf("\n", end);
    const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
    const block = text.slice(lineStart, lineEnd);
    const existingPrefixLength = /^(#{1,6}\s*)/.exec(block)?.[0].length ?? 0;
    const heading = prefix + block.slice(existingPrefixLength);
    const content = text.slice(0, lineStart) + heading + text.slice(lineEnd);
    const offset = prefix.length - existingPrefixLength;
    const selectionStart = clamp(start + offset, lineStart + prefix.length, lineStart + heading.length);
    const selectionEnd = clamp(end + offset, selectionStart, lineStart + heading.length);
    return { content, selectionStart, selectionEnd };
  }

  const hasSelection = start !== end;
  const body = hasSelection ? selected : "text";
  let prefix = "";
  let suffix = "";
  switch (format) {
    case "bold":
      prefix = "**";
      suffix = "**";
      break;
    case "italic":
      prefix = "*";
      suffix = "*";
      break;
    case "strike":
      prefix = "~~";
      suffix = "~~";
      break;
    case "code":
      prefix = "`";
      suffix = "`";
      break;
    case "link":
      prefix = "[";
      suffix = "](url)";
      break;
  }
  const content = text.slice(0, start) + prefix + body + suffix + text.slice(end);
  return {
    content,
    selectionStart: start + prefix.length,
    selectionEnd: start + prefix.length + body.length,
  };
}

/** Normalize a vault-relative path and reject traversal/control characters. */
export function normalizeVaultPath(input: string): string {
  const raw = input.trim().replace(/\\/g, "/");
  if (hasControlCharacters(raw)) throw new Error("Vault paths cannot contain control characters.");
  const segments: string[] = [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") throw new Error("Parent-directory traversal is not allowed in vault paths.");
    segments.push(part);
  }
  return segments.join("/");
}

export function buildMovePlan(sourcePaths: string[], destinationFolder: string, newName = ""): MovePlanItem[] {
  if (sourcePaths.length === 0) throw new Error("Select at least one note to move.");
  if (sourcePaths.length > 1 && newName.trim()) {
    throw new Error("A new name can only be used when moving a single note.");
  }

  const folder = normalizeVaultPath(destinationFolder);
  const cleanName = newName.trim();
  if (
    cleanName &&
    (cleanName === "." || cleanName === ".." || cleanName.includes("/") || cleanName.includes("\\") || hasControlCharacters(cleanName))
  ) {
    throw new Error("Enter a valid note name without a folder path.");
  }

  const plan = sourcePaths.map((sourcePath) => {
    const source = normalizeVaultPath(sourcePath);
    const slash = source.lastIndexOf("/");
    const currentFilename = slash >= 0 ? source.slice(slash + 1) : source;
    const extensionIndex = currentFilename.lastIndexOf(".");
    const extension = extensionIndex > 0 ? currentFilename.slice(extensionIndex) : "";
    const currentBase = extension ? currentFilename.slice(0, -extension.length) : currentFilename;
    const base = cleanName || currentBase;
    const targetFilename = extension && !base.toLocaleLowerCase().endsWith(extension.toLocaleLowerCase())
      ? `${base}${extension}`
      : base;
    return {
      sourcePath: source,
      targetPath: normalizeVaultPath(folder ? `${folder}/${targetFilename}` : targetFilename),
    };
  });

  const targetSet = new Set<string>();
  for (const item of plan) {
    const key = item.targetPath.toLocaleLowerCase();
    if (targetSet.has(key)) throw new Error(`Multiple notes would have the same destination: ${item.targetPath}`);
    targetSet.add(key);
  }
  return plan;
}

export function buildMetadataPlan(notes: NoteRecord[], spec: MetadataChangeSpec): MetadataPlanItem[] {
  const requestedTags = uniqueTags(spec.tags ?? []);
  return notes.map((note) => {
    const before: FrontmatterSnapshot = {
      tags: uniqueTags(note.frontmatterTags),
      category: note.category,
    };
    let tags = before.tags;
    if (requestedTags.length > 0 && spec.tagAction === "add") {
      tags = mergeTags(tags, requestedTags);
    } else if (requestedTags.length > 0 && spec.tagAction === "remove") {
      const remove = new Set(requestedTags.map((tag) => tag.toLocaleLowerCase()));
      tags = tags.filter((tag) => !remove.has(tag.toLocaleLowerCase()));
    }

    const category = spec.category === undefined ? before.category : (spec.category ?? "").trim();
    return {
      path: note.file.path,
      before,
      after: { tags, category },
    };
  });
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
