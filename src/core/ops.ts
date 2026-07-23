import {
  cancelInteraction as cancelServerInteraction,
  deleteInteraction as deleteServerInteraction,
  getInteraction,
  isNotFoundError,
  createInteraction,
  interactionIdOf,
  statusOf,
  waitForInteraction,
} from "./interactions-api.js";
import {
  addInteraction,
  getAll,
  getById,
  removeInteractionAndTmp,
} from "./interactions-store.js";
import { downloadInteraction, type DownloadOptions } from "./download.js";
import type { GenerateFromFileOptions } from "./generate.js";
import { extractMediaFromInteraction, interactionErrorMessage } from "./media.js";
import {
  assertCanWrite,
  extensionForMime,
  generateOutputFilename,
  saveOutputFile,
} from "./output.js";
import { getAutoOutputDir } from "./paths.js";
import { parseStoredRequestFile, resolveBackground } from "./request.js";
import {
  ErrorCode,
  GeminiError,
  type GenerationResult,
  type GetInteractionResponse,
  type InteractionStatus,
} from "./types.js";
import type { InteractionRecord } from "./interactions-api.js";

const DATA_REDACT_THRESHOLD = 80;

function looksLikeBase64Payload(s: string): boolean {
  if (s.length < DATA_REDACT_THRESHOLD) return false;
  return /^[A-Za-z0-9+/=\s]+$/.test(s.slice(0, 240));
}

/** Redact large base64 / binary fields for readable get/show payloads. */
export function redactHeavyMedia(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactHeavyMedia);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const keyLower = key.toLowerCase();
      if (
        typeof child === "string" &&
        (keyLower === "data" ||
          keyLower.includes("base64") ||
          keyLower === "blob" ||
          looksLikeBase64Payload(child))
      ) {
        out[key] = `<omitted binary, length=${child.length}>`;
      } else {
        out[key] = redactHeavyMedia(child);
      }
    }
    return out;
  }
  if (typeof value === "string" && looksLikeBase64Payload(value)) {
    return `<omitted binary, length=${value.length}>`;
  }
  return value;
}

function stringField(
  record: InteractionRecord,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return null;
}

function buildDetailFields(
  interaction: InteractionRecord,
): Pick<
  GetInteractionResponse,
  | "created"
  | "updated"
  | "previousInteractionId"
  | "model"
  | "usage"
  | "input"
  | "steps"
  | "outputText"
  | "outputImage"
  | "outputAudio"
  | "outputVideo"
> {
  const steps = interaction.steps;
  return {
    created: stringField(interaction, "created"),
    updated: stringField(interaction, "updated"),
    previousInteractionId: stringField(
      interaction,
      "previous_interaction_id",
      "previousInteractionId",
    ),
    model: stringField(interaction, "model"),
    usage: interaction.usage ?? null,
    input: redactHeavyMedia(interaction.input ?? null),
    steps: Array.isArray(steps)
      ? (redactHeavyMedia(steps) as unknown[])
      : null,
    outputText:
      typeof interaction.output_text === "string"
        ? interaction.output_text
        : typeof interaction.outputText === "string"
          ? interaction.outputText
          : null,
    outputImage: redactHeavyMedia(
      interaction.output_image ?? interaction.outputImage ?? null,
    ),
    outputAudio: redactHeavyMedia(
      interaction.output_audio ?? interaction.outputAudio ?? null,
    ),
    outputVideo: redactHeavyMedia(
      interaction.output_video ?? interaction.outputVideo ?? null,
    ),
  };
}

function emptyDetailFields(): Pick<
  GetInteractionResponse,
  | "created"
  | "updated"
  | "previousInteractionId"
  | "model"
  | "usage"
  | "input"
  | "steps"
  | "outputText"
  | "outputImage"
  | "outputAudio"
  | "outputVideo"
