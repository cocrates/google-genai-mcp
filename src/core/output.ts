import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { ensureDir, getAutoOutputDir } from "./paths.js";
import { ErrorCode, GeminiError, type GeneratedFile, type RequestType } from "./types.js";

export interface SaveOutputOptions {
  overwrite?: boolean;
}

export interface AssertWriteOptions {
  force?: boolean;
  prompt?: () => Promise<boolean>;
  overwriteAlways?: boolean;
}

/** Ensure parent directory exists and write binary data to disk. */
export function saveOutputFile(
  data: Buffer,
  outputPath: string,
  mimeType: string,
  options: SaveOutputOptions = {},
): GeneratedFile {
  const resolved = path.resolve(outputPath);
  const dir = path.dirname(resolved);

  if (fs.existsSync(resolved) && !options.overwrite) {
    throw new GeminiError(
      `Output file already exists: ${resolved}`,
      ErrorCode.INVALID_INPUT,
    );
  }

  ensureDir(dir);
  fs.writeFileSync(resolved, data);

  const stats = fs.statSync(resolved);
  return {
    filePath: resolved,
    mimeType,
    size: stats.size,
  };
}

/** Auto filename: {type}_{timestamp}_{hash}.{ext} under baseDir. */
export function generateOutputFilename(
  type: RequestType,
  ext: string,
  baseDir: string = getAutoOutputDir("cli"),
): string {
  const timestamp = Date.now();
  const hash = crypto.randomBytes(4).toString("hex");
  return path.join(baseDir, `${type}_${timestamp}_${hash}.${ext}`);
}

/** Copy request YAML to {dataDir}/tmp/{hash}.yaml; returns filename only. */
export function copyToTmp(sourcePath: string, dataDir: string): string | null {
  try {
    const tmpDir = path.join(dataDir, "tmp");
    ensureDir(tmpDir);

    const hash = crypto
      .createHash("md5")
      .update(sourcePath + Date.now())
      .digest("hex")
      .slice(0, 12);
    const ext = path.extname(sourcePath) || ".yaml";
    const filename = `${hash}${ext}`;
    const destPath = path.join(tmpDir, filename);

    fs.copyFileSync(sourcePath, destPath);
    return filename;
  } catch {
    return null;
  }
}

/** Check whether writing to path is allowed (CLI confirm / MCP overwrite). */
export async function assertCanWrite(
  outputPath: string,
  options: AssertWriteOptions = {},
): Promise<void> {
  const resolved = path.resolve(outputPath);
  if (!fs.existsSync(resolved)) {
    return;
  }

  if (options.overwriteAlways || options.force) {
    return;
  }

  if (options.prompt) {
    const ok = await options.prompt();
    if (ok) {
      return;
    }
    throw new GeminiError(
      `Refusing to overwrite existing file: ${resolved}`,
      ErrorCode.INVALID_INPUT,
    );
  }

  throw new GeminiError(
    `Output file already exists: ${resolved}. Use --force to overwrite.`,
    ErrorCode.INVALID_INPUT,
  );
}

export function extensionForMime(mimeType: string, fallback: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/ogg": "ogg",
  };
  return map[mimeType] ?? fallback;
}

export function getImageMimeType(ext: string): string {
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return map[ext.toLowerCase()] ?? "image/png";
}

export function getAudioMimeType(format: string): string {
  const map: Record<string, string> = {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
  };
  return map[format] ?? "audio/wav";
}

/**
 * Wrap raw PCM (L16) as a WAV file. If `data` already has a RIFF header, return as-is.
 * Defaults match Gemini TTS examples: 24 kHz, mono, 16-bit.
 */
export function ensureWavContainer(
  data: Buffer,
  options: { sampleRate?: number; channels?: number; bitDepth?: number } = {},
): Buffer {
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF") {
    return data;
  }

  const sampleRate = options.sampleRate ?? 24000;
  const channels = options.channels ?? 1;
  const bitDepth = options.bitDepth ?? 16;
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}
