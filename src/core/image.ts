import * as fs from "node:fs";
import * as path from "node:path";
import { withRetry } from "./errors.js";
import { getGeminiClient } from "./gemini-client.js";
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
  getImageMimeType,
  saveOutputFile,
} from "./output.js";
import { ErrorCode, GeminiError, type GenerationResult, type ImageRequest, type MediaGenerationOptions } from "./types.js";

const DEFAULT_MODEL = "gemini-3.1-flash-image";

function buildInputParts(request: ImageRequest): unknown[] {
  const parts: unknown[] = [];

  if (request.params.references) {
    for (const image of request.params.references) {
      const data = fs.readFileSync(image.path);
      const ext = path.extname(image.path).toLowerCase();
      parts.push({
        type: "image",
        data: data.toString("base64"),
        mime_type: getImageMimeType(ext),
      });
    }
  }

  parts.push({ type: "text", text: request.params.prompt });
  return parts;
}

async function saveImageMedia(
  request: ImageRequest,
  interaction: Record<string, unknown>,
  options: MediaGenerationOptions,
): Promise<GenerationResult["files"]> {
  const media = await extractMediaFromInteraction(interaction);
  if (media.length === 0) {
    throw new GeminiError("No image data in interaction response", ErrorCode.API);
  }

  const files: GenerationResult["files"] = [];
  const overwrite = options.mode === "mcp" || options.overwrite === true;

  for (let index = 0; index < media.length; index++) {
    const item = media[index];
    const ext = extensionForMime(item.mimeType, "png");
    const outputPath =
      media.length === 1 && request.output
        ? request.output
        : request.output && index === 0
          ? request.output
          : generateOutputFilename("image", ext, options.baseDir);

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
    options.logger?.info(`Image saved: ${files[files.length - 1].filePath}`);
  }

  return files;
}

async function generateImageViaInteractions(
  request: ImageRequest,
  options: MediaGenerationOptions,
): Promise<GenerationResult> {
  const model = request.model ?? DEFAULT_MODEL;
  const params: Record<string, unknown> = {
    model,
    input: buildInputParts(request),
    response_format: {
      type: "image",
      aspect_ratio: request.params.aspectRatio ?? "16:9",
      image_size: request.params.size ?? "1K",
    },
    background: options.background,
    store: true,
  };

  if (request.params.seed != null) {
    params.generation_config = { seed: request.params.seed };
  }

  options.logger?.info(`Generating image with model: ${model}`);

  let interaction = await createInteraction(params, options.logger);
  const interactionId = interactionIdOf(interaction);

  if (!options.background) {
    const status = statusOf(interaction);
    if (status === "in_progress" || status === "requires_action") {
      interaction = await waitForInteraction(interactionId, {
        logger: options.logger,
        onProgress: (s) => options.onProgress?.(`Image generation: ${s ?? "unknown"}`),
        pollIntervalMs: 2000,
      });
    }

    const finalStatus = statusOf(interaction);
    if (finalStatus !== "completed") {
      throw new GeminiError(
        interactionErrorMessage(interaction) ??
          `Image generation ended with status: ${finalStatus ?? "unknown"}`,
        ErrorCode.API,
      );
    }

    const files = await saveImageMedia(request, interaction, options);
    return { interactionId, files, background: false };
  }

  return { interactionId, files: [], background: true };
}

async function generateImageViaGenerateContent(
  request: ImageRequest,
  options: MediaGenerationOptions,
): Promise<GenerationResult> {
  const client = getGeminiClient(options.logger);
  const model = request.model ?? DEFAULT_MODEL;

  const parts: Array<Record<string, unknown>> = [];
  if (request.params.references) {
    for (const image of request.params.references) {
      const data = fs.readFileSync(image.path);
      const ext = path.extname(image.path).toLowerCase();
      parts.push({
        inlineData: {
          mimeType: getImageMimeType(ext),
          data: data.toString("base64"),
        },
      });
    }
  }
  parts.push({ text: request.params.prompt });

  options.logger?.info(`Generating image (legacy) with model: ${model}`);

  const response = await withRetry(
    () =>
      client.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          ...(request.params.seed != null ? { seed: request.params.seed } : {}),
        },
      }),
    { logger: options.logger },
  );

  const content = response.candidates?.[0]?.content?.parts;
  if (!content) {
    throw new GeminiError("No content in image response", ErrorCode.API);
  }

  const pseudoInteraction: Record<string, unknown> = {
    status: "completed",
    steps: [
      {
        type: "model_output",
        content: content.map((part) => {
          if (part.inlineData?.data) {
            return {
              type: "image",
              data: part.inlineData.data,
              mime_type: part.inlineData.mimeType ?? "image/png",
            };
          }
          return part;
        }),
      },
    ],
  };

  const files = await saveImageMedia(request, pseudoInteraction, options);
  return { interactionId: "", files, background: false };
}

/** Generate image via Interactions API (fallback: generateContent). */
export async function generateImage(
  request: ImageRequest,
  options: MediaGenerationOptions,
): Promise<GenerationResult> {
  try {
    return await generateImageViaInteractions(request, options);
  } catch (error) {
    if (error instanceof GeminiError && error.code === ErrorCode.API) {
      options.logger?.warn(
        `Interactions image generation failed, trying legacy API: ${error.message}`,
      );
    } else {
      throw error;
    }
  }

  if (options.background) {
    throw new GeminiError(
      "Background image generation requires the Interactions API",
      ErrorCode.API,
    );
  }

  return generateImageViaGenerateContent(request, options);
}