> {
  return {
    created: null,
    updated: null,
    previousInteractionId: null,
    model: null,
    usage: null,
    input: null,
    steps: null,
    outputText: null,
    outputImage: null,
    outputAudio: null,
    outputVideo: null,
  };
}

function mappingToResponse(
  interactionId: string,
  exists: boolean,
  status: InteractionStatus | null,
  error: { message: string } | null,
  detail?: ReturnType<typeof buildDetailFields>,
): GetInteractionResponse {
  const mapping = getById(interactionId);
  const fields = detail ?? emptyDetailFields();
  const previousInteractionId =
    fields.previousInteractionId ??
    mapping?.previousInteractionId ??
    null;
  return {
    interactionId,
    status,
    error,
    exists,
    requestFile: mapping?.requestFile ?? null,
    tmpFile: mapping?.tmpFile ?? null,
    index: mapping?.index ?? null,
    previousIndex: mapping?.previousIndex ?? null,
    userText: mapping?.userText ?? null,
    ...fields,
    previousInteractionId,
  };
}

export interface GetInteractionStatusOptions {
  /** When false, omit steps/input/output_* (used by list). Default true. */
  detail?: boolean;
  logger?: GenerateFromFileOptions["logger"];
}

/** Get interaction status; removes stale local mapping when server entry is missing. */
export async function getInteractionStatus(
  interactionId: string,
  loggerOrOptions?:
    | GenerateFromFileOptions["logger"]
    | GetInteractionStatusOptions,
): Promise<GetInteractionResponse> {
  const options: GetInteractionStatusOptions =
    loggerOrOptions &&
    typeof loggerOrOptions === "object" &&
    ("detail" in loggerOrOptions || "logger" in loggerOrOptions)
      ? (loggerOrOptions as GetInteractionStatusOptions)
      : { logger: loggerOrOptions as GenerateFromFileOptions["logger"] };
  const detail = options.detail !== false;
  const logger = options.logger;

  try {
    const interaction = await getInteraction(interactionId, logger);
    const status = statusOf(interaction);
    const errorMessage = interactionErrorMessage(interaction);
    return mappingToResponse(
      interactionId,
      true,
      status,
      errorMessage ? { message: errorMessage } : null,
      detail ? buildDetailFields(interaction) : undefined,
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      removeInteractionAndTmp(interactionId);
      return mappingToResponse(interactionId, false, null, {
        message: `Interaction not found on server: ${interactionId}`,
      });
    }
    throw error;
  }
}

/** Sync local interaction list with server; remove entries missing on server. */
export async function syncInteractions(
  logger?: GenerateFromFileOptions["logger"],
): Promise<{ kept: number; removed: number }> {
  const all = getAll();
  let kept = 0;
  let removed = 0;

  for (const mapping of all) {
    try {
      await getInteraction(mapping.interactionId, logger);
      kept += 1;
    } catch (error) {
      if (isNotFoundError(error)) {
        removeInteractionAndTmp(mapping.interactionId);
        removed += 1;
      } else {
        kept += 1;
      }
    }
  }

  return { kept, removed };
}

export interface ContinueInteractionOptions {
  mode?: GenerateFromFileOptions["mode"];
  background?: boolean;
  force?: boolean;
  overwrite?: boolean | "ask";
  confirmOverwrite?: (path: string) => Promise<boolean>;
  onProgress?: (message: string) => void;
  logger?: GenerateFromFileOptions["logger"];
}

