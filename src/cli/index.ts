#!/usr/bin/env node
import { glob } from "glob";
import * as fs from "node:fs";
import { startInteractiveMode, processFiles } from "./interactive.js";
import { COMMANDS, printHelp, type CliCommand } from "./help.js";
import {
  analyzeMedia,
  cancelInteraction,
  classifyError,
  createLogger,
  createSilentLogger,
  deleteInteraction,
  downloadInteraction,
  ErrorCode,
  getAllNewestFirst,
  getById,
  getInteractionStatus,
  syncInteractions,
} from "../core/index.js";

interface GlobalFlags {
  verbose: boolean;
  force: boolean;
  rest: string[];
}

function parseGlobalFlags(argv: string[]): GlobalFlags {
  const rest: string[] = [];
  let verbose = false;
  let force = false;
  for (const a of argv) {
    if (a === "--verbose") verbose = true;
    else if (a === "--force") force = true;
    else rest.push(a);
  }
  return { verbose, force, rest };
}

function takeFlagValue(
  args: string[],
  longName: string,
  shortName?: string,
): { value: string | undefined; rest: string[] } {
  const rest: string[] = [];
  let value: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === longName || (shortName && a === shortName)) {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("-")) {
        value = "";
      } else {
        value = next;
        i += 1;
      }
      continue;
    }
    if (a.startsWith(`${longName}=`)) {
      value = a.slice(longName.length + 1);
      continue;
    }
    if (shortName && a.startsWith(`${shortName}=`)) {
      value = a.slice(shortName.length + 1);
      continue;
    }
    rest.push(a);
  }
  return { value, rest };
}

async function expandGlobs(patterns: string[]): Promise<string[]> {
  const expanded: string[] = [];
  for (const pattern of patterns) {
    if (pattern.includes("*") || pattern.includes("?")) {
      const matches = await glob(pattern, { nodir: true });
      expanded.push(...matches);
    } else {
      expanded.push(pattern);
    }
  }
  return expanded;
}

