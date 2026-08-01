import * as fs from "node:fs";
import * as path from "node:path";
import { uploadFileAndWait } from "./files-api.js";
import { getGeminiClient } from "./gemini-client.js";
import {
  createInteraction,
  interactionIdOf,
  statusOf,
  waitForInteraction,
} from "./interactions-api.js";
import { addInteraction } from "./interactions-store.js";
import { getDataDir } from "./paths.js";
import {
  getMediaMimeType,
  inferMediaRefType,
} from "./output.js";
import { interactionErrorMessage } from "./media.js";
import {
  ErrorCode,
  GeminiError,
  type Logger,
  type MediaRefType,
} from "./types.js";
import {
  buildSpecAnalyzePrompt,
  loadSpecAnalyzeContext,
  partitionAnalyzeInputs,
  resolveInputsFromSpec,
} from "./analyze-spec.js";

export const DEFAULT_ANALYZE_MODEL = "gemini-3.6-flash";
export const MAX_ANALYZE_INPUTS = 10;
/** Per-file inline threshold (20MB). */
export const INLINE_MAX_BYTES = 20 * 1024 * 1024;

export interface AnalyzeOptions {
  /**
   * Media paths/URLs and/or one generation YAML/JSON (`.yaml`/`.yml`/`.json`).
   * A request file is detected by extension; its `output` is analyzed when no
   * other media entries are present, and the prompt includes the YAML tree.
   */
  inputs: string[];
  /**
   * Analysis instruction. Optional when a generation YAML/JSON is among
   * `inputs` — a default fidelity/defect checklist is used; user text is
   * prepended when present.
   */
  prompt?: string;
  model?: string;
  /** Base for resolving relative local paths (default: process.cwd()). */
  baseDir?: string;
  logger?: Logger;
  onProgress?: (message: string) => void;
}

export interface AnalyzeResult {
  interactionId: string;
  text: string;
}

export type ResolvedAnalyzePart =
  | { kind: "inline"; type: MediaRefType; data: string; mime_type: string }
  | { kind: "uri"; type: MediaRefType; uri: string; mime_type?: string };

function isYouTubeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    return host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  } catch {
    return false;
  }
}

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function mimeFromUrlPath(urlPath: string, type: MediaRefType): string {
  const ext = path.extname(urlPath).toLowerCase();
  return getMediaMimeType(ext || (type === "video" ? ".mp4" : type === "audio" ? ".mp3" : ".png"), type);
}

function inferTypeFromUrl(urlString: string): MediaRefType {
  const u = new URL(urlString);
  if (isYouTubeUrl(urlString)) {
    return "video";
  }
  const ext = path.extname(u.pathname).toLowerCase();
  if (!ext) {
    throw new GeminiError(
      `Cannot infer media type from URL (no extension): ${urlString}`,
      ErrorCode.INVALID_INPUT,
    );
  }
  return inferMediaRefType(`file${ext}`);
}

/** Resolve one inputs[] entry into an Interactions media part descriptor. */
export async function resolveAnalyzeInput(
  raw: string,
  baseDir: string,
  logger?: Logger,
  onProgress?: (message: string) => void,
): Promise<ResolvedAnalyzePart> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new GeminiError("Empty analyze input", ErrorCode.INVALID_INPUT);
  }

  if (isYouTubeUrl(trimmed)) {
    return { kind: "uri", type: "video", uri: trimmed };
  }

  if (isHttpUrl(trimmed)) {
    const type = inferTypeFromUrl(trimmed);
    const mime = mimeFromUrlPath(new URL(trimmed).pathname, type);
    return { kind: "uri", type, uri: trimmed, mime_type: mime };
  }

  const resolved = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(baseDir, trimmed);

  if (!fs.existsSync(resolved)) {
    throw new GeminiError(`Media file not found: ${resolved}`, ErrorCode.INVALID_INPUT);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new GeminiError(`Not a file: ${resolved}`, ErrorCode.INVALID_INPUT);
  }

  const type = inferMediaRefType(resolved);
  const mime = getMediaMimeType(path.extname(resolved), type);

  if (stat.size <= INLINE_MAX_BYTES) {
    const data = fs.readFileSync(resolved).toString("base64");
    return { kind: "inline", type, data, mime_type: mime };
  }

  onProgress?.(`Uploading large file (${stat.size} bytes): ${resolved}`);
  const uploaded = await uploadFileAndWait(resolved, mime, logger);
  return {
    kind: "uri",
    type,
    uri: uploaded.uri,
    mime_type: uploaded.mimeType,
  };
}

