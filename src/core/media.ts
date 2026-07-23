import { ErrorCode, GeminiError, type MediaItem } from "./types.js";
import type { InteractionRecord } from "./interactions-api.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeData(value: unknown): Buffer | null {
  if (typeof value === "string" && value.length > 0) {
    return Buffer.from(value, "base64");
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return null;
}

async function fetchUri(uri: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["x-goog-api-key"] = apiKey;
  }

  const response = await fetch(uri, { headers });
  if (!response.ok) {
    throw new GeminiError(
      `Failed to fetch media URI: ${uri} (${response.status})`,
      ErrorCode.API,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function contentToMedia(content: unknown): Promise<MediaItem[]> {
  if (!content) {
    return [];
  }

  const items: MediaItem[] = [];

  if (Array.isArray(content)) {
    for (const part of content) {
      items.push(...(await contentToMedia(part)));
    }
    return items;
  }

  if (!isRecord(content)) {
    return items;
  }

  const type = content.type;
  const mimeType =
    (typeof content.mime_type === "string" && content.mime_type) ||
    (typeof content.mimeType === "string" && content.mimeType) ||
    undefined;

  if (type === "image" || type === "audio" || type === "video") {
    const data = decodeData(content.data);
    if (data && mimeType) {
      items.push({ data, mimeType });
      return items;
    }

    const uri = content.uri;
    if (typeof uri === "string" && mimeType) {
      items.push({ data: await fetchUri(uri), mimeType });
    }
    return items;
  }

  if (Array.isArray(content.content)) {
    for (const nested of content.content) {
      items.push(...(await contentToMedia(nested)));
    }
  }

  if (Array.isArray(content.parts)) {
    for (const nested of content.parts) {
      items.push(...(await contentToMedia(nested)));
    }
  }

  const inlineData = content.inlineData ?? content.inline_data;
  if (isRecord(inlineData)) {
    const data = decodeData(inlineData.data);
    const inlineMime =
      (typeof inlineData.mimeType === "string" && inlineData.mimeType) ||
      (typeof inlineData.mime_type === "string" && inlineData.mime_type) ||
      mimeType;
    if (data && inlineMime) {
      items.push({ data, mimeType: inlineMime });
    }
  }

  return items;
}

/** Extract binary media from an interaction response. */
export async function extractMediaFromInteraction(
  interaction: InteractionRecord,
): Promise<MediaItem[]> {
  const collected: MediaItem[] = [];

  const shortcutKeys = ["output_image", "output_audio", "output_video"] as const;
  for (const key of shortcutKeys) {
    if (interaction[key] !== undefined) {
      collected.push(...(await contentToMedia(interaction[key])));
    }
  }

  if (Array.isArray(interaction.outputs)) {
    for (const output of interaction.outputs) {
      collected.push(...(await contentToMedia(output)));
    }
  }

  if (Array.isArray(interaction.steps)) {
    for (const step of interaction.steps) {
      if (!isRecord(step) || step.type !== "model_output") {
        continue;
      }
      collected.push(...(await contentToMedia(step.content ?? step)));
    }
  }

  const modelOutput = interaction.model_output ?? interaction.modelOutput;
  if (modelOutput !== undefined) {
    collected.push(...(await contentToMedia(modelOutput)));
  }

  if (collected.length === 0) {
    const response = interaction.response ?? interaction.result;
    if (isRecord(response) && Array.isArray(response.candidates)) {
      for (const candidate of response.candidates) {
        collected.push(...(await contentToMedia(candidate)));
      }
    }
  }

  return dedupeMedia(collected);
}

function dedupeMedia(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const unique: MediaItem[] = [];

  for (const item of items) {
    const key = `${item.mimeType}:${item.data.length}:${item.data.subarray(0, 16).toString("hex")}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

export function interactionErrorMessage(interaction: InteractionRecord): string | null {
  const error = interaction.error;
  if (isRecord(error)) {
    const message = error.message;
    if (typeof message === "string") {
      return message;
    }
  }

  const status = interaction.status;
  if (status === "failed" || status === "cancelled") {
    return `Interaction ${String(status)}`;
  }

  return null;
}
