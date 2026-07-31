// Core types shared between MCP and CLI

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Config {
  logLevel: LogLevel;
}

export type RequestType = "image" | "video" | "speech" | "music";

export type MediaRefType = "image" | "video" | "audio";

export interface MediaRef {
  path: string;
  type: MediaRefType;
}

export interface ImageParams {
  prompt: string;
  /** Reference images (type must be image). */
  references?: MediaRef[];
  size?: "0.5K" | "1K" | "2K" | "4K";
  aspectRatio?: string;
  seed?: number | null;
}

export interface VideoParams {
  prompt: string;
  /** Multimodal references (image, video, audio). */
  references?: MediaRef[];
  /** Output duration in seconds (sent as response_format.duration, e.g. "8s"). */
  durationSeconds?: number;
  /**
   * Reserved / informational. Omni Interactions video_config currently has no
   * resolution field — value is parsed but not sent to the API.
   */
  resolution?: string;
  aspectRatio?: "16:9" | "9:16";
  seed?: number | null;
}

export interface SpeechSpeaker {
  name: string;
  voice: string;
}

export interface SpeechParams {
  text: string;
  voice?: string;
  speakers?: SpeechSpeaker[];
  outputFormat?: "wav" | "mp3" | "ogg";
}

export interface MusicParams {
  prompt: string;
  /** Optional lyrics merged into the API text input with the prompt. */
  lyrics?: string;
  /** Inspiration images (type must be image). */
  references?: MediaRef[];
  outputFormat?: "mp3" | "wav";
  /** If set, save model-generated lyrics/structure text to this path. */
  lyricsOutput?: string;
}

export interface BaseRequest {
  type: RequestType;
  model?: string;
  background?: boolean;
  output?: string;
}

export interface ImageRequest extends BaseRequest {
  type: "image";
  params: ImageParams;
}

export interface VideoRequest extends BaseRequest {
  type: "video";
  params: VideoParams;
}

export interface SpeechRequest extends BaseRequest {
  type: "speech";
  params: SpeechParams;
}

export interface MusicRequest extends BaseRequest {
  type: "music";
  params: MusicParams;
}

export type GenerationRequest =
  | ImageRequest
  | VideoRequest
  | SpeechRequest
  | MusicRequest;

export interface ParsedRequest {
  request: GenerationRequest;
  absRequestFile: string;
  requestDir: string;
}

export interface GeneratedFile {
  filePath: string;
  mimeType: string;
  size: number;
}

export interface GenerationResult {
  interactionId: string;
  files: GeneratedFile[];
  background: boolean;
}

export interface InteractionMapping {
  interactionId: string;
  requestFile: string | null;
  tmpFile: string | null;
  /** Stable local index (starts at 1, monotonic; never reused). */
  index: number;
  /** Stable index of the previous turn; null for root. */
  previousIndex: number | null;
  /** Previous turn id when created via continue; null for root. */
  previousInteractionId?: string | null;
  /**
   * User text for this turn (YAML prompt or continue text).
   * Stored locally because server get often omits input for image turns.
   */
  userText?: string | null;
}

export interface InteractionsStore {
  version: 1;
  /** Next stable index to assign (always increases; gaps after delete are OK). */
  nextIndex: number;
  interactions: InteractionMapping[];
}

export type InteractionStatus =
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled"
  | "requires_action";

export interface GetInteractionResponse {
  interactionId: string;
  status: InteractionStatus | null;
  error: { message: string } | null;
  exists: boolean;
  requestFile: string | null;
  tmpFile: string | null;
  /** Stable local index (from interactions.json). */
  index: number | null;
  /** Stable local previous-turn index. */
  previousIndex: number | null;
  /** Locally stored user prompt / continue text. */
  userText: string | null;
  /** Server timestamps (ISO 8601), when available */
  created: string | null;
  updated: string | null;
  previousInteractionId: string | null;
  model: string | null;
  usage: unknown | null;
  /** Request input snapshot from the server */
  input: unknown | null;
  /** Execution timeline (user_input, model_output, …); binary data redacted */
  steps: unknown[] | null;
  /** SDK convenience outputs; binary data redacted */
  outputText: string | null;
  outputImage: unknown | null;
  outputAudio: unknown | null;
  outputVideo: unknown | null;
}

export enum ErrorCode {
  GENERAL = 1,
  INVALID_INPUT = 2,
  AUTH = 3,
  API = 4,
}

export class GeminiError extends Error {
  readonly code: ErrorCode;
  readonly cause?: unknown;

  constructor(message: string, code: ErrorCode, cause?: unknown) {
    super(message);
    this.name = "GeminiError";
    this.code = code;
    this.cause = cause;
  }
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export type RunMode = "cli" | "mcp";

export interface MediaItem {
  data: Buffer;
  mimeType: string;
}

/** All 30 prebuilt TTS voices from Google Speech generation docs. */
export const TTS_VOICES = [
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
] as const;

export type TtsVoice = (typeof TTS_VOICES)[number];

export interface MediaGenerationOptions {
  background: boolean;
  mode: RunMode;
  baseDir: string;
  overwrite?: boolean;
  force?: boolean;
  confirmOverwrite?: (path: string) => Promise<boolean>;
  logger?: Logger;
  onProgress?: (message: string) => void;
}
