import * as fs from "node:fs";
import * as path from "node:path";
import { getDataDir, ensureDir } from "./paths.js";
import type { LogLevel, Logger } from "./types.js";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function formatYamlLine(
  level: LogLevel,
  message: string,
  args: unknown[],
): string {
  const timestamp = new Date().toISOString();
  const lines = [
    `timestamp: ${timestamp}`,
    `level: ${level}`,
    `message: ${JSON.stringify(message)}`,
  ];

  if (args.length > 0) {
    lines.push(`data: ${JSON.stringify(args.length === 1 ? args[0] : args)}`);
  }

  return `${lines.join("\n")}\n---\n`;
}

function createFileLogger(level: LogLevel, dataDir = getDataDir()): Logger {
  const logsDir = path.join(dataDir, "logs");
  ensureDir(logsDir);

  const today = new Date().toISOString().split("T")[0];
  const logFile = path.join(logsDir, `${today}.log`);
  const minLevel = LOG_LEVELS[level] ?? LOG_LEVELS.info;

  function write(level: LogLevel, message: string, args: unknown[]): void {
    if (LOG_LEVELS[level] < minLevel) {
      return;
    }

    try {
      fs.appendFileSync(logFile, formatYamlLine(level, message, args), "utf-8");
    } catch {
      // Never crash the app because logging failed.
    }
  }

  return {
    debug: (message, ...args) => write("debug", message, args),
    info: (message, ...args) => write("info", message, args),
    warn: (message, ...args) => write("warn", message, args),
    error: (message, ...args) => write("error", message, args),
  };
}

/** File logger — writes YAML-ish blocks to {dataDir}/logs/{date}.log (never stdout). */
export function createLogger(level: LogLevel = "info", dataDir = getDataDir()): Logger {
  return createFileLogger(level, dataDir);
}

/** Silent logger for MCP default (no file writes). */
export function createSilentLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

/** Resolve logger from env/config; silent when level would produce no output. */
export function resolveLogger(
  level: LogLevel | "silent",
  dataDir = getDataDir(),
): Logger {
  if (level === "silent") {
    return createSilentLogger();
  }
  return createLogger(level, dataDir);
}
