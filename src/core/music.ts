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
  generateOutputFilename,
  getAudioMimeType,
  getImageMimeType,
  saveOutputFile,
} from "./output.js";
import {
  ErrorCode,
  GeminiError,
  type GenerationResult,
  type MediaGenerationOptions,
  type MusicRequest,
} from "./types.js";

const DEFAULT_MODEL = "lyria-3-clip-preview";

/** Compose prompt + optional lyrics for Lyria text input. */
export function composeMusicInputText(request: MusicRequest): string {
  const prompt = request.params.prompt.trim();
  const lyrics = request.params.lyrics?.trim();
  if (!lyrics) return prompt;
  return `${prompt}\n\nUse the following lyrics and section tags:\n\n${lyrics}`;
}

function buildInputParts(request: MusicRequest): unknown[] {
  const parts: unknown[] = [
    { type: "text", text: composeMusicInputText(request) },
  ];

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

  return parts;
}

export function extractLyricsText(interaction: Record<string, unknown>): string | null {
  if (typeof interaction.output_text === "string" && interaction.output_text.trim()) {
    return interaction.output_text.trim();
  }
  if (typeof interaction.outputText === "string" && interaction.outputText.trim()) {
    return interaction.outputText.trim();
  }

  const chunks: string[] = [];
  if (Array.isArray(interaction.steps)) {
    for (const step of interaction.steps) {
      if (!step || typeof step !== "object") continue;
      const s = step as { type?: unknown; content?: unknown };
      if (s.type !== "model_output") continue;
      const content = s.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as { type?: unknown; text?: unknown };
        if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
          chunks.push(b.text.trim());
        }
      }
    }
  }

  return chunks.length ? chunks.join("\n\n") : null;
}

async function saveMusicOutputs(
  request: MusicRequest,
  interaction: Record<string, unknown>,
  options: MediaGenerationOptions,
): Promise<GenerationResult["files"]> {
  const media = await extractMediaFromInteraction(interaction);
  if (media.length === 0) {
    throw new GeminiError(
      "No audio data in music interaction response",
      ErrorCode.API,
    );
  }

  const outputFormat = request.params.outputFormat ?? "mp3";
  const defaultMime = getAudioMimeType(outputFormat);
  const overwrite = options.mode === "mcp" || options.overwrite === true;
  const files: GenerationResult["files"] = [];

  const item = media[0]!;
  const mimeType = item.mimeType || defaultMime;
  const outputPath =
    request.output ??
    generateOutputFilename("music", outputFormat, options.baseDir);

  await assertCanWrite(outputPath, {
    force: options.force,
    overwriteAlways: overwrite,
    prompt: options.confirmOverwrite
      ? () => options.confirmOverwrite!(outputPath)
      : undefined,
  });

  const audioFile = saveOutputFile(item.data, outputPath, mimeType, {
    overwrite: true,
  });
  files.push(audioFile);
  options.logger?.info(`Music saved: ${audioFile.filePath}`);

  const lyricsPath = request.params.lyricsOutput;
  if (lyricsPath) {
    const lyrics = extractLyricsText(interaction);
    if (lyrics) {
      await assertCanWrite(lyricsPath, {
        force: options.force,
        overwriteAlways: overwrite,
        prompt: options.confirmOverwrite
          ? () => options.confirmOverwrite!(lyricsPath)
          : undefined,
      });
      fs.mkdirSync(path.dirname(lyricsPath), { recursive: true });
      fs.writeFileSync(lyricsPath, lyrics + "\n", "utf-8");
      const st = fs.statSync(lyricsPath);
      files.push({
        filePath: lyricsPath,
        mimeType: "text/plain",
        size: st.size,
      });
      options.logger?.info(`Lyrics saved: ${lyricsPath}`);
    } else {
      options.logger?.warn(
        `lyricsOutput set but no lyrics/structure text in response: ${lyricsPath}`,
      );
    }
  }

  return files;
}

/** Generate music via Lyria 3 + Interactions API. */
export async function generateMusic(
  request: MusicRequest,
  options: MediaGenerationOptions,
): Promise<GenerationResult> {
  const model = request.model ?? DEFAULT_MODEL;

  // Lyria docs use { type: "audio" } only; mime_type can 400 like TTS.
  const params: Record<string, unknown> = {
    model,
    input: buildInputParts(request),
    response_format: { type: "audio" },
    background: options.background,
    store: true,
  };

  options.logger?.info(`Generating music with model: ${model}`);

  let interaction = await createInteraction(params, options.logger);
  const interactionId = interactionIdOf(interaction);

  if (!options.background) {
    const status = statusOf(interaction);
    if (status === "in_progress" || status === "requires_action") {
      interaction = await waitForInteraction(interactionId, {
        logger: options.logger,
        onProgress: (s) =>
          options.onProgress?.(`Music generation: ${s ?? "unknown"}`),
        pollIntervalMs: 5000,
      });
    }

    const finalStatus = statusOf(interaction);
    if (finalStatus !== "completed") {
      throw new GeminiError(
        interactionErrorMessage(interaction) ??
          `Music generation ended with status: ${finalStatus ?? "unknown"}`,
        ErrorCode.API,
      );
    }

    const files = await saveMusicOutputs(request, interaction, options);
    return { interactionId, files, background: false };
  }

  return { interactionId, files: [], background: true };
}
