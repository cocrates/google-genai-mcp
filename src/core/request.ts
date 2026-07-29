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

function resolveImages(
  rawImages: unknown,
  requestDir: string,
  maxCount: number,
  label: string,
): Array<{ path: string }> | undefined {
  if (rawImages === undefined) {
    return undefined;
  }

  if (!Array.isArray(rawImages)) {
    throw new GeminiError(
      `params.images must be an array for ${label} requests`,
      ErrorCode.INVALID_INPUT,
    );
  }

  if (rawImages.length > maxCount) {
    throw new GeminiError(
      `${label} requests support at most ${maxCount} reference images`,
      ErrorCode.INVALID_INPUT,
    );
  }

  const images: Array<{ path: string }> = [];
  for (const item of rawImages) {
    if (!isObject(item)) {
      throw new GeminiError(
        "Each params.images entry must be an object with path",
        ErrorCode.INVALID_INPUT,
      );
    }
    const imagePath = requireString(item, "path", "params.images[].path");
    const resolved = resolveAgainst(requestDir, imagePath);
    if (!fs.existsSync(resolved)) {
      throw new GeminiError(`Image file not found: ${resolved}`, ErrorCode.INVALID_INPUT);
    }
    images.push({ path: resolved });
  }

  return images;
}

function resolveMediaRefs(
  rawRefs: unknown,
  requestDir: string,
  maxCount: number,
  fieldLabel: string,
  defaultType?: MediaRefType,
): MediaRef[] | undefined {
  if (rawRefs === undefined) {
    return undefined;
  }

  if (!Array.isArray(rawRefs)) {
    throw new GeminiError(
      `${fieldLabel} must be an array for video requests`,
      ErrorCode.INVALID_INPUT,
    );
  }

  if (rawRefs.length > maxCount) {
    throw new GeminiError(
      `video requests support at most ${maxCount} references`,
      ErrorCode.INVALID_INPUT,
    );
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
    const refPath = requireString(item, "path", `${fieldLabel}[].path`);
    const resolved = resolveAgainst(requestDir, refPath);
    if (!fs.existsSync(resolved)) {
      throw new GeminiError(
        `Reference file not found: ${resolved}`,
        ErrorCode.INVALID_INPUT,
      );
    }

    let type: MediaRefType;
    if (typeof item.type === "string") {
      if (!MEDIA_REF_TYPES.has(item.type as MediaRefType)) {
        throw new GeminiError(
          `${fieldLabel}[${i}].type must be image, video, or audio`,
          ErrorCode.INVALID_INPUT,
        );
      }
      type = item.type as MediaRefType;
    } else if (defaultType) {
      type = defaultType;
    } else {
      type = inferMediaRefType(resolved);
    }

    refs.push({ path: resolved, type });
  }

  return refs;
}

/** Prefer params.references; legacy params.images maps to image refs. */
function resolveVideoReferences(
  paramsRaw: Record<string, unknown>,
  requestDir: string,
): MediaRef[] | undefined {
  const hasReferences = paramsRaw.references !== undefined;
  const hasImages = paramsRaw.images !== undefined;

  if (hasReferences && hasImages) {
    throw new GeminiError(
      "Use params.references or params.images for video, not both",
      ErrorCode.INVALID_INPUT,
    );
  }

  if (hasReferences) {
    return resolveMediaRefs(
      paramsRaw.references,
      requestDir,
      MAX_VIDEO_REFS,
      "params.references",
    );
  }

  if (hasImages) {
    return resolveMediaRefs(
      paramsRaw.images,
      requestDir,
      MAX_VIDEO_REFS,
      "params.images",
      "image",
    );
  }

  return undefined;
}

function parseImageRequest(
  raw: Record<string, unknown>,
  requestDir: string,
): ImageRequest {
  const paramsRaw = raw.params;
  if (!isObject(paramsRaw)) {
    throw new GeminiError("Missing params for image request", ErrorCode.INVALID_INPUT);
  }

  const prompt = requireString(paramsRaw, "prompt", "params.prompt");
  const images = resolveImages(paramsRaw.images, requestDir, MAX_IMAGE_REFS, "image");

  const request: ImageRequest = {
    type: "image",
    params: {
      prompt,
      ...(images ? { images } : {}),
    },
  };

  if (typeof raw.model === "string") request.model = raw.model;
  if (typeof raw.background === "boolean") request.background = raw.background;
  if (typeof raw.output === "string") {
    request.output = resolveAgainst(requestDir, raw.output);
  }

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

  const prompt = requireString(paramsRaw, "prompt", "params.prompt");
  const references = resolveVideoReferences(paramsRaw, requestDir);

  const request: VideoRequest = {
    type: "video",
    params: {
      prompt,
      ...(references ? { references } : {}),
    },
  };

  if (typeof raw.model === "string") request.model = raw.model;
  if (typeof raw.background === "boolean") request.background = raw.background;
  if (typeof raw.output === "string") {
    request.output = resolveAgainst(requestDir, raw.output);
  }

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
  if (typeof raw.output === "string") {
    request.output = resolveAgainst(requestDir, raw.output);
  }

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

  const prompt = requireString(paramsRaw, "prompt", "params.prompt");
  const images = resolveImages(
    paramsRaw.images,
    requestDir,
    MAX_MUSIC_REFS,
    "music",
  );

  const request: MusicRequest = {
    type: "music",
    params: {
      prompt,
      ...(images ? { images } : {}),
    },
  };

  if (typeof raw.model === "string") request.model = raw.model;
  if (typeof raw.background === "boolean") request.background = raw.background;
  if (typeof raw.output === "string") {
    request.output = resolveAgainst(requestDir, raw.output);
  }

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