async function readStdinPrompt(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function cmdGenerate(
  args: string[],
  force: boolean,
  logger: ReturnType<typeof createLogger>,
): Promise<number> {
  const files = await expandGlobs(args);
  if (files.length === 0) {
    console.error("generate requires at least one YAML/JSON file");
    return ErrorCode.INVALID_INPUT;
  }
  console.log(`Processing ${files.length} file(s)...`);
  const results = await processFiles(
    files,
    {
      force,
      onProgress: (msg) => console.log(msg),
    },
    logger,
  );

  let exitCode = 0;
  for (const result of results) {
    if (result.success) {
      console.log(`✓ ${result.filePath} (${result.interactionId})`);
      for (const file of result.outputFiles ?? []) {
        console.log(`  → ${file}`);
      }
    } else {
      console.error(`✗ ${result.filePath}: ${result.error}`);
      exitCode = ErrorCode.GENERAL;
    }
  }
  return exitCode;
}

async function cmdAnalyze(
  args: string[],
  logger: ReturnType<typeof createLogger>,
): Promise<number> {
  let { value: promptFlag, rest } = takeFlagValue(args, "--prompt", "-p");
  const modelTaken = takeFlagValue(rest, "--model", "-m");
  rest = modelTaken.rest;
  const model = modelTaken.value;

  const inputs = await expandGlobs(rest);
  if (inputs.length === 0) {
    console.error("analyze requires at least one media path or URL");
    return ErrorCode.INVALID_INPUT;
  }

  let prompt = promptFlag;
  if (prompt === undefined) {
    prompt = await readStdinPrompt();
  }
  if (!prompt.trim()) {
    console.error(
      "analyze prompt is empty; provide --prompt/-p or non-empty stdin",
    );
    return ErrorCode.INVALID_INPUT;
  }

  const result = await analyzeMedia({
    inputs,
    prompt,
    model,
    baseDir: process.cwd(),
    logger,
    onProgress: (msg) => console.log(msg),
  });

  console.log(result.text);
  console.log(`\ninteractionId: ${result.interactionId}`);
  return 0;
}

async function cmdDownload(
  args: string[],
  force: boolean,
  logger: ReturnType<typeof createLogger>,
): Promise<number> {
  const interactionId = args[0];
  const outputPath = args[1];
  if (!interactionId) {
    console.error("Usage: gemini download <interactionId> [outputPath]");
    return ErrorCode.INVALID_INPUT;
  }
  const files = await downloadInteraction(interactionId, outputPath, {
    mode: "cli",
    overwrite: force ? true : "ask",
    force,
    logger,
  });
  for (const f of files) {
    console.log(`→ ${f.filePath}`);
  }
  return 0;
}

async function cmdList(): Promise<number> {
  const all = getAllNewestFirst();
  if (all.length === 0) {
    console.log("(no interactions)");
    return 0;
  }
  for (const m of all) {
    const file = m.requestFile ?? "-";
    const prev = m.previousIndex ?? "-";
    console.log(`[${m.index}] prev=${prev} id=${m.interactionId} file=${file}`);
  }
  return 0;
}

async function cmdShowOrStatus(
  args: string[],
  detail: boolean,
  logger: ReturnType<typeof createLogger>,
): Promise<number> {
  const interactionId = args[0];
  if (!interactionId) {
    console.error(`Usage: gemini ${detail ? "show" : "status"} <interactionId>`);
    return ErrorCode.INVALID_INPUT;
  }
  if (!getById(interactionId) && detail) {
    // Still allow server fetch for known IDs not in local store? Spec says interactionId param — get_interaction cleans missing. Call anyway.
  }
  const status = await getInteractionStatus(interactionId, {
    detail,
    logger,
  });
  console.log(JSON.stringify(status, null, 2));
  if (detail && status.requestFile && fs.existsSync(status.requestFile)) {
    console.log("\n--- request file ---\n");
    console.log(fs.readFileSync(status.requestFile, "utf-8"));
  }
  return 0;
}

async function cmdSync(logger: ReturnType<typeof createLogger>): Promise<number> {
  const result = await syncInteractions(logger);
  console.log(`kept=${result.kept} removed=${result.removed}`);
  return 0;
}

async function cmdCancel(
  args: string[],
  logger: ReturnType<typeof createLogger>,
): Promise<number> {
  const interactionId = args[0];
  if (!interactionId) {
    console.error("Usage: gemini cancel <interactionId>");
    return ErrorCode.INVALID_INPUT;
  }
  const status = await cancelInteraction(interactionId, logger);
  console.log(JSON.stringify(status, null, 2));
  return 0;
}

async function cmdDelete(
  args: string[],
  logger: ReturnType<typeof createLogger>,
): Promise<number> {
  if (args.length === 0) {
    console.error("Usage: gemini delete <interactionId...>");
    return ErrorCode.INVALID_INPUT;
  }
  for (const id of args) {
    await deleteInteraction(id, logger);
    console.log(`deleted ${id}`);
  }
  return 0;
}

async function main() {
  const { verbose, force, rest } = parseGlobalFlags(process.argv.slice(2));
  const logger = verbose ? createLogger("debug") : createSilentLogger();

  if (rest.length === 0) {
    await startInteractiveMode(logger);
    return;
  }

  const command = rest[0]!;
  const args = rest.slice(1);

  if (!COMMANDS.includes(command as CliCommand)) {
    console.error(
      `Unknown command: ${command}. Use \`gemini help\` or \`gemini generate <files...>\`.`,
    );
    console.error(`(Bare \`gemini <files>\` is removed.)`);
    process.exit(ErrorCode.INVALID_INPUT);
  }

  let exitCode = 0;
  try {
    switch (command as CliCommand) {
      case "help":
        printHelp(args[0]);
        break;
      case "generate":
        exitCode = await cmdGenerate(args, force, logger);
        break;
      case "analyze":
        exitCode = await cmdAnalyze(args, logger);
        break;
      case "download":
        exitCode = await cmdDownload(args, force, logger);
        break;
      case "list":
        exitCode = await cmdList();
        break;
      case "show":
        exitCode = await cmdShowOrStatus(args, true, logger);
        break;
      case "status":
        exitCode = await cmdShowOrStatus(args, false, logger);
        break;
      case "sync":
        exitCode = await cmdSync(logger);
        break;
      case "cancel":
        exitCode = await cmdCancel(args, logger);
        break;
      case "delete":
        exitCode = await cmdDelete(args, logger);
        break;
      default:
        printHelp();
        exitCode = ErrorCode.INVALID_INPUT;
    }
  } catch (error) {
    const classified = classifyError(error);
    console.error(classified.message);
    process.exit(classified.code);
  }

  if (exitCode !== 0) process.exit(exitCode);
}

main().catch((error) => {
  const classified = classifyError(error);
  console.error(classified.message);
  process.exit(classified.code);
});
