import {
  createInteraction,
  interactionIdOf,
  statusOf,
  waitForInteraction,
} from "./interactions-api.js";
import { getGeminiClient } from "./gemini-client.js";
import {
  extractMediaFromInteraction,
  interactionErrorMessage,
} from "./media.js";
import {
  assertCanWrite,
  ensureWavContainer,
  generateOutputFilename,
  getAudioMimeType,
  saveOutputFile,
} from "./output.js";
import { withRetry } from "./errors.js";
import {
  ErrorCode,
  GeminiError,
  type GenerationResult,
  type MediaGenerationOptions,
  type SpeechRequest,
} from "./types.js";

const DEFAULT_MODEL = "gemini-3.1-flash-tts-preview";

function buildSpeechConfig(request: SpeechRequest): unknown[] {
  if (request.params.speakers?.length) {
    return request.params.speakers.map((speaker) => ({
      speaker: speaker.name,
      voice: speaker.voice,
    }));
  }

  return [
    {
      voice: request.params.voice ?? "Kore",
    },
  ];
}

async function saveSpeechMedia(
  request: SpeechRequest,
  interaction: Record<string, unknown>,
  options: MediaGenerationOptions,
): Promise<GenerationResult["files"]> {
  const media = await extractMediaFromInteraction(interaction);
  if (media.length === 0) {
    throw new GeminiError(
      "No audio data in speech interaction response",
      ErrorCode.API,
    );
  }

  const outputFormat = request.params.outputFormat ?? "wav";
  const defaultMime = getAudioMimeType(outputFormat);
  const overwrite = options.mode === "mcp" || options.overwrite === true;

  const item = media[0]!;
  const mimeType = item.mimeType || defaultMime;
  const payload =
    outputFormat === "wav"
      ? ensureWavContainer(item.data)
      : item.data;
  const outputPath =
    request.output ??
    generateOutputFilename("speech", outputFormat, options.baseDir);

  await assertCanWrite(outputPath, {
    force: options.force,
    overwriteAlways: overwrite,
    prompt: options.confirmOverwrite
      ? () => options.confirmOverwrite!(outputPath)
      : undefined,
  });

  const file = saveOutputFile(payload, outputPath, mimeType, {
    overwrite: true,
  });
  options.logger?.info(`Speech saved: ${file.filePath}`);
  return [file];
}

async function generateSpeechViaInteractions(
  request: SpeechRequest,
  options: MediaGenerationOptions,
): Promise<GenerationResult> {
  const model = request.model ?? DEFAULT_MODEL;
  const params: Record<string, unknown> = {
    model,
    input: [{ type: "text", text: request.params.text }],
    // Official TTS docs: only { type: "audio" } — mime_type is rejected (400).
    response_format: { type: "audio" },
    background: options.background,
    store: true,
    generation_config: {
      speech_config: buildSpeechConfig(request),
    },
  };

  options.logger?.info(`Generating speech with model: ${model}`);

  let interaction = await createInteraction(params, options.logger);
  const interactionId = interactionIdOf(interaction);

  if (!options.background) {
    const status = statusOf(interaction);
    if (status === "in_progress" || status === "requires_action") {
      interaction = await waitForInteraction(interactionId, {
        logger: options.logger,
        onProgress: (s) =>
          options.onProgress?.(`Speech generation: ${s ?? "unknown"}`),
        pollIntervalMs: 2000,
      });
    }

    const finalStatus = statusOf(interaction);
    if (finalStatus !== "completed") {
      throw new GeminiError(
        interactionErrorMessage(interaction) ??
          `Speech generation ended with status: ${finalStatus ?? "unknown"}`,
        ErrorCode.API,
      );
    }

    const files = await saveSpeechMedia(request, interaction, options);
    return { interactionId, files, background: false };
  }

  return { interactionId, files: [], background: true };
}

async function generateSpeechViaGenerateContent(
  request: SpeechRequest,
  options: MediaGenerationOptions,
): Promise<GenerationResult> {
  const client = getGeminiClient(options.logger);
  const model = request.model ?? DEFAULT_MODEL;
  const speakers = request.params.speakers;
  const voice = request.params.voice ?? "Kore";

  let fullPrompt = request.params.text;
  if (!speakers) {
    fullPrompt = `[Voice: ${voice}] ${fullPrompt}`;
  }

  options.logger?.info(`Generating speech (legacy) with model: ${model}`);

  const response = await withRetry(
    () =>
      client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: speakers
            ? {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: speakers.map((s) => ({
                    speaker: s.name,
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: s.voice },
                    },
                  })),
                },
              }
            : {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voice },
                },
              },
        },
      }),
    { logger: options.logger },
  );

  const content = response.candidates?.[0]?.content?.parts;
  if (!content) {
    throw new GeminiError("No content in speech response", ErrorCode.API);
  }

  const pseudoInteraction: Record<string, unknown> = {
    status: "completed",
    steps: [
      {
        type: "model_output",
        content: content
          .filter((part) => part.inlineData?.data)
          .map((part) => ({
            type: "audio",
            data: part.inlineData!.data,
            mime_type:
              part.inlineData!.mimeType ??
              getAudioMimeType(request.params.outputFormat ?? "wav"),
          })),
      },
    ],
  };

  const files = await saveSpeechMedia(request, pseudoInteraction, options);
  return { interactionId: "", files, background: false };
}

/** Generate speech (TTS) via Interactions API (fallback: generateContent). */
export async function generateSpeech(
  request: SpeechRequest,
  options: MediaGenerationOptions,
): Promise<GenerationResult> {
  try {
    return await generateSpeechViaInteractions(request, options);
  } catch (error) {
    if (error instanceof GeminiError && error.code === ErrorCode.API) {
      options.logger?.warn(
        `Interactions speech generation failed, trying legacy API: ${error.message}`,
      );
    } else {
      throw error;
    }
  }

  if (options.background) {
    throw new GeminiError(
      "Background speech generation requires the Interactions API",
      ErrorCode.API,
    );
  }

  return generateSpeechViaGenerateContent(request, options);
}
