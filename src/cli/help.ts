/** Shared CLI / MCP-aligned help text (ASR-028). */

export const COMMANDS = [
  "generate",
  "analyze",
  "download",
  "list",
  "show",
  "status",
  "sync",
  "cancel",
  "delete",
  "help",
] as const;

export type CliCommand = (typeof COMMANDS)[number];

export const HELP: Record<
  CliCommand,
  { summary: string; detail: string }
> = {
  generate: {
    summary: "Generate image/video/speech/music from YAML/JSON request files",
    detail: `Usage:
  gemini generate <files...> [--force] [--verbose]

Each file is one YAML/JSON request (type: image|video|speech|music).
Glob patterns are supported. Returns interactionId and saved files (sync)
or starts background work (see YAML background).

MCP equivalent: generate (single filePath per call).`,
  },
  analyze: {
    summary: "Analyze image/audio/video; returns text + interactionId",
    detail: `Usage:
  gemini analyze <files...> [-p|--prompt <text>] [-m|--model <name>] [--verbose]

files: media paths/URLs and/or one generation YAML/JSON (.yaml/.yml/.json)
  (1–10, glob ok). A generation request is detected by extension: its output
  is analyzed when no other media files are given, and the prompt includes
  that YAML plus recursively referenced YAMLs.
--prompt/-p: analysis instruction (optional with a generation YAML; prepended
  to the checklist). For media-only inputs, -p or stdin is required; empty
  cancels (exit code 2). Default model: gemini-3.6-flash.

MCP equivalent: analyze({ inputs, prompt?, model? }) → { interactionId, text }.
Follow-up: interactive mode (/select then text) or MCP continue_interaction.`,
  },
  download: {
    summary: "Save completed interaction media to a local file",
    detail: `Usage:
  gemini download <interactionId> [outputPath] [--force] [--verbose]

Fails immediately if not completed. MCP equivalent: download.`,
  },
  list: {
    summary: "List locally tracked interactions",
    detail: `Usage:
  gemini list [--verbose]

Local mappings only (no server calls for the listing itself).
MCP equivalent: list_interactions.`,
  },
  show: {
    summary: "Show interaction detail by interactionId",
    detail: `Usage:
  gemini show <interactionId> [--verbose]

Fetches server status/history. MCP equivalent: get_interaction (detail).`,
  },
  status: {
    summary: "Show server status for an interactionId",
    detail: `Usage:
  gemini status <interactionId> [--verbose]

MCP equivalent: get_interaction.`,
  },
  sync: {
    summary: "Remove local mappings missing on the server",
    detail: `Usage:
  gemini sync [--verbose]

MCP equivalent: sync_interactions.`,
  },
  cancel: {
    summary: "Cancel an in-progress interaction",
    detail: `Usage:
  gemini cancel <interactionId> [--verbose]

MCP equivalent: cancel_interaction.`,
  },
  delete: {
    summary: "Delete interaction on server and locally",
    detail: `Usage:
  gemini delete <interactionId...> [--verbose]

MCP equivalent: delete_interaction (one id per MCP call).`,
  },
  help: {
    summary: "Show command list or help for one command",
    detail: `Usage:
  gemini help
  gemini help <command>

Aligned with MCP tool descriptions where applicable.`,
  },
};

export function printHelp(command?: string): void {
  if (command) {
    const key = command as CliCommand;
    const entry = HELP[key];
    if (!entry) {
      console.error(`Unknown command: ${command}`);
      console.error(`Available: ${COMMANDS.join(", ")}`);
      return;
    }
    console.log(`${key} — ${entry.summary}\n`);
    console.log(entry.detail);
    return;
  }

  console.log(`gemini <command> [args...] [--verbose] [--force]

Commands:`);
  for (const name of COMMANDS) {
    console.log(`  ${name.padEnd(12)} ${HELP[name].summary}`);
  }
  console.log(`
No command → interactive mode (/list, /select, …).
Run: gemini help <command> for details.`);
}
