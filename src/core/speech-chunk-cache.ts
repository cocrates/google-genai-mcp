import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { ensureDir, getDataDir } from "./paths.js";
import { SPEECH_CHUNK_RULE_VERSION } from "./speech-chunking.js";
import type { SpeechRequest } from "./types.js";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SpeechCacheKeyInput {
  model: string;
  request: SpeechRequest;
  preamble: string;
  transcript: string;
}

export function computeSpeechRequestHash(input: SpeechCacheKeyInput): string {
  const speakers = input.request.params.speakers ?? null;
  const voice = input.request.params.voice ?? "Kore";
  const outputFormat = input.request.params.outputFormat ?? "wav";
  const payload = JSON.stringify({
    v: SPEECH_CHUNK_RULE_VERSION,
    model: input.model,
    voice: speakers ? null : voice,
    speakers,
    outputFormat,
    preamble: input.preamble,
    transcript: input.transcript,
  });
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

export function getSpeechChunksRoot(dataDir = getDataDir()): string {
  return path.join(dataDir, "chunks");
}

export function getSpeechChunkDir(
  requestHash: string,
  dataDir = getDataDir(),
): string {
  return path.join(getSpeechChunksRoot(dataDir), requestHash);
}

function chunkFileName(index: number): string {
  return `${String(index).padStart(3, "0")}.pcm`;
}

function chunkIdFileName(index: number): string {
  return `${String(index).padStart(3, "0")}.id`;
}

export function readCachedChunk(
  requestHash: string,
  index: number,
  dataDir = getDataDir(),
): Buffer | null {
  const filePath = path.join(
    getSpeechChunkDir(requestHash, dataDir),
    chunkFileName(index),
  );
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

export function readCachedChunkInteractionId(
  requestHash: string,
  index: number,
  dataDir = getDataDir(),
): string | null {
  const filePath = path.join(
    getSpeechChunkDir(requestHash, dataDir),
    chunkIdFileName(index),
  );
  if (!fs.existsSync(filePath)) return null;
  const id = fs.readFileSync(filePath, "utf8").trim();
  return id || null;
}

export function writeCachedChunk(
  requestHash: string,
  index: number,
  pcm: Buffer,
  dataDir = getDataDir(),
  interactionId?: string,
): void {
  const dir = getSpeechChunkDir(requestHash, dataDir);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, chunkFileName(index)), pcm);
  if (interactionId) {
    fs.writeFileSync(path.join(dir, chunkIdFileName(index)), interactionId, "utf8");
  }
  // Touch directory mtime for GC freshness.
  const now = new Date();
  try {
    fs.utimesSync(dir, now, now);
  } catch {
    // ignore
  }
}

export function deleteSpeechChunkCache(
  requestHash: string,
  dataDir = getDataDir(),
): void {
  const dir = getSpeechChunkDir(requestHash, dataDir);
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Remove `{dataDir}/chunks/{hash}` directories older than 7 days. */
export function gcExpiredSpeechChunkCaches(dataDir = getDataDir()): number {
  const root = getSpeechChunksRoot(dataDir);
  if (!fs.existsSync(root)) return 0;

  const now = Date.now();
  let removed = 0;
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    if (now - st.mtimeMs > CACHE_TTL_MS) {
      fs.rmSync(dir, { recursive: true, force: true });
      removed += 1;
    }
  }
  return removed;
}
