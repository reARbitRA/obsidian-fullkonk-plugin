// src/fileExtractor.ts
//
// Parses fenced code blocks out of accumulated assistant output into
// individual `GeneratedFile`s. Extracted from the view so it can be unit
// tested without any Obsidian/DOM dependency.

import { GeneratedFile } from "./types";

// Matches ```lang\n// optional/path/comment.ext\n<code>```
// The optional leading `// path/to/file` comment (required by every system
// prompt) becomes the file's path; otherwise a positional fallback name is
// generated from the block's language.
const CODE_BLOCK_RE = /```(\w+)?[ \t]*\r?\n(?:(?:\/\/|#)[ \t]*([\w./-]+)\r?\n)?([\s\S]*?)```/g;

const MIN_BLOCK_LENGTH = 30;

/**
 * Extract every named/positional code block from raw markdown text. Later
 * blocks sharing the same path overwrite earlier ones (useful when a
 * "verify" pass re-emits a corrected version of an already generated file).
 */
export function extractFiles(content: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const regex = new RegExp(CODE_BLOCK_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const language = (match[1] || "text").toLowerCase();
    const code = match[3].trim();
    if (code.length < MIN_BLOCK_LENGTH) continue;

    const path = match[2]?.trim() || `output-${files.length + 1}.${extensionFor(language)}`;
    const existingIndex = files.findIndex((f) => f.path === path);
    const file: GeneratedFile = { path, content: code, language };
    if (existingIndex >= 0) {
      files[existingIndex] = file;
    } else {
      files.push(file);
    }
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
