import { describe, expect, it } from "vitest";
import {
  buildChunkPrompt,
  buildSpeechChunks,
  concatPcmWithGaps,
  needsSpeechChunking,
  silencePcm,
  splitPreambleTranscript,
  splitSentences,
  toRawPcm,
  utf8ByteLength,
  SPEECH_CHUNK_THRESHOLD_BYTES,
  SPEECH_PARAGRAPH_GAP_MS,
  SPEECH_SENTENCE_GAP_MS,
} from "./speech-chunking.js";
import { ensureWavContainer } from "./output.js";
import {
  computeSpeechRequestHash,
  deleteSpeechChunkCache,
  gcExpiredSpeechChunkCaches,
  readCachedChunk,
  writeCachedChunk,
} from "./speech-chunk-cache.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SpeechRequest } from "./types.js";

describe("splitPreambleTranscript", () => {
  it("splits at #### TRANSCRIPT", () => {
    const text = `# notes\n\n#### TRANSCRIPT\nHello world.`;
    const { preamble, transcript } = splitPreambleTranscript(text);
    expect(preamble).toContain("# notes");
    expect(transcript).toBe("Hello world.");
  });

  it("treats whole text as transcript when marker missing", () => {
    const { preamble, transcript } = splitPreambleTranscript("Just speak this.");
    expect(preamble).toBe("");
    expect(transcript).toBe("Just speak this.");
  });
});

describe("buildChunkPrompt", () => {
  it("reattaches preamble with marker", () => {
    expect(buildChunkPrompt("Style: firm", "Line one.")).toBe(
      "Style: firm\n\n#### TRANSCRIPT\nLine one.",
    );
  });

  it("returns chunk only when no preamble", () => {
    expect(buildChunkPrompt("", "Line one.")).toBe("Line one.");
  });
});

describe("buildSpeechChunks", () => {
  it("splits on blank lines without merging short paragraphs", () => {
    const chunks = buildSpeechChunks("First para.\n\nSecond para.\n\nThird.");
    expect(chunks.map((c) => c.text)).toEqual([
      "First para.",
      "Second para.",
      "Third.",
    ]);
    expect(chunks[0]!.gapAfter).toBe("paragraph");
    expect(chunks[1]!.gapAfter).toBe("paragraph");
    expect(chunks[2]!.gapAfter).toBe("none");
  });

  it("sentence-splits oversized paragraphs", () => {
    const longA = "가".repeat(800); // 2400 bytes UTF-8
    const longB = "나".repeat(800);
    const paragraph = `${longA}. ${longB}.`;
    expect(utf8ByteLength(paragraph)).toBeGreaterThan(1500);
    const chunks = buildSpeechChunks(paragraph);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => utf8ByteLength(c.text) <= utf8ByteLength(paragraph))).toBe(
      true,
    );
    // Internal gaps are sentence; last is none
    expect(chunks[chunks.length - 1]!.gapAfter).toBe("none");
    if (chunks.length >= 2) {
      expect(chunks[0]!.gapAfter).toBe("sentence");
    }
  });

  it("keeps a single oversized sentence as one chunk", () => {
    const monster = "다".repeat(600) + "."; // 1801 bytes, no internal split point beyond end
    const chunks = buildSpeechChunks(monster);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe(monster);
  });
});

describe("splitSentences", () => {
  it("splits on terminators", () => {
    expect(splitSentences("A. B? C! D。")).toEqual(["A.", "B?", "C!", "D。"]);
  });
});

describe("needsSpeechChunking", () => {
  it("uses byte threshold", () => {
    const under = "a".repeat(SPEECH_CHUNK_THRESHOLD_BYTES);
    const over = "a".repeat(SPEECH_CHUNK_THRESHOLD_BYTES + 1);
    expect(needsSpeechChunking(under)).toBe(false);
    expect(needsSpeechChunking(over)).toBe(true);
  });
});

describe("pcm helpers", () => {
  it("creates silence of expected size", () => {
    // 24000 Hz * 2 bytes * 0.25s = 12000
    const buf = silencePcm(250);
    expect(buf.length).toBe(12000);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it("inserts no silence between chunks (gaps disabled)", () => {
    expect(SPEECH_SENTENCE_GAP_MS).toBe(0);
    expect(SPEECH_PARAGRAPH_GAP_MS).toBe(0);
    const a = Buffer.alloc(100, 1);
    const b = Buffer.alloc(100, 2);
    const c = Buffer.alloc(100, 3);
    const merged = concatPcmWithGaps([
      { pcm: a, gapAfter: "sentence" },
      { pcm: b, gapAfter: "paragraph" },
      { pcm: c, gapAfter: "none" },
    ]);
    expect(merged.length).toBe(300);
  });

  it("strips WAV header via toRawPcm", () => {
    const pcm = Buffer.alloc(48, 7);
    const wav = ensureWavContainer(pcm);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(toRawPcm(wav).equals(pcm)).toBe(true);
    expect(toRawPcm(pcm).equals(pcm)).toBe(true);
  });
});

describe("speech-chunk-cache", () => {
  it("writes, reads, hashes, and GCs", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ggm-chunks-"));
    try {
      const request: SpeechRequest = {
        type: "speech",
        model: "gemini-3.1-flash-tts-preview",
        params: { text: "unused", voice: "Kore", outputFormat: "wav" },
      };
      const hash = computeSpeechRequestHash({
        model: "gemini-3.1-flash-tts-preview",
        request,
        preamble: "style",
        transcript: "body",
      });
      expect(hash).toHaveLength(64);

      const pcm = Buffer.from([1, 2, 3, 4]);
      writeCachedChunk(hash, 0, pcm, tmp, "v1_abc");
      expect(readCachedChunk(hash, 0, tmp)?.equals(pcm)).toBe(true);

      deleteSpeechChunkCache(hash, tmp);
      expect(readCachedChunk(hash, 0, tmp)).toBeNull();

      writeCachedChunk(hash, 0, pcm, tmp);
      const dir = path.join(tmp, "chunks", hash);
      const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      fs.utimesSync(dir, old, old);
      expect(gcExpiredSpeechChunkCaches(tmp)).toBe(1);
      expect(fs.existsSync(dir)).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
