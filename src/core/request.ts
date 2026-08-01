import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { resolveAgainst } from "./paths.js";
import { inferMediaRefType } from "./output.js";
import {
  ErrorCode,
  GeminiError,
  type GenerationRequest,
  type ImageRequest,
  type MediaRef,
  type MediaRefType,
  type MusicRequest,
  type ParsedRequest,
  type SpeechRequest,
  type VideoRequest,
} from "./types.js";

const MAX_IMAGE_REFS = 19;
/** Omni accepts multiple multimodal references; keep a practical upper bound. */
const MAX_VIDEO_REFS = 10;
/** Lyria 3 supports up to 10 inspiration images. */
const MAX_MUSIC_REFS = 10;

const MEDIA_REF_TYPES = new Set<MediaRefType>(["image", "video", "audio"]);

/** Generation request files allowed in `params.references[].path`. */
const SPEC_REF_EXTS = new Set([".yaml", ".yml", ".json"]);

const IMAGE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".heic",
  ".heif",
]);
const VIDEO_EXTS = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".mpeg",
  ".mpg",
  ".avi",
  ".mkv",
]);
const AUDIO_EXTS = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".aac",
  ".flac",
  ".opus",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, label: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new GeminiError(`Missing or invalid ${label}`, ErrorCode.INVALID_INPUT);
  }
  return value;
}

/** True when path points at a generation request YAML/JSON by extension. */
export function isSpecReferencePath(filePath: string): boolean {
  return SPEC_REF_EXTS.has(path.extname(filePath).toLowerCase());
}

/**
 * Resolve optional top-level `output`. Empty/whitespace is invalid
 * (would otherwise collapse to the request directory).
 */
function resolveOutputField(
  raw: Record<string, unknown>,
  requestDir: string,
): string | undefined {
  if (raw.output === undefined || raw.output === null) {
    return undefined;
  }
  if (typeof raw.output !== "string" || raw.output.trim() === "") {
    throw new GeminiError(
      "output must be a non-empty file path",
      ErrorCode.INVALID_INPUT,
    );
  }
  return resolveAgainst(requestDir, raw.output.trim());
}

/** `params.images` is removed; callers must use `params.references`. */
function rejectLegacyImages(paramsRaw: Record<string, unknown>): void {
  if (paramsRaw.images !== undefined) {
    throw new GeminiError(
      "params.images is removed; use params.references (e.g. references: [{ path: \"./char.yaml\" }])",
      ErrorCode.INVALID_INPUT,
    );
  }
}

function assertExtensionMatchesType(
  resolved: string,
  type: MediaRefType,
  fieldLabel: string,
  index: number,
): void {
  const ext = path.extname(resolved).toLowerCase();
  const allowed =
    type === "image" ? IMAGE_EXTS : type === "video" ? VIDEO_EXTS : AUDIO_EXTS;
  if (!allowed.has(ext)) {
    throw new GeminiError(
      `${fieldLabel}[${index}]: extension "${ext}" is not valid for type ${type} (${resolved})`,
      ErrorCode.INVALID_INPUT,
    );
  }
}

