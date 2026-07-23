/** MCP tool name catalog (schemas live in server registration). */

export const TOOL_NAMES = [
  "generate",
  "download",
  "get_interaction",
  "continue_interaction",
  "list_interactions",
  "sync_interactions",
  "cancel_interaction",
  "delete_interaction",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
