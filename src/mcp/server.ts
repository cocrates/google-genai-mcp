#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
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
    "Generate image, video, speech (TTS), or music from a single YAML/JSON request file. Returns interactionId + files.",
    {
      filePath: z.string().describe("Path to one YAML/JSON request file"),
      background: z
        .boolean()
        .optional()
        .describe(
          "Override background when YAML omits it. Defaults: image/speech/music false, video true",
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
    "download",
    "Download completed interaction media to a local file. Fails immediately if not completed.",
    {
      interactionId: z.string(),
      filePath: z
        .string()
        .optional()
        .describe("Optional output path; else YAML output or auto filename"),
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
    "Get interaction status, history (steps/input/outputs), and metadata. Removes local mapping if missing on server.",
    { interactionId: z.string() },
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
    "Continue a previous interaction with new text (no modality gate).",
    {
      interactionId: z.string(),
      text: z.string(),
      background: z.boolean().optional(),
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
    "List locally stored interactions with current server status when available.",
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
    "Remove local mappings whose IDs no longer exist on the server.",
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
    "Cancel an in-progress interaction on the server.",
    { interactionId: z.string() },
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
    "Delete interaction on the server and remove local mapping/tmp.",
    { interactionId: z.string() },
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