function assertExistingFile(resolved: string, label: string): void {
  if (!fs.existsSync(resolved)) {
    throw new GeminiError(`${label} not found: ${resolved}`, ErrorCode.INVALID_INPUT);
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch (error) {
    throw new GeminiError(
      `Cannot stat ${label}: ${resolved}`,
      ErrorCode.INVALID_INPUT,
      error,
    );
  }
  if (!stat.isFile()) {
    throw new GeminiError(
      `${label} is not a file: ${resolved}`,
      ErrorCode.INVALID_INPUT,
    );
  }
}

/**
 * Read a generation YAML/JSON and return its `output` media path, resolved
 * against **that file's directory** (not the caller's).
 */
function loadSpecOutputMedia(
  absSpecPath: string,
  fieldLabel: string,
  index: number,
): string {
  assertExistingFile(absSpecPath, "Reference spec");
  const specDir = path.dirname(absSpecPath);
  const text = fs.readFileSync(absSpecPath, "utf-8");
  const ext = path.extname(absSpecPath).toLowerCase();
  let raw: unknown;
  try {
    raw = ext === ".json" ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    throw new GeminiError(
      `${fieldLabel}[${index}]: failed to parse reference spec ${absSpecPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      ErrorCode.INVALID_INPUT,
      error,
    );
  }
  if (!isObject(raw)) {
    throw new GeminiError(
      `${fieldLabel}[${index}]: reference spec must be an object (${absSpecPath})`,
      ErrorCode.INVALID_INPUT,
    );
  }
  const output = resolveOutputField(raw, specDir);
  if (!output) {
    throw new GeminiError(
      `${fieldLabel}[${index}]: reference spec has no output (${absSpecPath})`,
      ErrorCode.INVALID_INPUT,
    );
  }
  assertExistingFile(output, `${fieldLabel}[${index}] output media`);
  return output;
}

function resolveOneMediaRef(
  item: Record<string, unknown>,
  requestDir: string,
  fieldLabel: string,
  index: number,
  options: {
    requestKind: "image" | "video" | "music";
    imageOnly?: boolean;
  },
): MediaRef {
  const refPath = requireString(item, "path", `${fieldLabel}[].path`);
  const resolved = resolveAgainst(requestDir, refPath.trim());

  let mediaPath = resolved;
  if (isSpecReferencePath(resolved)) {
    mediaPath = loadSpecOutputMedia(resolved, fieldLabel, index);
  } else {
    assertExistingFile(resolved, "Reference file");
  }

  let type: MediaRefType;
  if (typeof item.type === "string") {
    if (!MEDIA_REF_TYPES.has(item.type as MediaRefType)) {
      throw new GeminiError(
        `${fieldLabel}[${index}].type must be image, video, or audio`,
        ErrorCode.INVALID_INPUT,
      );
    }
    type = item.type as MediaRefType;
  } else if (options.imageOnly) {
    type = "image";
  } else {
    type = inferMediaRefType(mediaPath);
  }

  if (options.imageOnly && type !== "image") {
    throw new GeminiError(
      `${options.requestKind} references support image only; got type ${type} at ${fieldLabel}[${index}] (${mediaPath})`,
      ErrorCode.INVALID_INPUT,
    );
  }

  assertExtensionMatchesType(mediaPath, type, fieldLabel, index);
  return { path: mediaPath, type };
}

/**
 * Resolve `params.references` to concrete media files.
 * - Media path → that file (relative to `requestDir`)
 * - `.yaml`/`.yml`/`.json` → that spec's `output` media (relative to **the
 *   referenced spec's directory**)
 */
function resolveMediaRefs(
  rawRefs: unknown,
  requestDir: string,
  maxCount: number,
  fieldLabel: string,
  options: {
    requestKind: "image" | "video" | "music";
    /** When set, omit type → this; and only this type is allowed. */
    imageOnly?: boolean;
  },
): MediaRef[] | undefined {
  if (rawRefs === undefined) {
    return undefined;
  }

  if (!Array.isArray(rawRefs)) {
    throw new GeminiError(
      `${fieldLabel} must be an array for ${options.requestKind} requests`,
      ErrorCode.INVALID_INPUT,
    );
  }

  if (rawRefs.length > maxCount) {
    throw new GeminiError(
      `${options.requestKind} requests support at most ${maxCount} references`,
      ErrorCode.INVALID_INPUT,
    );
  }

  if (rawRefs.length === 0) {
    return undefined;
  }

  const refs: MediaRef[] = [];
  for (let i = 0; i < rawRefs.length; i++) {
    const item = rawRefs[i];
    if (!isObject(item)) {
      throw new GeminiError(
        `Each ${fieldLabel} entry must be an object with path`,
        ErrorCode.INVALID_INPUT,
      );
    }
    refs.push(resolveOneMediaRef(item, requestDir, fieldLabel, i, options));
  }

  return refs;
}

function parseImageRequest(
  raw: Record<string, unknown>,
  requestDir: string,
): ImageRequest {
  const paramsRaw = raw.params;
  if (!isObject(paramsRaw)) {
    throw new GeminiError("Missing params for image request", ErrorCode.INVALID_INPUT);
  }

  rejectLegacyImages(paramsRaw);
  const prompt = requireString(paramsRaw, "prompt", "params.prompt");
  const references = resolveMediaRefs(
    paramsRaw.references,
    requestDir,
    MAX_IMAGE_REFS,
    "params.references",
    { requestKind: "image", imageOnly: true },
  );

  const request: ImageRequest = {
    type: "image",
    params: {
      prompt,
      ...(references ? { references } : {}),
    },
  };

  if (typeof raw.model === "string") request.model = raw.model;
  if (typeof raw.background === "boolean") request.background = raw.background;
  const output = resolveOutputField(raw, requestDir);
  if (output) request.output = output;

  if (typeof paramsRaw.size === "string") {
    request.params.size = paramsRaw.size as ImageRequest["params"]["size"];
  }
  if (typeof paramsRaw.aspectRatio === "string") {
    request.params.aspectRatio = paramsRaw.aspectRatio;
  }
  if (typeof paramsRaw.seed === "number" || paramsRaw.seed === null) {
    request.params.seed = paramsRaw.seed;
  }

  return request;
}

function parseVideoRequest(
  raw: Record<string, unknown>,
  requestDir: string,
): VideoRequest {
  const paramsRaw = raw.params;
  if (!isObject(paramsRaw)) {
    throw new GeminiError("Missing params for video request", ErrorCode.INVALID_INPUT);
  }

  rejectLegacyImages(paramsRaw);
  const prompt = requireString(paramsRaw, "prompt", "params.prompt");
  const references = resolveMediaRefs(
    paramsRaw.references,
    requestDir,
    MAX_VIDEO_REFS,
    "params.references",
    { requestKind: "video" },
  );

  const request: VideoRequest = {
    type: "video",
    params: {
      prompt,
      ...(references ? { references } : {}),
    },
  };

  if (typeof raw.model === "string") request.model = raw.model;
  if (typeof raw.background === "boolean") request.background = raw.background;
  const output = resolveOutputField(raw, requestDir);
  if (output) request.output = output;

  if (typeof paramsRaw.durationSeconds === "number") {
    request.params.durationSeconds = paramsRaw.durationSeconds;
  }
  if (typeof paramsRaw.resolution === "string") {
    request.params.resolution = paramsRaw.resolution;
  }
  if (typeof paramsRaw.aspectRatio === "string") {
    request.params.aspectRatio = paramsRaw.aspectRatio as VideoRequest["params"]["aspectRatio"];
  }
  if (typeof paramsRaw.seed === "number" || paramsRaw.seed === null) {
    request.params.seed = paramsRaw.seed;
  }

  return request;
}

function parseSpeechRequest(
  raw: Record<string, unknown>,
  requestDir: string,
): SpeechRequest {
  const paramsRaw = raw.params;
  if (!isObject(paramsRaw)) {
    throw new GeminiError("Missing params for speech request", ErrorCode.INVALID_INPUT);
  }

  const text = requireString(paramsRaw, "text", "params.text");

  const request: SpeechRequest = {
    type: "speech",
    params: { text },
  };

  if (typeof raw.model === "string") request.model = raw.model;
  if (typeof raw.background === "boolean") request.background = raw.background;
  const output = resolveOutputField(raw, requestDir);
  if (output) request.output = output;

  if (typeof paramsRaw.voice === "string") request.params.voice = paramsRaw.voice;

  if (paramsRaw.speakers !== undefined) {
    if (!Array.isArray(paramsRaw.speakers)) {
      throw new GeminiError("params.speakers must be an array", ErrorCode.INVALID_INPUT);
    }
    if (paramsRaw.speakers.length > 2) {
      throw new GeminiError("params.speakers supports at most 2 speakers", ErrorCode.INVALID_INPUT);
    }
    request.params.speakers = paramsRaw.speakers.map((speaker, index) => {
      if (!isObject(speaker)) {
        throw new GeminiError(
          `params.speakers[${index}] must be an object`,
          ErrorCode.INVALID_INPUT,
        );
      }
      return {
        name: requireString(speaker, "name", `params.speakers[${index}].name`),
        voice: requireString(speaker, "voice", `params.speakers[${index}].voice`),
      };
    });
  }

  if (typeof paramsRaw.outputFormat === "string") {
    request.params.outputFormat =
      paramsRaw.outputFormat as SpeechRequest["params"]["outputFormat"];
  }

  return request;
}

function parseMusicRequest(
  raw: Record<string, unknown>,
  requestDir: string,
): MusicRequest {
  const paramsRaw = raw.params;
  if (!isObject(paramsRaw)) {
    throw new GeminiError("Missing params for music request", ErrorCode.INVALID_INPUT);
  }

  rejectLegacyImages(paramsRaw);
  const prompt = requireString(paramsRaw, "prompt", "params.prompt");
  const references = resolveMediaRefs(
    paramsRaw.references,
    requestDir,
    MAX_MUSIC_REFS,
    "params.references",
    { requestKind: "music", imageOnly: true },
  );

  const request: MusicRequest = {
    type: "music",
    params: {
      prompt,
      ...(references ? { references } : {}),
    },
  };

  if (typeof raw.model === "string") request.model = raw.model;
  if (typeof raw.background === "boolean") request.background = raw.background;
  const output = resolveOutputField(raw, requestDir);
  if (output) request.output = output;

  if (typeof paramsRaw.lyrics === "string" && paramsRaw.lyrics.trim()) {
    request.params.lyrics = paramsRaw.lyrics;
  }
  if (typeof paramsRaw.outputFormat === "string") {
    request.params.outputFormat =
      paramsRaw.outputFormat as MusicRequest["params"]["outputFormat"];
  }
  if (typeof paramsRaw.lyricsOutput === "string") {
    request.params.lyricsOutput = resolveAgainst(
      requestDir,
      paramsRaw.lyricsOutput,
    );
  }

  return request;
}

/** Parse and validate a YAML/JSON request file. */
export function parseRequestFile(filePath: string): ParsedRequest {
  const absRequestFile = path.resolve(filePath);
  if (!fs.existsSync(absRequestFile)) {
    throw new GeminiError(`Request file not found: ${absRequestFile}`, ErrorCode.INVALID_INPUT);
  }

  const requestDir = path.dirname(absRequestFile);
  const ext = path.extname(absRequestFile).toLowerCase();
  const text = fs.readFileSync(absRequestFile, "utf-8");

  let raw: unknown;
  try {
    raw = ext === ".json" ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    throw new GeminiError(
      `Failed to parse request file: ${error instanceof Error ? error.message : String(error)}`,
      ErrorCode.INVALID_INPUT,
      error,
    );
  }

  if (!isObject(raw)) {
    throw new GeminiError("Request file must contain an object", ErrorCode.INVALID_INPUT);
  }

  const type = requireString(raw, "type", "type");
  let request: GenerationRequest;

  switch (type) {
    case "image":
      request = parseImageRequest(raw, requestDir);
      break;
    case "video":
      request = parseVideoRequest(raw, requestDir);
      break;
    case "speech":
      request = parseSpeechRequest(raw, requestDir);
      break;
    case "music":
      request = parseMusicRequest(raw, requestDir);
      break;
    case "audio":
      throw new GeminiError(
        'type "audio" is removed; use type: speech for TTS (Gemini) or type: music for Lyria 3',
        ErrorCode.INVALID_INPUT,
      );
    default:
      throw new GeminiError(
        `Unsupported request type: ${type}. Expected image, video, speech, or music.`,
        ErrorCode.INVALID_INPUT,
      );
  }

  return { request, absRequestFile, requestDir };
}

/** Compute effective background flag: yaml ?? mcp ?? false (all types). */
export function resolveBackground(
  request: GenerationRequest,
  mcpBackground?: boolean,
): boolean {
  if (typeof request.background === "boolean") {
    return request.background;
  }
  if (typeof mcpBackground === "boolean") {
    return mcpBackground;
  }
  return false;
}

/** Load request from an absolute path stored in interactions.json. */
export function parseStoredRequestFile(absRequestFile: string): ParsedRequest {
  return parseRequestFile(absRequestFile);
}
