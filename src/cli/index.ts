#!/usr/bin/env node
import { glob } from "glob";
import { startInteractiveMode, processFiles } from "./interactive.js";
import {
  createLogger,
  createSilentLogger,
  ErrorCode,
  classifyError,
} from "../core/index.js";

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const force = args.includes("--force");
  const files = args.filter((a) => !a.startsWith("--"));

  const logger = verbose ? createLogger("debug") : createSilentLogger();

  if (files.length === 0) {
    await startInteractiveMode(logger);
    return;
  }

  const expandedFiles: string[] = [];
  for (const pattern of files) {
    if (pattern.includes("*") || pattern.includes("?")) {
      const matches = await glob(pattern, { nodir: true });
      expandedFiles.push(...matches);
    } else {
      expandedFiles.push(pattern);
    }
  }

  if (expandedFiles.length === 0) {
    console.error("No files matched the pattern.");
    process.exit(ErrorCode.INVALID_INPUT);
  }

  console.log(`Processing ${expandedFiles.length} file(s)...`);

  const results = await processFiles(
    expandedFiles,
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

  if (exitCode !== 0) process.exit(exitCode);
}

main().catch((error) => {
  const classified = classifyError(error);
  console.error(classified.message);
  process.exit(classified.code);
});
