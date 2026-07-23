import { getGeminiClient } from "./gemini-client.js";
import { classifyError, withRetry } from "./errors.js";
import {
  ErrorCode,
  GeminiError,
  type InteractionStatus,
  type Logger,
} from "./types.js";

export type InteractionRecord = Record<string, unknown>;

function asRecord(value: unknown): InteractionRecord {
  if (value && typeof value === "object") {
    return value as InteractionRecord;
  }
  return {};
}

export function interactionIdOf(record: InteractionRecord): string {
  const id = record.id;
  if (typeof id !== "string" || !id) {
    throw new GeminiError("Interaction response missing id", ErrorCode.API);
  }
  return id;
}

export function statusOf(record: InteractionRecord): InteractionStatus | null {
  const status = record.status;
  if (typeof status !== "string") {
    return null;
  }
  return status as InteractionStatus;
}

/** Create an interaction via @google/genai SDK. */
export async function createInteraction(
  params: Record<string, unknown>,
  logger?: Logger,
): Promise<InteractionRecord> {
  const client = getGeminiClient(logger);

  return withRetry(async () => {
    const result = await client.interactions.create(
      params as Parameters<typeof client.interactions.create>[0],
    );
    return asRecord(result);
  }, { logger });
}

/** Retrieve an interaction by ID. */
export async function getInteraction(
  id: string,
  logger?: Logger,
): Promise<InteractionRecord> {
  const client = getGeminiClient(logger);

  return withRetry(async () => {
    try {
      const result = await client.interactions.get(id);
      return asRecord(result);
    } catch (error) {
      const classified = classifyError(error);
      const message = classified.message.toLowerCase();
      if (message.includes("not found") || message.includes("404")) {
        throw new GeminiError(
          `Interaction not found: ${id}`,
          ErrorCode.API,
          error,
        );
      }
      throw classified;
    }
  }, { logger });
}

/** Cancel a running interaction. */
export async function cancelInteraction(
  id: string,
  logger?: Logger,
): Promise<InteractionRecord> {
  const client = getGeminiClient(logger);

  return withRetry(async () => {
    const result = await client.interactions.cancel(id);
    return asRecord(result);
  }, { logger });
}

/** Delete an interaction from the server. */
export async function deleteInteraction(
  id: string,
  logger?: Logger,
): Promise<void> {
  const client = getGeminiClient(logger);

  await withRetry(async () => {
    await client.interactions.delete(id);
  }, { logger });
}

export async function waitForInteraction(
  id: string,
  options: {
    logger?: Logger;
    onProgress?: (status: InteractionStatus | null) => void;
    pollIntervalMs?: number;
  } = {},
): Promise<InteractionRecord> {
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  let interaction = await getInteraction(id, options.logger);
  let status = statusOf(interaction);

  while (status === "in_progress" || status === "requires_action") {
    options.onProgress?.(status);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    interaction = await getInteraction(id, options.logger);
    status = statusOf(interaction);
  }

  options.onProgress?.(status);
  return interaction;
}

export function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof GeminiError)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("not found") || message.includes("404");
}
