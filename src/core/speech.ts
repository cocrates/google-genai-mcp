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
import { withRetry, classifyError } from "./errors.js";
import { getDataDir } from "./paths.js";
import {
  buildChunkPrompt,
  buildSpeechChunks,
  concatPcmWithGaps,
  excerptForError,
  needsSpeechChunking,
  splitPreambleTranscript,
  toRawPcm,
  type SpeechChunk,
} from "./speech-chunking.js";
import {
  computeSpeechRequestHash,
  deleteSpeechChunkCache,
  gcExpiredSpeechChunkCaches,
  readCachedChunk,
  readCachedChunkInteractionId,
  writeCachedChunk,
} from "./speech-chunk-cache.js";
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

async function savePcmAsSpeechFile(
  request: SpeechRequest,
  pcm: Buffer,
  options: MediaGenerationOptions,
): Promise<GenerationResult["files"]> {
  const outputFormat = request.params.outputFormat ?? "wav";
  const overwrite = options.mode === "mcp" || options.overwrite === true;
  const payload =
    outputFormat === "wav" ? ensureWavContainer(pcm) : pcm;
  const mimeType =
    outputFormat === "wav" ? "audio/wav" : getAudioMimeType(outputFormat);
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

  const item = media[0]!;
  const pcm = toRawPcm(item.data);
  return savePcmAsSpeechFile(request, pcm, options);
}

async function createAndWaitSpeechInteraction(
  text: string,
  request: SpeechRequest,
  options: MediaGenerationOptions,
  progressLabel = "Speech generation",
): Promise<{ interactionId: string; pcm: Buffer }> {
  const model = request.model ?? DEFAULT_MODEL;
  const params: Record<string, unknown> = {
    model,
    input: [{ type: "text", text }],
    response_format: { type: "audio" },
    background: false,
    store: true,
    generation_config: {
      speech_config: buildSpeechConfig(request),
    },
  };

  let interaction = await createInteraction(params, options.logger);
  const interactionId = interactionIdOf(interaction);

  const status = statusOf(interaction);
  if (status === "in_progress" || status === "requires_action") {
    interaction = await waitForInteraction(interactionId, {
      logger: options.logger,
      onProgress: (s) =>
        options.onProgress?.(`${progressLabel}: ${s ?? "unknown"}`),
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

  const media = await extractMediaFromInteraction(interaction);
  if (media.length === 0) {
    throw new GeminiError(
      "No audio data in speech interaction response",
      ErrorCode.API,
    );
  }

  return { interactionId, pcm: toRawPcm(media[0]!.data) };
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

async function generateOneChunk(
  chunk: SpeechChunk,
  index: number,
  total: number,
  preamble: string,
  request: SpeechRequest,
  options: MediaGenerationOptions,
): Promise<{ interactionId: string; pcm: Buffer }> {
  const label = `Speech chunk ${index + 1}/${total}`;
  const prompt = buildChunkPrompt(preamble, chunk.text);
  try {
    return await createAndWaitSpeechInteraction(
      prompt,
      request,
      options,
      label,
    );
  } catch (error) {
    const classified = classifyError(error);
    throw new GeminiError(
      `${label} failed (${classified.code}): ${classified.message} — "${excerptForError(chunk.text)}"`,
      classified.code,
      error instanceof Error ? error : undefined,
    );
  }
}

async function generateSpeechChunked(
  request: SpeechRequest,
  preamble: string,
  transcript: string,
  options: MediaGenerationOptions,
): Promise<GenerationResult> {
  const model = request.model ?? DEFAULT_MODEL;
  const dataDir = getDataDir();
  const chunks = buildSpeechChunks(transcript);
  if (chunks.length === 0) {
    throw new GeminiError(
      "Speech transcript is empty after splitting",
      ErrorCode.INVALID_INPUT,
    );
  }

  const requestHash = computeSpeechRequestHash({
    model,
    request,
    preamble,
    transcript,
  });

  const transcriptBytes = utf8Hint(transcript);
  options.logger?.info(
    `Long-form speech: ${chunks.length} chunk(s), hash=${requestHash.slice(0, 12)}…`,
  );
  options.onProgress?.(
    `Long-form speech: ${chunks.length} chunk(s), transcript ${transcriptBytes} bytes`,
  );

  const pieces: Array<{ pcm: Buffer; gapAfter: SpeechChunk["gapAfter"] }> = [];
  let lastInteractionId = "";
  let cacheHits = 0;
  let generated = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const label = `Speech chunk ${i + 1}/${chunks.length}`;
    const excerpt = excerptForError(chunk.text, 60);

    const cached = readCachedChunk(requestHash, i, dataDir);
    if (cached) {
      cacheHits += 1;
      options.onProgress?.(`${label}: cache hit — "${excerpt}"`);
      options.logger?.info(`${label}: cache hit`);
      const cachedId = readCachedChunkInteractionId(requestHash, i, dataDir);
      if (cachedId) lastInteractionId = cachedId;
      pieces.push({ pcm: cached, gapAfter: chunk.gapAfter });
      continue;
    }

    options.onProgress?.(
      `${label}: generating (${utf8Hint(chunk.text)} bytes) — "${excerpt}"`,
    );
    options.logger?.info(`${label}: generating (${utf8Hint(chunk.text)} bytes)`);
    const { interactionId, pcm } = await generateOneChunk(
      chunk,
      i,
      chunks.length,
      preamble,
      request,
      options,
    );
    generated += 1;
    lastInteractionId = interactionId;
    options.onProgress?.(`${label}: done`);
    options.logger?.info(`${label}: interaction=${interactionId}`);
    writeCachedChunk(requestHash, i, pcm, dataDir, interactionId);
    pieces.push({ pcm, gapAfter: chunk.gapAfter });
  }

  if (!lastInteractionId) {
    throw new GeminiError(
      "Long-form speech completed without an interaction id (empty cache)",
      ErrorCode.API,
    );
  }

  options.onProgress?.(
    `Merging ${chunks.length} chunk(s) (generated ${generated}, cache ${cacheHits})…`,
  );
  const merged = concatPcmWithGaps(pieces);
  const files = await savePcmAsSpeechFile(request, merged, options);
  deleteSpeechChunkCache(requestHash, dataDir);
  options.onProgress?.(
    `Long-form speech complete → ${files[0]?.filePath ?? "(saved)"}`,
  );

  return { interactionId: lastInteractionId, files, background: false };
}

function utf8Hint(text: string): number {
  return Buffer.byteLength(text, "utf8");
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
  gcExpiredSpeechChunkCaches(getDataDir());

  const { preamble, transcript } = splitPreambleTranscript(request.params.text);

  if (needsSpeechChunking(transcript)) {
    if (options.background) {
      throw new GeminiError(
        "Long-form speech chunking requires synchronous generation (set background: false)",
        ErrorCode.INVALID_INPUT,
      );
    }
    // Chunked path: no legacy full-text fallback (would reintroduce long hangs).
    return generateSpeechChunked(request, preamble, transcript, options);
  }

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