function partToInteractionInput(part: ResolvedAnalyzePart): Record<string, unknown> {
  if (part.kind === "inline") {
    return {
      type: part.type,
      data: part.data,
      mime_type: part.mime_type,
    };
  }
  const out: Record<string, unknown> = {
    type: part.type,
    uri: part.uri,
  };
  if (part.mime_type) {
    out.mime_type = part.mime_type;
  }
  return out;
}

function extractOutputText(interaction: Record<string, unknown>): string {
  if (typeof interaction.output_text === "string") {
    return interaction.output_text;
  }
  const outputs = interaction.outputs;
  if (Array.isArray(outputs)) {
    for (const item of outputs) {
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        if (typeof rec.text === "string") return rec.text;
        if (rec.type === "text" && typeof rec.text === "string") return rec.text;
      }
    }
  }
  return "";
}

/** Analyze media via Interactions API; register local mapping. */
export async function analyzeMedia(
  options: AnalyzeOptions,
): Promise<AnalyzeResult> {
  if (!Array.isArray(options.inputs) || options.inputs.length === 0) {
    throw new GeminiError(
      "analyze requires at least one input (media path/URL and/or generation YAML/JSON)",
      ErrorCode.INVALID_INPUT,
    );
  }
  if (options.inputs.length > MAX_ANALYZE_INPUTS) {
    throw new GeminiError(
      `analyze supports at most ${MAX_ANALYZE_INPUTS} inputs`,
      ErrorCode.INVALID_INPUT,
    );
  }

  const { requestFile, mediaInputs } = partitionAnalyzeInputs(options.inputs);
  let inputs = mediaInputs;
  let prompt = options.prompt?.trim() ?? "";
  let absRequestFile: string | null = null;

  if (requestFile) {
    const context = loadSpecAnalyzeContext(requestFile);
    absRequestFile = context.absRequestFile;
    inputs = resolveInputsFromSpec(mediaInputs, context);
    prompt = buildSpecAnalyzePrompt(prompt, context);
  }

  if (!prompt) {
    throw new GeminiError(
      "analyze prompt is empty; provide --prompt/-p, non-empty stdin, or a generation YAML/JSON among inputs",
      ErrorCode.INVALID_INPUT,
    );
  }

  if (inputs.length === 0) {
    throw new GeminiError(
      "analyze requires at least one media input (or a generation YAML with output)",
      ErrorCode.INVALID_INPUT,
    );
  }
  if (inputs.length > MAX_ANALYZE_INPUTS) {
    throw new GeminiError(
      `analyze supports at most ${MAX_ANALYZE_INPUTS} media inputs`,
      ErrorCode.INVALID_INPUT,
    );
  }

  const model = (options.model?.trim() || DEFAULT_ANALYZE_MODEL);
  const baseDir = options.baseDir ?? process.cwd();
  const logger = options.logger;

  // Ensure client exists early (auth check).
  getGeminiClient(logger);

  const mediaParts: ResolvedAnalyzePart[] = [];
  for (const input of inputs) {
    mediaParts.push(
      await resolveAnalyzeInput(input, baseDir, logger, options.onProgress),
    );
  }

  const input = [
    ...mediaParts.map(partToInteractionInput),
    { type: "text", text: prompt },
  ];

  options.onProgress?.(`Analyzing with ${model}…`);

  let interaction = await createInteraction(
    {
      model,
      input,
      store: true,
      background: false,
    },
    logger,
  );

  let id = interactionIdOf(interaction);
  let status = statusOf(interaction);
  if (status === "in_progress" || status === "requires_action") {
    interaction = await waitForInteraction(id, {
      logger,
      onProgress: (s) => options.onProgress?.(`Analyze status: ${s}`),
      pollIntervalMs: 5000,
    });
    id = interactionIdOf(interaction);
    status = statusOf(interaction);
  }

  if (status === "failed" || status === "cancelled") {
    throw new GeminiError(
      interactionErrorMessage(interaction) ?? `Analyze ${status}`,
      ErrorCode.API,
    );
  }

  const text = extractOutputText(interaction);
  addInteraction(id, absRequestFile, null, getDataDir(), null, prompt);

  return { interactionId: id, text };
}
