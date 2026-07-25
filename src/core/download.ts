import * as path from "node:path";
import * as fs from "node:fs";
import {
  getInteraction,
  isNotFoundError,
} from "./interactions-api.js";
import {
  getById,
  removeInteractionAndTmp,
} from "./interactions-store.js";
import { extractMediaFromInteraction, interactionErrorMessage } from "./media.js";
import { extractLyricsText } from "./music.js";
import {
  assertCanWrite,
  ensureWavContainer,
  extensionForMime,
  generateOutputFilename,
  saveOutputFile,
} from "./output.js";
import { getAutoOutputDir, resolveAgainst } from "./paths.js";
import { parseStoredRequestFile } from "./request.js";
import {
  ErrorCode,
  GeminiError,
  type GeneratedFile,
  type GenerationRequest,
  type Logger,
  type RunMode,
} from "./types.js";

export interface DownloadOptions {
  mode?: RunMode;
  overwrite?: boolean | "ask";
  force?: boolean;
  confirmOverwrite?: (path: string) => Promise<boolean>;
  logger?: Logger;
}

function resolveRequestFromMapping(
  interactionId: string,
  filePath: string | undefined,
  mode: RunMode,
): { request: GenerationRequest | null; requestDir: string; baseDir: string } {
  const mapping = getById(interactionId);
  const baseDir = getAutoOutputDir(mode);

  if (mapping?.requestFile) {
    const parsed = parseStoredRequestFile(mapping.requestFile);
    return {
      request: parsed.request,
      requestDir: parsed.requestDir,
      baseDir,
    };
  }

  return { request: null, requestDir: baseDir, baseDir };
}

function defaultExtension(type: GenerationRequest["type"] | undefined): string {
  switch (type) {
    case "video":
      return "mp4";
    case "speech":
      return "wav";
    case "music":
      return "mp3";
    default:
      return "png";
  }
}

/** Download completed interaction output to local files. */
export async function downloadInteraction(
  interactionId: string,
  filePath?: string,
  options: DownloadOptions = {},
): Promise<GeneratedFile[]> {
  const mode = options.mode ?? "mcp";
  const overwrite = mode === "mcp" || options.overwrite === true;

  let interaction;
  try {
    interaction = await getInteraction(interactionId, options.logger);
  } catch (error) {
    if (isNotFoundError(error)) {
      removeInteractionAndTmp(interactionId);
    }
    throw error;
  }

  const status = interaction.status;
  if (status !== "completed") {
    const message =
      interactionErrorMessage(interaction) ??
      `Interaction is not completed (status: ${String(status)})`;
    throw new GeminiError(message, ErrorCode.API);
  }

  const media = await extractMediaFromInteraction(interaction);
  if (media.length === 0) {
    throw new GeminiError(
      "Interaction completed but contains no downloadable media",
      ErrorCode.API,
    );
  }

  const context = resolveRequestFromMapping(interactionId, filePath, mode);
  const requestType = context.request?.type;
  const files: GeneratedFile[] = [];

  for (let index = 0; index < media.length; index++) {
    const item = media[index];
    const fallbackExt = defaultExtension(requestType);
    const ext = extensionForMime(item.mimeType, fallbackExt);

    let outputPath: string;
    if (filePath && media.length === 1) {
      outputPath = path.isAbsolute(filePath)
        ? path.resolve(filePath)
        : resolveAgainst(context.requestDir, filePath);
    } else if (context.request?.output && index === 0) {
      outputPath = context.request.output;
    } else if (filePath && index === 0) {
      outputPath = path.isAbsolute(filePath)
        ? path.resolve(filePath)
        : resolveAgainst(context.requestDir, filePath);
    } else {
      outputPath = generateOutputFilename(
        requestType ?? "image",
        ext,
        context.baseDir,
      );
    }

    await assertCanWrite(outputPath, {
      force: options.force,
      overwriteAlways: overwrite,
      prompt: options.confirmOverwrite
        ? () => options.confirmOverwrite!(outputPath)
        : undefined,
    });

    // Gemini TTS returns raw L16 PCM; wrap as WAV when saving .wav (same as speech.ts).
    const wantsWav =
      ext === "wav" ||
      outputPath.toLowerCase().endsWith(".wav") ||
      item.mimeType.startsWith("audio/l16") ||
      item.mimeType === "audio/pcm";
    const payload = wantsWav ? ensureWavContainer(item.data) : item.data;
    const outMime = wantsWav ? "audio/wav" : item.mimeType;

    files.push(
      saveOutputFile(payload, outputPath, outMime, { overwrite: true }),
    );
    options.logger?.info(`Downloaded: ${files[files.length - 1]!.filePath}`);
  }

  if (context.request?.type === "music" && context.request.params.lyricsOutput) {
    const lyricsPath = context.request.params.lyricsOutput;
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
      options.logger?.info(`Downloaded lyrics: ${lyricsPath}`);
    }
  }

  return files;
}
