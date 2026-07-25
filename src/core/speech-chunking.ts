/** Boundary-rule version — bump when split/silence rules change (invalidates caches). */
export const SPEECH_CHUNK_RULE_VERSION = "v2";

export const SPEECH_CHUNK_THRESHOLD_BYTES = 4000;
export const SPEECH_CHUNK_MAX_PARAGRAPH_BYTES = 1500;
// Chunks already carry their own leading/trailing silence from the model, so
// no extra silence is inserted between them.
export const SPEECH_SENTENCE_GAP_MS = 0;
export const SPEECH_PARAGRAPH_GAP_MS = 0;

export const SPEECH_PCM_SAMPLE_RATE = 24000;
export const SPEECH_PCM_CHANNELS = 1;
export const SPEECH_PCM_BIT_DEPTH = 16;

const TRANSCRIPT_MARKER = /^####\s*TRANSCRIPT\s*$/im;

export type ChunkGap = "sentence" | "paragraph" | "none";

export interface SpeechTextParts {
  preamble: string;
  transcript: string;
}

export interface SpeechChunk {
  /** Transcript portion only (no preamble). */
  text: string;
  /** Silence to insert after this chunk before the next (last chunk: none). */
  gapAfter: ChunkGap;
}

export function utf8ByteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** Split style preamble from transcript at `#### TRANSCRIPT` (case-insensitive). */
export function splitPreambleTranscript(text: string): SpeechTextParts {
  const match = TRANSCRIPT_MARKER.exec(text);
  if (!match || match.index === undefined) {
    return { preamble: "", transcript: text };
  }
  const preamble = text.slice(0, match.index).replace(/\s+$/, "");
  const afterMarker = text.slice(match.index + match[0].length).replace(/^\s+/, "");
  return { preamble, transcript: afterMarker };
}

/** Attach preamble + TRANSCRIPT marker to a transcript chunk for TTS input. */
export function buildChunkPrompt(preamble: string, chunkText: string): string {
  if (!preamble) {
    return chunkText;
  }
  return `${preamble}\n\n#### TRANSCRIPT\n${chunkText}`;
}

function splitParagraphs(transcript: string): string[] {
  return transcript
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Split on `.` `?` `!` `。` (keep terminator) or newlines. */
export function splitSentences(paragraph: string): string[] {
  const parts = paragraph.split(/(?<=[.?!。])(?:\s+|$)|(?<=\n)/);
  const out: string[] = [];
  for (const part of parts) {
    const t = part.trim();
    if (t) out.push(t);
  }
  return out.length > 0 ? out : [paragraph.trim()].filter(Boolean);
}

/**
 * Build ordered chunks: paragraphs first; paragraphs over 1,500 bytes are
 * sentence-split. Adjacent short paragraphs are not merged.
 */
export function buildSpeechChunks(transcript: string): SpeechChunk[] {
  const paragraphs = splitParagraphs(transcript);
  if (paragraphs.length === 0) {
    return [];
  }

  const chunks: SpeechChunk[] = [];
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi]!;
    const isLastPara = pi === paragraphs.length - 1;
    const parts =
      utf8ByteLength(para) > SPEECH_CHUNK_MAX_PARAGRAPH_BYTES
        ? splitSentences(para)
        : [para];

    for (let si = 0; si < parts.length; si++) {
      const isLastInPara = si === parts.length - 1;
      let gapAfter: ChunkGap = "none";
      if (!(isLastPara && isLastInPara)) {
        gapAfter = isLastInPara ? "paragraph" : "sentence";
      }
      chunks.push({ text: parts[si]!, gapAfter });
    }
  }
  return chunks;
}

export function needsSpeechChunking(transcript: string): boolean {
  return utf8ByteLength(transcript) > SPEECH_CHUNK_THRESHOLD_BYTES;
}

/** Strip RIFF/WAV header if present; return raw PCM. */
export function toRawPcm(data: Buffer): Buffer {
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF") {
    // Prefer finding "data" chunk; fall back to skipping 44-byte header.
    let offset = 12;
    while (offset + 8 <= data.length) {
      const id = data.subarray(offset, offset + 4).toString("ascii");
      const size = data.readUInt32LE(offset + 4);
      if (id === "data") {
        return data.subarray(offset + 8, offset + 8 + size);
      }
      offset += 8 + size + (size % 2);
    }
    return data.subarray(44);
  }
  return data;
}

export function silencePcm(
  durationMs: number,
  options: {
    sampleRate?: number;
    channels?: number;
    bitDepth?: number;
  } = {},
): Buffer {
  const sampleRate = options.sampleRate ?? SPEECH_PCM_SAMPLE_RATE;
  const channels = options.channels ?? SPEECH_PCM_CHANNELS;
  const bitDepth = options.bitDepth ?? SPEECH_PCM_BIT_DEPTH;
  const bytesPerSample = (bitDepth / 8) * channels;
  const samples = Math.max(0, Math.round((sampleRate * durationMs) / 1000));
  return Buffer.alloc(samples * bytesPerSample, 0);
}

export function gapDurationMs(gap: ChunkGap): number {
  if (gap === "sentence") return SPEECH_SENTENCE_GAP_MS;
  if (gap === "paragraph") return SPEECH_PARAGRAPH_GAP_MS;
  return 0;
}

/** Concatenate raw PCM chunks with configured silence gaps. */
export function concatPcmWithGaps(
  pieces: Array<{ pcm: Buffer; gapAfter: ChunkGap }>,
): Buffer {
  const parts: Buffer[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!;
    parts.push(piece.pcm);
    if (i < pieces.length - 1) {
      const ms = gapDurationMs(piece.gapAfter);
      if (ms > 0) {
        parts.push(silencePcm(ms));
      }
    }
  }
  return Buffer.concat(parts);
}

/** Short excerpt for error messages (keeps UTF-8 boundaries via string slice). */
export function excerptForError(text: string, maxChars = 120): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxChars) return oneLine;
  return `${oneLine.slice(0, maxChars)}…`;
}
