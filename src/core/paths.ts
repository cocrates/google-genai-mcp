import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** OS-specific application data directory. */
export function getDataDir(): string {
  const home = os.homedir();
  const platform = process.platform;

  if (platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    return path.join(localAppData, "google-genai-mcp");
  }

  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "google-genai-mcp");
  }

  const xdgDataHome =
    process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share");
  return path.join(xdgDataHome, "google-genai-mcp");
}

/** Resolve `p` against `baseDir` when relative; absolute paths are unchanged. */
export function resolveAgainst(baseDir: string, p: string): string {
  return path.isAbsolute(p) ? path.resolve(p) : path.resolve(baseDir, p);
}

/** Base directory for auto-generated output filenames. */
export function getAutoOutputDir(mode: "cli" | "mcp"): string {
  return mode === "cli" ? process.cwd() : process.cwd();
}

/** Create directory recursively if missing. */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}
