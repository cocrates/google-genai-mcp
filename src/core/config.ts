import * as fs from "node:fs";
import * as path from "node:path";
import { getDataDir, ensureDir } from "./paths.js";
import type { Config, LogLevel } from "./types.js";

const DEFAULT_CONFIG: Config = {
  logLevel: "info",
};

const VALID_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"]);

function configPath(dataDir = getDataDir()): string {
  return path.join(dataDir, "config.json");
}

function normalizeConfig(raw: unknown): Config {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_CONFIG };
  }

  const candidate = raw as Partial<Config>;
  const logLevel =
    candidate.logLevel && VALID_LEVELS.has(candidate.logLevel)
      ? candidate.logLevel
      : DEFAULT_CONFIG.logLevel;

  return { logLevel };
}

export function loadConfig(dataDir = getDataDir()): Config {
  const filePath = configPath(dataDir);
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    return normalizeConfig(JSON.parse(text) as unknown);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: Config, dataDir = getDataDir()): void {
  ensureDir(dataDir);
  fs.writeFileSync(configPath(dataDir), JSON.stringify(config, null, 2), "utf-8");
}
