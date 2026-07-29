import * as fs from "node:fs";
import * as path from "node:path";
import {
  createInteraction,
  interactionIdOf,
  statusOf,
  waitForInteraction,
} from "./interactions-api.js";
import {
  extractMediaFromInteraction,
  interactionErrorMessage,
} from "./media.js";
import {
  assertCanWrite,
  extensionForMime,
  generateOutputFilename,
  getMediaMimeType,
  saveOutputFile,
} from "./output.js";
import {
  ErrorCode,
  GeminiError,
  type GenerationResult,
  type MediaGenerationOptions,
  type MediaRef,
  type VideoRequest,
} from "./types.js";

/** Gemini Omni Flash — Interactions API video generation/editing. */
const DEFAULT_MODEL = "gemini-omni-flash-preview";

function buildInputParts(request: VideoRequest): unknown[] {
  const parts: unknown[] = [];

  // Omni examples put reference media before the text prompt.
  if (request.params.references) {
    for (const ref of request.params.references) {
      const data = fs.readFileSync(ref.path);
      const ext = path.extname(ref.path).toLowerCase();
      parts.push({
        type: ref.type,
        data: data.toString("base64"),
        mime_type: getMediaMimeType(ext, ref.type),
      });
    }
  }

  parts.push({ type: "text", text: request.params.prompt });
  return parts;
}

function inferTask(
  request: VideoRequest,
): "text_to_video" | "image_to_video" | "reference_to_video" {
  const refs = request.params.references ?? [];
  if (refs.length === 0) return "text_to_video";

  const onlyImages = refs.every((r: MediaRef) => r.type === "image");
  if (onlyImages && refs.length === 1) return "image_to_video";
  return "reference_to_video";
}

async function saveVideoMedia(
  request: VideoRequest,
  interaction: Record<string, unknown>,
  options: MediaGenerationOptions,
): Promise<GenerationResult["files"]> {
  const media = await extractMediaFromInteraction(interaction);
  if (media.length === 0) {
    throw new GeminiError("No video data in interaction response", ErrorCode.API);
  }

  const files: GenerationResult["files"] = [];
  const overwrite = options.mode === "mcp" || options.overwrite === true;

  for (let index = 0; index < media.length; index++) {
    const item = media[index]!;
    const ext = extensionForMime(item.mimeType, "mp4");
    const outputPath =
      media.length === 1 && request.output
        ? request.output
        : request.output && index === 0
          ? request.output
          : generateOutputFilename("video", ext, options.baseDir);

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
    options.logger?.info(`Video saved: ${files[files.length - 1]!.filePath}`);
  }

  return files;
}

/** Generate video via Gemini Omni + Interactions API. */
export async function generateVideo(
  request: VideoRequest,
  options: MediaGenerationOptions,
): Promise<GenerationResult> {
  const model = request.model ?? DEFAULT_MODEL;
  const task = inferTask(request);

  const responseFormat: Record<string, unknown> = {
    type: "video",
    aspect_ratio: request.params.aspectRatio ?? "16:9",
    // URI avoids inline size limits for longer/higher-res clips; GET later may still inline.
    delivery: "uri",
  };
  if (request.params.durationSeconds != null) {
    responseFormat.duration = `${request.params.durationSeconds}s`;
  }

  const videoConfig: Record<string, unknown> = { task };
  const generationConfig: Record<string, unknown> = {
    video_config: videoConfig,
  };
  if (request.params.seed != null) {
    generationConfig.seed = request.params.seed;
  }

  if (request.params.resolution) {
    options.logger?.debug(
      `params.resolution=${request.params.resolution} is accepted but not sent (Omni video_config has no resolution field)`,
    );
  }

  const refs = request.params.references ?? [];
  if (refs.some((r) => r.type === "audio")) {
    options.logger?.warn(
      "Audio references are in the request schema but unsupported by the current Omni API; the call may fail or ignore them",
    );
  }
  if (refs.filter((r) => r.type === "video").length > 1) {
    options.logger?.warn(
      "Multiple video references may degrade Omni quality (API limitation)",
    );
  }

  const params: Record<string, unknown> = {
    model,
    input: buildInputParts(request),
    response_format: responseFormat,
    generation_config: generationConfig,
    background: options.background,
    store: true,
  };

  options.logger?.info(
    `Generating video with model: ${model} (task=${task}, refs=${refs.length}, background=${options.background})`,
  );

  let interaction = await createInteraction(params, options.logger);
  const interactionId = interactionIdOf(interaction);

  if (!options.background) {
    const status = statusOf(interaction);
    if (status === "in_progress" || status === "requires_action") {
      interaction = await waitForInteraction(interactionId, {
        logger: options.logger,
        onProgress: (s) =>
          options.onProgress?.(`Video generation: ${s ?? "unknown"}`),
        pollIntervalMs: 10000,
      });
    }

    const finalStatus = statusOf(interaction);
    if (finalStatus !== "completed") {
      throw new GeminiError(
        interactionErrorMessage(interaction) ??
          `Video generation ended with status: ${finalStatus ?? "unknown"}`,
        ErrorCode.API,
      );
    }

    const files = await saveVideoMedia(request, interaction, options);
    return { interactionId, files, background: false };
  }

  return { interactionId, files: [], background: true };
}
