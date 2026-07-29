import { FileState } from "@google/genai";
import { getGeminiClient } from "./gemini-client.js";
import { ErrorCode, GeminiError, type Logger } from "./types.js";

const POLL_MS = 5000;
/** Cap wait for Files API ACTIVE (spec / ADR default candidate). */
const MAX_WAIT_MS = 15 * 60 * 1000;

/** Upload a local file and poll until ACTIVE (or fail). */
export async function uploadFileAndWait(
  filePath: string,
  mimeType: string,
  logger?: Logger,
): Promise<{ uri: string; mimeType: string; name: string }> {
  const client = getGeminiClient(logger);
  logger?.info(`Uploading file via Files API: ${filePath}`);

  let file = await client.files.upload({
    file: filePath,
    config: { mimeType },
  });

  const name = file.name;
  if (!name) {
    throw new GeminiError("Files API upload returned no name", ErrorCode.API);
  }

  const started = Date.now();
  while (file.state === FileState.PROCESSING) {
    if (Date.now() - started > MAX_WAIT_MS) {
      throw new GeminiError(
        `Files API processing timed out for ${name}`,
        ErrorCode.API,
      );
    }
    logger?.info(`File ${name} still PROCESSING; retry in ${POLL_MS}ms`);
    await new Promise((r) => setTimeout(r, POLL_MS));
    file = await client.files.get({ name });
  }

  if (file.state === FileState.FAILED) {
    const msg =
      typeof file.error?.message === "string"
        ? file.error.message
        : "Files API processing failed";
    throw new GeminiError(msg, ErrorCode.API);
  }

  if (file.state !== FileState.ACTIVE) {
    throw new GeminiError(
      `Unexpected file state for ${name}: ${String(file.state)}`,
      ErrorCode.API,
    );
  }

  const uri = file.uri;
  if (!uri) {
    throw new GeminiError(`Files API file missing uri: ${name}`, ErrorCode.API);
  }

  return {
    uri,
    mimeType: file.mimeType ?? mimeType,
    name,
  };
}