async function saveContinueMedia(
  interaction: Record<string, unknown>,
  options: ContinueInteractionOptions,
  requestType: "image" | "video" | "speech" | "music" | undefined,
  requestOutput: string | undefined,
): Promise<GenerationResult["files"]> {
  const media = await extractMediaFromInteraction(interaction);
  if (media.length === 0) {
    return [];
  }

  const mode = options.mode ?? "mcp";
  const baseDir = getAutoOutputDir(mode);
  const overwrite = mode === "mcp" || options.overwrite === true;
  const files: GenerationResult["files"] = [];

  for (let index = 0; index < media.length; index++) {
    const item = media[index];
    const ext = extensionForMime(
      item.mimeType,
      requestType === "video" ? "mp4" : requestType === "speech" ? "wav" : requestType === "music" ? "mp3" : "png",
    );
    const outputPath =
      requestOutput && index === 0
        ? requestOutput
        : generateOutputFilename(requestType ?? "image", ext, baseDir);

    await assertCanWrite(outputPath, {
      force: options.force,
      overwriteAlways: overwrite,
      prompt: options.confirmOverwrite
        ? () => options.confirmOverwrite!(outputPath)
        : undefined,
    });

    files.push(
      saveOutputFile(item.data, outputPath, item.mimeType, { overwrite: true }),
    );
  }

  return files;
}

/** Continue a conversation using previous_interaction_id. */
export async function continueInteraction(
  interactionId: string,
  text: string,
  options: ContinueInteractionOptions = {},
): Promise<GenerationResult> {
  const mapping = getById(interactionId);
  if (!mapping) {
    throw new GeminiError(
      `Unknown local interaction: ${interactionId}`,
      ErrorCode.INVALID_INPUT,
    );
  }

  const previous = await getInteraction(interactionId, options.logger);
  const model = typeof previous.model === "string" ? previous.model : undefined;

  let requestType: "image" | "video" | "speech" | "music" | undefined;
  let requestOutput: string | undefined;
  let background = options.background;

  if (mapping.requestFile) {
    const parsed = parseStoredRequestFile(mapping.requestFile);
    requestType = parsed.request.type;
    requestOutput = parsed.request.output;
    if (background === undefined) {
      background = resolveBackground(parsed.request);
    }
  }

  background ??= false;

  const params: Record<string, unknown> = {
    ...(model ? { model } : {}),
    input: [{ type: "text", text }],
    previous_interaction_id: interactionId,
    background,
    store: true,
  };

  if (requestType === "image") {
    params.response_format = { type: "image" };
  } else if (requestType === "video") {
    params.response_format = { type: "video", delivery: "inline" };
  } else if (requestType === "speech" || requestType === "music") {
    params.response_format = { type: "audio" };
  }

  let interaction = await createInteraction(params, options.logger);
  const newInteractionId = interactionIdOf(interaction);

  if (!background) {
    const status = statusOf(interaction);
    if (status === "in_progress" || status === "requires_action") {
      interaction = await waitForInteraction(newInteractionId, {
        logger: options.logger,
        onProgress: (s) => options.onProgress?.(`Continue: ${s ?? "unknown"}`),
        pollIntervalMs: requestType === "video" ? 10000 : 2000,
      });
    }

    const finalStatus = statusOf(interaction);
    if (finalStatus !== "completed") {
      throw new GeminiError(
        interactionErrorMessage(interaction) ??
          `Continue interaction failed with status: ${finalStatus ?? "unknown"}`,
        ErrorCode.API,
      );
    }
  }

  addInteraction(
    newInteractionId,
    mapping.requestFile,
    mapping.tmpFile,
    undefined,
    interactionId,
    text,
  );

  const files = background
    ? []
    : await saveContinueMedia(interaction, options, requestType, requestOutput);

  return {
    interactionId: newInteractionId,
    files,
    background,
  };
}

/** Cancel server interaction (does not remove local mapping). */
export async function cancelInteraction(
  interactionId: string,
  logger?: GenerateFromFileOptions["logger"],
): Promise<GetInteractionResponse> {
  await cancelServerInteraction(interactionId, logger);
  return getInteractionStatus(interactionId, logger);
}

/** Delete server interaction and local mapping/tmp. */
export async function deleteInteractionLocal(
  interactionId: string,
  logger?: GenerateFromFileOptions["logger"],
): Promise<void> {
  try {
    await deleteServerInteraction(interactionId, logger);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
  removeInteractionAndTmp(interactionId);
}

export { downloadInteraction, type DownloadOptions };
