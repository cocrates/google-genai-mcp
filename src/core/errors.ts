import { ErrorCode, GeminiError, type Logger } from "./types.js";

export { ErrorCode, GeminiError };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRateLimitMessage(message: string): boolean {
  return (
    message.includes("429") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.toLowerCase().includes("rate limit")
  );
}

function isQuotaMessage(message: string): boolean {
  return (
    message.toLowerCase().includes("quota") || message.includes("QUOTA")
  );
}

function isAuthMessage(message: string): boolean {
  return (
    message.includes("API key") ||
    message.includes("UNAUTHENTICATED") ||
    message.includes("403") ||
    message.toLowerCase().includes("permission denied") ||
    message.includes("GEMINI_API_KEY")
  );
}

function isInvalidInputMessage(message: string): boolean {
  return (
    message.includes("INVALID_ARGUMENT") ||
    message.includes("400") ||
    message.toLowerCase().includes("invalid")
  );
}

function isServiceMessage(message: string): boolean {
  return (
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("UNAVAILABLE") ||
    message.includes("INTERNAL")
  );
}

/** Classify an error from the Gemini API or local validation. */
export function classifyError(error: unknown): GeminiError {
  if (error instanceof GeminiError) {
    return error;
  }

  const message = errorMessage(error);

  if (isAuthMessage(message)) {
    return new GeminiError(
      `Authentication failed: ${message}`,
      ErrorCode.AUTH,
      error instanceof Error ? error : undefined,
    );
  }

  if (isQuotaMessage(message)) {
    return new GeminiError(
      `Quota exceeded: ${message}`,
      ErrorCode.API,
      error instanceof Error ? error : undefined,
    );
  }

  if (isRateLimitMessage(message)) {
    return new GeminiError(
      `Rate limit exceeded: ${message}`,
      ErrorCode.API,
      error instanceof Error ? error : undefined,
    );
  }

  if (isInvalidInputMessage(message)) {
    return new GeminiError(
      `Invalid input: ${message}`,
      ErrorCode.INVALID_INPUT,
      error instanceof Error ? error : undefined,
    );
  }

  if (isServiceMessage(message)) {
    return new GeminiError(
      `Service error: ${message}`,
      ErrorCode.API,
      error instanceof Error ? error : undefined,
    );
  }

  return new GeminiError(
    `API error: ${message}`,
    ErrorCode.API,
    error instanceof Error ? error : undefined,
  );
}

export interface RetryOptions {
  logger?: Logger;
}

function maxRetriesFor(error: GeminiError): number {
  const message = error.message;
  if (isQuotaMessage(message)) {
    return 0;
  }
  if (isRateLimitMessage(message)) {
    return 3;
  }
  if (isServiceMessage(message)) {
    return 2;
  }
  if (error.code === ErrorCode.API) {
    return 2;
  }
  return 0;
}

function isRetryable(error: GeminiError): boolean {
  return maxRetriesFor(error) > 0;
}

/** Retry with exponential backoff (rate limit: 3x, service: 2x). */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { logger } = options;
  let lastError: unknown;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const classified = classifyError(error);
      const limit = maxRetriesFor(classified);

      if (attempt < limit && isRetryable(classified)) {
        const delay = Math.pow(2, attempt) * 1000;
        logger?.warn(
          `Attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
        );
        logger?.debug(`Error: ${classified.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw classified;
    }
  }

  throw classifyError(lastError);
}
