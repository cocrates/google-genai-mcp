#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  analyzeMedia,
  cancelInteraction,
  classifyError,
  continueInteraction,
  createLogger,
  createSilentLogger,
  deleteInteraction,
  downloadInteraction,
  generateFromFile,
  getAll,
  getInteractionStatus,
  syncInteractions,
} from "../core/index.js";

const logLevel =
  process.env.LOG_LEVEL === "debug" || process.env.LOG_LEVEL === "info"
    ? process.env.LOG_LEVEL
    : "info";
const logger =
  process.env.LOG_LEVEL === "debug" || process.env.LOG_LEVEL === "info"
    ? createLogger(logLevel)
    : createSilentLogger();

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(error: unknown) {
  const classified = classifyError(error);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: classified.message }],
  };
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "google-genai-mcp",
    version: "0.1.0",
  });

  server.tool(
    "generate",
    [
      "Generate image, video, speech (TTS), or music from one YAML/JSON request file (schema assumed known).",
      "Write the request file first, then call this tool with its path. Relative paths inside the file are relative to that file's directory.",
      "Returns { interactionId, files, background }. Sync (background=false): files filled. Async (background=true): files=[] — poll get_interaction until completed, then download.",
      "Default background when YAML omits it: false for image/video/speech/music. Call once per file; for multiple files, call multiple times.",
    ].join(" "),
    {
      filePath: z
        .string()
        .describe("Absolute or workspace-relative path to one YAML/JSON request file"),
      background: z
        .boolean()
        .optional()
        .describe(
          "Override background only when YAML omits it. Default for all types: false",
        ),
    },
    async ({ filePath, background }) => {
      try {
        const result = await generateFromFile(filePath, {
          background,
          mode: "mcp",
          overwrite: true,
          logger,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "analyze",
    [
      "Understand/analyze image, audio, or video with Gemini (default model gemini-3.6-flash).",
      "Pass local paths and/or public http(s)/YouTube URLs in inputs (1–10).",
      "A .yaml/.yml/.json generation request among inputs is detected by extension: analyze its output (if no other media entries), and build a fidelity checklist prompt that includes that YAML plus recursively referenced YAMLs from params.references (YAML paths only; media refs are not inlined).",
      "prompt is optional when a generation YAML/JSON is in inputs (user text is prepended to the checklist); required for media-only inputs.",
      "Large local files (>20MB) use Files API upload; smaller files are inlined.",
      "Returns { interactionId, text }. Follow up with continue_interaction using the interactionId.",
    ].join(" "),
    {
      inputs: z
        .array(z.string())
        .min(1)
        .max(10)
        .describe(
          "Media paths/URLs and/or one generation YAML/JSON (.yaml/.yml/.json) (1–10)",
        ),
      prompt: z
        .string()
        .optional()
        .describe(
          "Analysis instruction and desired output format. Optional when inputs include a generation YAML/JSON (prepended to the default checklist)",
        ),
      model: z
        .string()
        .optional()
        .describe("Override model; default gemini-3.6-flash"),
    },
    async ({ inputs, prompt, model }) => {
      try {
        const result = await analyzeMedia({
          inputs,
          prompt,
          model,
          baseDir: process.cwd(),
          logger,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "download",
    [
      "Save completed interaction media to a local file.",
      "Use after async generate/continue when status is completed.",
      "Fails immediately (no wait/retry) if not completed, failed, or missing.",
      "Path priority: filePath arg > YAML output > auto filename under workspace.",
    ].join(" "),
    {
      interactionId: z
        .string()
        .describe(
          "Interaction ID returned by generate, analyze, or continue_interaction",
        ),
      filePath: z
        .string()
        .optional()
        .describe(
          "Optional output path; relative paths use the request file directory when available",
        ),
    },
    async ({ interactionId, filePath }) => {
      try {
        const files = await downloadInteraction(interactionId, filePath, {
          mode: "mcp",
          overwrite: true,
          logger,
        });
        return jsonResult({ interactionId, files });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "get_interaction",
    [
      "Get interaction status, history (steps/input/outputs), and metadata.",
      "Poll this after async generate/continue until status is completed (then download) or failed.",
      "If the ID is missing on the server, removes the local mapping and reports not-found.",
    ].join(" "),
    {
      interactionId: z.string().describe("Interaction ID to inspect"),
    },
    async ({ interactionId }) => {
      try {
        const status = await getInteractionStatus(interactionId, {
          detail: true,
          logger,
        });
        return jsonResult(status);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "continue_interaction",
    [
      "Continue a previous interaction with new user text (multi-turn edit / follow-up).",
      "Works for generate and analyze interactionIds. No modality pre-check — unsupported turns surface as API errors.",
      "Same return shape as generate: sync fills files; async returns files=[] and needs get_interaction + download.",
      "Analyze follow-ups typically return text via get_interaction outputText.",
    ].join(" "),
    {
      interactionId: z
        .string()
        .describe("Previous interaction ID to continue from"),
      text: z
        .string()
        .describe("New user instruction / edit text for this turn"),
      background: z
        .boolean()
        .optional()
        .describe(
          "Run in background when true. If omitted, uses the original request default (false for all types) when a stored request file exists",
        ),
    },
    async ({ interactionId, text, background }) => {
      try {
        const result = await continueInteraction(interactionId, text, {
          background,
          mode: "mcp",
          overwrite: true,
          logger,
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "list_interactions",
    [
      "List locally tracked interactions with current server status when available.",
      "Use to discover interactionIds before get/download/continue/cancel/delete.",
    ].join(" "),
    {},
    async () => {
      try {
        const mappings = getAll();
        const items = [];
        for (const m of mappings) {
          const status = await getInteractionStatus(m.interactionId, {
            detail: false,
            logger,
          });
          items.push(status);
        }
        return jsonResult({ interactions: items });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "sync_interactions",
    [
      "Remove local mappings whose interaction IDs no longer exist on the server.",
      "Does not cancel or delete server-side interactions — only cleans stale local state.",
    ].join(" "),
    {},
    async () => {
      try {
        const result = await syncInteractions(logger);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "cancel_interaction",
    [
      "Cancel an in-progress interaction on the server.",
      "Use to stop a running job; does not delete the interaction record (prefer delete_interaction for removal).",
    ].join(" "),
    {
      interactionId: z
        .string()
        .describe("In-progress interaction ID to cancel"),
    },
    async ({ interactionId }) => {
      try {
        await cancelInteraction(interactionId, logger);
        return jsonResult({ interactionId, cancelled: true });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "delete_interaction",
    [
      "Permanently delete an interaction on the server and remove its local mapping/tmp files.",
      "Unlike cancel, this removes the record; use after cancel or for finished/unwanted interactions.",
    ].join(" "),
    {
      interactionId: z
        .string()
        .describe("Interaction ID to delete on server and locally"),
    },
    async ({ interactionId }) => {
      try {
        await deleteInteraction(interactionId, logger);
        return jsonResult({ interactionId, deleted: true });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
