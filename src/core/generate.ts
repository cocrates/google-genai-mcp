import { generateImage } from "./image.js";
import { generateMusic } from "./music.js";
import { generateSpeech } from "./speech.js";
import { generateVideo } from "./video.js";
import { getAutoOutputDir, getDataDir } from "./paths.js";
import { addInteraction } from "./interactions-store.js";
import { copyToTmp } from "./output.js";
import { parseRequestFile, resolveBackground } from "./request.js";
import { createSilentLogger } from "./logger.js";
import type { GenerationResult, Logger, MediaGenerationOptions } from "./types.js";

export interface GenerateFromFileOptions {
  background?: boolean;
  mode: "cli" | "mcp";
  overwrite?: boolean | "ask";
  force?: boolean;
  onProgress?: (message: string) => void;
  confirmOverwrite?: (path: string) => Promise<boolean>;
  logger?: Logger;
}

function buildMediaOptions(
  background: boolean,
  options: GenerateFromFileOptions,
): MediaGenerationOptions {
  return {
    background,
    mode: options.mode,
    baseDir: getAutoOutputDir(options.mode),
    overwrite: options.overwrite === true || options.mode === "mcp",
    force: options.force,
    confirmOverwrite: options.confirmOverwrite,
    logger: options.logger ?? createSilentLogger(),
    onProgress: options.onProgress,
  };
}

function userTextFromRequest(
  request: ReturnType<typeof parseRequestFile>["request"],
): string {
  if (request.type === "speech") return request.params.text;
  return request.params.prompt;
}

/** Parse request file, generate media, and register local interaction mapping. */
export async function generateFromFile(
  filePath: string,
  options: GenerateFromFileOptions,
): Promise<GenerationResult> {
  const parsed = parseRequestFile(filePath);
  const background = resolveBackground(parsed.request, options.background);
  const mediaOptions = buildMediaOptions(background, options);
  const dataDir = getDataDir();

  let result: GenerationResult;

  switch (parsed.request.type) {
    case "image":
      result = await generateImage(parsed.request, mediaOptions);
      break;
    case "video":
      result = await generateVideo(parsed.request, mediaOptions);
      break;
    case "speech":
      result = await generateSpeech(parsed.request, mediaOptions);
      break;
    case "music":
      result = await generateMusic(parsed.request, mediaOptions);
      break;
  }

  const tmpFile = copyToTmp(parsed.absRequestFile, dataDir);
  addInteraction(
    result.interactionId,
    parsed.absRequestFile,
    tmpFile,
    dataDir,
    null,
    userTextFromRequest(parsed.request),
  );

  return {
    interactionId: result.interactionId,
    files: result.files,
    background: result.background,
  };
}
