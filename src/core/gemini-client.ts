import { GoogleGenAI } from "@google/genai";
import { ErrorCode, GeminiError, type Logger } from "./types.js";

let client: GoogleGenAI | null = null;

/** Singleton Gemini client using GEMINI_API_KEY only. */
export function getGeminiClient(logger?: Logger): GoogleGenAI {
  if (client) {
    return client;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError(
      "GEMINI_API_KEY environment variable is required.",
      ErrorCode.AUTH,
    );
  }

  client = new GoogleGenAI({ apiKey });
  logger?.info("Gemini API client initialized");
  return client;
}

/** Reset singleton (testing). */
export function resetGeminiClient(): void {
  client = null;
}
