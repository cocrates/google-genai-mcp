// Core module — shared business logic for MCP and CLI

export * from "./types.js";
export * from "./paths.js";
export * from "./config.js";
export * from "./errors.js";
export * from "./logger.js";
export * from "./output.js";
export * from "./request.js";
export * from "./gemini-client.js";
export * from "./interactions-store.js";
export {
  createInteraction,
  getInteraction,
  cancelInteraction as cancelServerInteraction,
  deleteInteraction as deleteServerInteraction,
  waitForInteraction,
  isNotFoundError,
  interactionIdOf,
  statusOf,
  type InteractionRecord,
} from "./interactions-api.js";
export * from "./media.js";
export * from "./files-api.js";
export * from "./analyze.js";
export * from "./analyze-spec.js";
export * from "./generate.js";
export * from "./image.js";
export * from "./video.js";
export * from "./speech.js";
export * from "./speech-chunking.js";
export * from "./speech-chunk-cache.js";
export * from "./music.js";
export * from "./download.js";
export {
  getInteractionStatus,
  syncInteractions,
  continueInteraction,
  cancelInteraction,
  deleteInteractionLocal as deleteInteraction,
  redactHeavyMedia,
  type ContinueInteractionOptions,
  type GetInteractionStatusOptions,
} from "./ops.js";
