import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  cancelInteraction,
  continueInteraction,
  deleteInteraction,
  downloadInteraction,
  generateFromFile,
  getAllNewestFirst,
  getByIndex,
  getDataDir,
  getInteractionStatus,
  indexOfId,
  latestIndex,
  syncInteractions,
  type GetInteractionResponse,
  type InteractionMapping,
  type Logger,
} from "../core/index.js";

type ConfirmFn = (filePath: string) => Promise<boolean>;

function createConfirmOverwrite(ask: (q: string) => Promise<string>): ConfirmFn {
  return async (filePath: string) => {
    if (!process.stdin.isTTY) return false;
    const answer = await ask(`Overwrite ${filePath}? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  };
}

/** Standalone confirm for non-interactive file mode (own readline). */
async function confirmOverwriteStandalone(filePath: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`Overwrite ${filePath}? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export async function processFiles(
  files: string[],
  options: {
    force?: boolean;
    onProgress?: (msg: string) => void;
  },
  logger: Logger,
): Promise<
  Array<{
    filePath: string;
    success: boolean;
    error?: string;
    outputFiles?: string[];
    interactionId?: string;
  }>
> {
  const results = [];
  for (const filePath of files) {
    try {
      const result = await generateFromFile(filePath, {
        mode: "cli",
        overwrite: options.force ? true : "ask",
        force: options.force,
        confirmOverwrite: confirmOverwriteStandalone,
        onProgress: options.onProgress,
        logger,
      });

      if (result.background) {
        options.onProgress?.(
          `Background started — polling (Ctrl-C to stop)...`,
        );
        for (;;) {
          const status = await getInteractionStatus(result.interactionId, {
            detail: false,
            logger,
          });
          options.onProgress?.(
            `Status: ${status.exists ? status.status : "missing"}`,
          );
          if (!status.exists) {
            throw new Error(
              status.error?.message ?? "Interaction missing on server",
            );
          }
          if (status.status === "completed") {
            const filesOut = await downloadInteraction(
              result.interactionId,
              undefined,
              {
                mode: "cli",
                overwrite: options.force ? true : "ask",
                force: options.force,
                confirmOverwrite: confirmOverwriteStandalone,
                logger,
              },
            );
            results.push({
              filePath,
              success: true,
              interactionId: result.interactionId,
              outputFiles: filesOut.map((f) => f.filePath),
            });
            break;
          }
          if (status.status === "failed" || status.status === "cancelled") {
            throw new Error(
              status.error?.message ?? `Interaction ${status.status}`,
            );
          }
          await new Promise((r) => setTimeout(r, 10_000));
        }
      } else {
        results.push({
          filePath,
          success: true,
          interactionId: result.interactionId,
          outputFiles: result.files.map((f) => f.filePath),
        });
      }
    } catch (error) {
      results.push({
        filePath,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

const HELP: Record<string, { summary: string; detail: string }> = {
  help: {
    summary: "Show command list, or help for one command",
    detail: `Usage:
  /help
  /help <command>

Examples:
  /help list
  /help delete`,
  },
  list: {
    summary: "List local interactions (newest first)",
    detail: `Usage:
  /list

Shows local mappings only (no server calls).
Columns: stable index, previous index, request file.
Indexes start at 1 and never change (new turns get max+1).
List is sorted newest-first (highest index first).
Selected row is marked with *.`,
  },
  select: {
    summary: "Select an interaction by stable index",
    detail: `Usage:
  /select <index>

Fetches server status for the selected item and prints a short summary.
Example: /select 7`,
  },
  show: {
    summary: "Show selected interaction summary + request YAML",
    detail: `Usage:
  /show

Fetches the server interaction and prints a readable summary:
metadata, user request text, and whether media was generated.
Binary/base64 payloads are omitted — use /download to save files.
Then prints the local request YAML if available.`,
  },
  status: {
    summary: "Show server status summary for the selected interaction",
    detail: `Usage:
  /status

Same readable summary as /show without the local YAML section.`,
  },
  download: {
    summary: "Download selected interaction output",
    detail: `Usage:
  /download
  /download <path>

Fails immediately if the interaction is not completed.`,
  },
  sync: {
    summary: "Remove local entries missing on the server",
    detail: `Usage:
  /sync`,
  },
  cancel: {
    summary: "Cancel the selected in-progress interaction",
    detail: `Usage:
  /cancel`,
  },
  delete: {
    summary: "Delete interactions by index (or selected)",
    detail: `Usage:
  /delete
  /delete <index> [index...]

With no indexes, deletes the currently selected interaction.
Example: /delete 3 5 7`,
  },
  quit: {
    summary: "Exit interactive mode",
    detail: `Usage:
  /quit
  /exit`,
  },
};

function printHelp(topic?: string): void {
  if (!topic) {
    console.log("Available commands:");
    for (const [name, info] of Object.entries(HELP)) {
      console.log(`  /${name.padEnd(10)} ${info.summary}`);
    }
    console.log("\nTip: /help <command> for details. Plain text continues the selected interaction.");
    return;
  }
  const key = topic.replace(/^\//, "").toLowerCase();
  const info = HELP[key];
  if (!info) {
    console.error(`Unknown command: ${topic}`);
    console.log("Try /help");
    return;
  }
  console.log(`/${key} — ${info.summary}`);
  console.log(info.detail);
}

function formatListLine(
  mapping: InteractionMapping,
  selected: number | null,
): string {
  const mark = selected === mapping.index ? "*" : " ";
  const prevLabel =
    mapping.previousIndex == null ? "-" : String(mapping.previousIndex);
  const file = mapping.requestFile ?? "-";
  return `${mark} [${mapping.index}] prev=[${prevLabel}] ${file}`;
}

function collectTexts(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed && trimmed.length < 20_000 && !looksLikeBase64(trimmed)) {
      out.push(trimmed);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTexts(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") {
      collectTexts(obj.text, out);
    }
    for (const [key, child] of Object.entries(obj)) {
      if (key === "text" || key === "data") continue;
      collectTexts(child, out);
    }
  }
  return out;
}

function looksLikeBase64(s: string): boolean {
  if (s.length < 200) return false;
  return /^[A-Za-z0-9+/=\s]+$/.test(s.slice(0, 400));
}

function countMediaHints(value: unknown): {
  images: number;
  audio: number;
  video: number;
} {
  let images = 0;
  let audio = 0;
  let video = 0;

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const type = typeof obj.type === "string" ? obj.type.toLowerCase() : "";
    const mime =
      typeof obj.mime_type === "string"
        ? obj.mime_type
        : typeof obj.mimeType === "string"
          ? obj.mimeType
          : "";
    if (
      type === "image" ||
      mime.startsWith("image/") ||
      obj.inlineData ||
      obj.inline_data
    ) {
      if (type === "image" || mime.startsWith("image/")) images += 1;
    }
    if (type === "audio" || mime.startsWith("audio/")) audio += 1;
    if (type === "video" || mime.startsWith("video/")) video += 1;
    for (const child of Object.values(obj)) walk(child);
  };

  walk(value);
  return { images, audio, video };
}

function textsFromUserSide(detail: GetInteractionResponse): string[] {
  const texts: string[] = [];
  collectTexts(detail.input, texts);
  if (Array.isArray(detail.steps)) {
    for (const step of detail.steps) {
      if (!step || typeof step !== "object") continue;
      const type = String((step as { type?: unknown }).type ?? "");
      if (type === "user_input" || type.includes("user")) {
        collectTexts(step, texts);
      }
    }
  }
  // de-dupe while preserving order
  return [...new Set(texts)];
}

function printShowSummary(detail: GetInteractionResponse): void {
  const index = detail.index ?? indexOfId(detail.interactionId);
  const prevIndex =
    detail.previousIndex ??
    (detail.previousInteractionId != null
      ? indexOfId(detail.previousInteractionId)
      : null);

  console.log("--- interaction ---");
  console.log(`index:   ${index ?? "-"}`);
  console.log(`prev:    ${prevIndex ?? "-"}`);
  console.log(`status:  ${detail.status ?? "n/a"}`);
  console.log(`exists:  ${detail.exists}`);
  console.log(`model:   ${detail.model ?? "-"}`);
  console.log(`created: ${detail.created ?? "-"}`);
  console.log(`updated: ${detail.updated ?? "-"}`);
  if (detail.error?.message) {
    console.log(`error:   ${detail.error.message}`);
  }
  if (detail.usage && typeof detail.usage === "object") {
    const u = detail.usage as Record<string, unknown>;
    const parts = [
      u.total_input_tokens != null ? `in=${u.total_input_tokens}` : null,
      u.total_output_tokens != null ? `out=${u.total_output_tokens}` : null,
      u.total_tokens != null ? `total=${u.total_tokens}` : null,
    ].filter(Boolean);
    if (parts.length) console.log(`usage:   ${parts.join(" ")}`);
  }

  const localText = detail.userText?.trim() || null;
  const userTexts = localText ? [localText] : textsFromUserSide(detail);
  const inputMedia = countMediaHints(detail.input);
  console.log("--- user request ---");
  if (userTexts.length === 0) {
    if (prevIndex != null) {
      console.log(
        "(no stored continue text for this turn — new continues will keep userText locally)",
      );
    } else {
      console.log("(no text prompt found)");
    }
  } else {
    for (const t of userTexts) {
      console.log(t);
      console.log("");
    }
  }
  const mediaNotes = [
    inputMedia.images ? `${inputMedia.images} image(s)` : null,
    inputMedia.audio ? `${inputMedia.audio} audio` : null,
    inputMedia.video ? `${inputMedia.video} video` : null,
  ].filter(Boolean);
  if (mediaNotes.length) {
    console.log(`(attached media: ${mediaNotes.join(", ")}; binary omitted)`);
  }

  console.log("--- model output ---");
  if (detail.outputText?.trim()) {
    console.log(detail.outputText.trim());
  }
  const outBits = [
    detail.outputImage ? "image" : null,
    detail.outputAudio ? "audio" : null,
    detail.outputVideo ? "video" : null,
  ].filter(Boolean);
  if (outBits.length) {
    console.log(
      `(generated ${outBits.join(", ")}; use /download to save — binary omitted)`,
    );
  }
  if (!detail.outputText?.trim() && outBits.length === 0) {
    // fallback: any text in model_output steps
    const modelTexts: string[] = [];
    if (Array.isArray(detail.steps)) {
      for (const step of detail.steps) {
        if (!step || typeof step !== "object") continue;
        const type = String((step as { type?: unknown }).type ?? "");
        if (type === "model_output" || type.includes("model")) {
          collectTexts(step, modelTexts);
        }
      }
    }
    const unique = [...new Set(modelTexts)];
    if (unique.length) {
      for (const t of unique) console.log(t);
    } else {
      console.log("(no text/media summary)");
    }
  }
}

function printRequestYaml(mapping: InteractionMapping): void {
  console.log("--- request yaml ---");
  if (mapping.tmpFile) {
    const p = path.join(getDataDir(), "tmp", mapping.tmpFile);
    if (fs.existsSync(p)) {
      console.log(fs.readFileSync(p, "utf-8"));
      return;
    }
    console.log(`(tmp file missing: ${p})`);
    return;
  }
  if (mapping.requestFile) {
    if (fs.existsSync(mapping.requestFile)) {
      console.log(fs.readFileSync(mapping.requestFile, "utf-8"));
      return;
    }
    console.log(`(request file missing: ${mapping.requestFile})`);
    return;
  }
  console.log("(no request file)");
}

function clampSelected(selected: number | null): number | null {
  if (selected != null && getByIndex(selected)) return selected;
  return latestIndex();
}

export async function startInteractiveMode(logger: Logger): Promise<void> {
  const rl = readline.createInterface({ input, output, terminal: true });
  const confirmOverwrite = createConfirmOverwrite((q) => rl.question(q));

  let selected: number | null = clampSelected(null);

  console.log("google-genai-mcp interactive mode");
  console.log(
    "Type /help for commands. Indexes are stable (start at 1); list shows newest first.",
  );
  if (selected != null) {
    console.log(`Auto-selected [${selected}]`);
  }

  const selectedMapping = (): InteractionMapping | null => {
    if (selected == null) return null;
    return getByIndex(selected);
  };

  const selectById = (interactionId: string): void => {
    const idx = indexOfId(interactionId);
    selected = idx;
    if (idx != null) {
      console.log(`Selected [${idx}]`);
    }
  };

  while (true) {
    const line = (await rl.question("> ")).trim();
    if (!line) continue;

    if (line === "/quit" || line === "/exit") {
      break;
    }

    if (line === "/help" || line.startsWith("/help ")) {
      const topic = line === "/help" ? undefined : line.slice("/help ".length).trim();
      printHelp(topic || undefined);
      continue;
    }

    if (line === "/list") {
      const list = getAllNewestFirst();
      if (list.length === 0) {
        console.log("(no interactions)");
        selected = null;
        continue;
      }
      selected = clampSelected(selected);
      for (const m of list) {
        console.log(formatListLine(m, selected));
      }
      continue;
    }

    if (line.startsWith("/select ")) {
      const n = Number(line.slice("/select ".length).trim());
      const m = getByIndex(n);
      if (!Number.isInteger(n) || !m) {
        console.error("Invalid index");
        continue;
      }
      selected = n;
      console.log(`Selected [${n}]`);
      try {
        const detail = await getInteractionStatus(m.interactionId, {
          detail: false,
          logger,
        });
        console.log(
          `  status=${detail.status ?? "n/a"} exists=${detail.exists} prev=[${detail.previousIndex ?? "-"}] model=${detail.model ?? "-"}`,
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      }
      continue;
    }

    if (line === "/show") {
      const m = selectedMapping();
      if (!m) {
        console.error("Select an interaction first (/select N)");
        continue;
      }
      try {
        const detail = await getInteractionStatus(m.interactionId, {
          detail: true,
          logger,
        });
        printShowSummary(detail);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      }
      printRequestYaml(m);
      continue;
    }

    if (line === "/status") {
      const m = selectedMapping();
      if (!m) {
        console.error("Select an interaction first (/select N)");
        continue;
      }
      try {
        const detail = await getInteractionStatus(m.interactionId, {
          detail: true,
          logger,
        });
        printShowSummary(detail);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      }
      continue;
    }

    if (line.startsWith("/download")) {
      const m = selectedMapping();
      if (!m) {
        console.error("Select an interaction first (/select N)");
        continue;
      }
      const arg = line.slice("/download".length).trim() || undefined;
      try {
        const files = await downloadInteraction(m.interactionId, arg, {
          mode: "cli",
          overwrite: "ask",
          confirmOverwrite,
          logger,
        });
        for (const f of files) console.log(`→ ${f.filePath}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      }
      continue;
    }

    if (line === "/sync") {
      const r = await syncInteractions(logger);
      console.log(`kept=${r.kept} removed=${r.removed}`);
      selected = clampSelected(selected);
      continue;
    }

    if (line === "/cancel") {
      const m = selectedMapping();
      if (!m) {
        console.error("Select an interaction first (/select N)");
        continue;
      }
      try {
        await cancelInteraction(m.interactionId, logger);
        console.log("cancelled");
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      }
      continue;
    }

    if (line === "/delete" || line.startsWith("/delete ")) {
      const args = line.slice("/delete".length).trim();
      let indexes: number[];

      if (!args) {
        if (selected == null) {
          console.error("Select an interaction first, or pass indexes: /delete 3 5");
          continue;
        }
        indexes = [selected];
      } else {
        indexes = args
          .split(/\s+/)
          .map((t) => Number(t))
          .filter((n) => Number.isInteger(n));
        if (indexes.length === 0) {
          console.error("Usage: /delete [index...]");
          continue;
        }
      }

      const targets: Array<{ idx: number; id: string }> = [];
      for (const idx of [...new Set(indexes)].sort((a, b) => a - b)) {
        const m = getByIndex(idx);
        if (!m) {
          console.error(`Invalid index: ${idx}`);
          continue;
        }
        targets.push({ idx, id: m.interactionId });
      }

      for (const t of targets) {
        try {
          await deleteInteraction(t.id, logger);
          console.log(`deleted [${t.idx}]`);
        } catch (error) {
          console.error(
            `[${t.idx}] ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      selected = clampSelected(selected);
      continue;
    }

    if (line.startsWith("/")) {
      console.error("Unknown command. Try /help");
      continue;
    }

    // Continue conversation — stay in the loop and select the new turn
    const m = selectedMapping();
    if (!m) {
      console.error("Select an interaction first (/select N), or use a slash command");
      continue;
    }
    try {
      const result = await continueInteraction(m.interactionId, line, {
        mode: "cli",
        overwrite: "ask",
        confirmOverwrite,
        onProgress: (msg) => console.log(msg),
        logger,
      });
      console.log(`updated → new turn selected (background=${result.background})`);
      for (const f of result.files) console.log(`→ ${f.filePath}`);
      selectById(result.interactionId);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  rl.close();
}
