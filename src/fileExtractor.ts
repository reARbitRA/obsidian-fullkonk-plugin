// src/fileExtractor.ts
//
// Parses fenced code blocks out of accumulated assistant output into
// individual `GeneratedFile`s. Extracted from the view so it can be unit
// tested without any Obsidian/DOM dependency.

import { GeneratedFile } from "./types";

// A fence opener: 3+ backticks, optional language tag, nothing else on the line.
const OPEN_FENCE_RE = /^[ \t]*(`{3,})[ \t]*(\w+)?[ \t]*$/;
// CommonMark closing fences must be at least as long as their opener. This
// lets an outer four-backtick block safely contain triple-backtick examples.
const CLOSE_FENCE_RE = /^[ \t]*(`{3,})[ \t]*$/;
// An optional leading `// path/to/file` or `# path/to/file` comment supplies
// the output path; otherwise a positional filename is generated.
const PATH_COMMENT_RE = /^[ \t]*(?:\/\/|#)[ \t]*([\w./-]+)[ \t]*$/;
const MIN_BLOCK_LENGTH = 30;

/**
 * Extract every named/positional code block from raw Markdown. Later blocks
 * sharing a path replace earlier versions, as when a verify pass re-emits a
 * corrected file. Parsing line-by-line avoids truncating a file whose content
 * itself contains a fenced Markdown example.
 */
export function extractFiles(content: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const lines = content.split(/\r\n|\r|\n/);

  let i = 0;
  while (i < lines.length) {
    const openMatch = OPEN_FENCE_RE.exec(lines[i]);
    if (!openMatch) {
      i++;
      continue;
    }

    const fenceLength = openMatch[1].length;
    const language = (openMatch[2] || "text").toLowerCase();
    let cursor = i + 1;
    let explicitPath: string | undefined;

    if (cursor < lines.length) {
      const pathMatch = PATH_COMMENT_RE.exec(lines[cursor]);
      if (pathMatch) {
        explicitPath = pathMatch[1].trim();
        cursor++;
      }
    }

    const bodyLines: string[] = [];
    let closed = false;
    while (cursor < lines.length) {
      const closeMatch = CLOSE_FENCE_RE.exec(lines[cursor]);
      if (closeMatch && closeMatch[1].length >= fenceLength) {
        closed = true;
        cursor++;
        break;
      }
      bodyLines.push(lines[cursor]);
      cursor++;
    }

    if (!closed) break;
    i = cursor;

    const code = bodyLines.join("\n").trim();
    if (code.length < MIN_BLOCK_LENGTH) continue;

    const path = explicitPath || `output-${files.length + 1}.${extensionFor(language)}`;
    const existingIndex = files.findIndex((file) => file.path === path);
    const file: GeneratedFile = { path, content: code, language };
    if (existingIndex >= 0) files[existingIndex] = file;
    else files.push(file);
  }

  return files;
}

const EXTENSION_MAP: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  tsx: "tsx",
  jsx: "jsx",
  python: "py",
  bash: "sh",
  shell: "sh",
  sh: "sh",
  yaml: "yml",
  yml: "yml",
  json: "json",
  html: "html",
  css: "css",
  sql: "sql",
  markdown: "md",
  md: "md",
  text: "txt",
};

function extensionFor(language: string): string {
  return EXTENSION_MAP[language] ?? language;
}
