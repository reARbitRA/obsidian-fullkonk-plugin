// src/utils/logger.ts
//
// A tiny leveled logger. fullKONK_> runs inside Obsidian's renderer process,
// so there is no `.env` file at runtime — but the same source is also
// exercised under plain Node.js during `npm run dev` (esbuild) and `npm test`
// (Jest), where `process.env.FULLKONK_LOG_LEVEL` can be used to control
// verbosity. Every access to `process` is guarded so this module is 100%
// safe to import inside Obsidian's browser-like environment, where `process`
// does not exist.

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

const LEVEL_ORDER: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

const VALID_LEVELS = new Set<string>(Object.keys(LEVEL_ORDER));

function readEnvLogLevel(): LogLevel {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const raw = proc?.env?.FULLKONK_LOG_LEVEL?.toLowerCase();
  return raw && VALID_LEVELS.has(raw) ? (raw as LogLevel) : "warn";
}

export class Logger {
  constructor(private level: LogLevel = readEnvLogLevel(), private readonly prefix = "[fullKONK_>]") {}

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  private enabled(level: LogLevel): boolean {
    return LEVEL_ORDER[level] <= LEVEL_ORDER[this.level];
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.enabled("debug")) console.debug(this.prefix, message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    if (this.enabled("info")) console.info(this.prefix, message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.enabled("warn")) console.warn(this.prefix, message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    if (this.enabled("error")) console.error(this.prefix, message, ...args);
  }
}

/** Process-wide logger instance used across the plugin. */
export const logger = new Logger();
