import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { inferMediaRefType } from "./output.js";
import { isSpecReferencePath, parseRequestFile } from "./request.js";
import { resolveAgainst } from "./paths.js";
import { ErrorCode, GeminiError } from "./types.js";

/** Max depth when following referenced YAML files. */
export const MAX_YAML_REF_DEPTH = 20;

/**
 * Default evaluation brief used when analyzing media produced from a
 * generation request YAML.
 */
export const DEFAULT_SPEC_ANALYZE_PROMPT = [
  "The attached media was produced from the generation YAML spec below.",
  "Evaluate whether the intended media was generated correctly and how complete it is,",
  "using the request spec and any referenced specs. Cover all of the following:",
  "",
  "1. Spec fidelity — Does the media match the YAML (and referenced YAMLs)?",
  "   Focus on finding differences from the YAML. List each difference with concrete evidence.",
  "2. Unspecified content — What content or facts appear in the media that the YAML does not specify?",
  "3. Visual defects — Call out defects including:",
  "   - People and anatomical errors",
  "   - Spatial / architectural / environmental continuity errors",
  "   - Physical realism and object-combination errors",
  "   - Other quality or completeness issues",
  "",
  "End with OVERALL: PASS or FAIL and a one-line summary.",
].join("\n");

export interface YamlDoc {
  /** Absolute path */
  path: string;
  /** Raw file text */
  content: string;
  /** Role in the prompt: root request vs referenced */
  role: "request" | "reference";
}

export interface SpecAnalyzeContext {
  absRequestFile: string;
  /** Absolute output path from the request YAML, if set */
  outputPath: string | null;
  docs: YamlDoc[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTextFile(absPath: string): string {
  return fs.readFileSync(absPath, "utf-8");
}

/** Canonical absolute path so the same file is not included twice. */
function canonicalizePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  try {
    if (fs.existsSync(resolved)) {
      return fs.realpathSync.native
        ? fs.realpathSync.native(resolved)
        : fs.realpathSync(resolved);
    }
  } catch {
    // Fall back to resolved path when realpath is unavailable.
  }
  return resolved;
}

/**
 * Collect `params.references[].path` entries that are generation YAML/JSON.
 * Paths are resolved against `requestDir` (the YAML file that owns them).
 * Direct media paths (`.png` 등) are ignored for prompt inclusion.
 */
function extractReferencedSpecPaths(
  raw: Record<string, unknown>,
  requestDir: string,
): string[] {
  const params = raw.params;
  if (!isObject(params)) return [];
  const refs = params.references;
  if (!Array.isArray(refs)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < refs.length; i++) {
    const item = refs[i];
    if (!isObject(item) || typeof item.path !== "string") continue;
    const trimmed = item.path.trim();
    if (!trimmed) continue;
    const abs = resolveAgainst(requestDir, trimmed);
    if (!isSpecReferencePath(abs)) {
      // Media refs are used at generate time via YAML→output; not inlined here.
      continue;
    }
    if (!fs.existsSync(abs)) {
      throw new GeminiError(
        `Referenced YAML not found: ${abs}`,
        ErrorCode.INVALID_INPUT,
      );
    }
    if (!fs.statSync(abs).isFile()) {
      throw new GeminiError(
        `Referenced YAML is not a file: ${abs}`,
        ErrorCode.INVALID_INPUT,
      );
    }
    const canonical = canonicalizePath(abs);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

/**
 * Walk the request YAML and every `params.references` YAML (recursively).
 * Relative paths are always resolved against the YAML file that contains them
 * (so `a.yaml` → `../char/b.yaml` → `./c.yaml` places `c.yaml` beside `b.yaml`).
 * The same file is included at most once (canonical path / realpath).
 */
function collectYamlRefsFromFile(
  absYamlPath: string,
  visited: Set<string>,
  depth: number,
  docs: YamlDoc[],
  role: "request" | "reference",
): void {
  if (depth > MAX_YAML_REF_DEPTH) {
    throw new GeminiError(
      `YAML reference depth exceeded (${MAX_YAML_REF_DEPTH}) at ${absYamlPath}`,
      ErrorCode.INVALID_INPUT,
    );
  }
  const normalized = canonicalizePath(absYamlPath);
  if (visited.has(normalized)) return;
  visited.add(normalized);

  if (!fs.existsSync(normalized)) {
    throw new GeminiError(
      `Referenced YAML not found: ${normalized}`,
      ErrorCode.INVALID_INPUT,
    );
  }
  const content = readTextFile(normalized);
  docs.push({ path: normalized, content, role });

  const requestDir = path.dirname(normalized);
  let raw: unknown;
  try {
    const ext = path.extname(normalized).toLowerCase();
    raw = ext === ".json" ? JSON.parse(content) : parseYaml(content);
  } catch {
    // Non-parseable file still contributes its text; no further refs.
    return;
  }

  if (!isObject(raw)) return;

  for (const next of extractReferencedSpecPaths(raw, requestDir)) {
    if (visited.has(next)) continue;
    collectYamlRefsFromFile(next, visited, depth + 1, docs, "reference");
  }
}

/**
 * Load a generation request YAML and every YAML listed in
 * `params.references` (recursively). Media reference paths are not included
 * in the prompt.
 *
 * Uses `parseRequestFile`, so invalid references / missing YAML→output media
 * fail immediately. When `output` is set, it must exist as a media file.
 */
export function loadSpecAnalyzeContext(requestFile: string): SpecAnalyzeContext {
  const parsed = parseRequestFile(requestFile);
  const docs: YamlDoc[] = [];
  const visited = new Set<string>();
  collectYamlRefsFromFile(
    parsed.absRequestFile,
    visited,
    0,
    docs,
    "request",
  );

  const outputPath = parsed.request.output ?? null;
  if (outputPath) {
    assertAnalyzeOutputMedia(outputPath);
  }

  return {
    absRequestFile: parsed.absRequestFile,
    outputPath,
    docs,
  };
}

/**
 * Validate YAML `output` for analyze: must exist, be a regular file, and have
 * a supported media extension.
 */
export function assertAnalyzeOutputMedia(outputPath: string): void {
  if (!fs.existsSync(outputPath)) {
    throw new GeminiError(
      `Media file from YAML output not found: ${outputPath}`,
      ErrorCode.INVALID_INPUT,
    );
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(outputPath);
  } catch (error) {
    throw new GeminiError(
      `Cannot stat YAML output: ${outputPath}`,
      ErrorCode.INVALID_INPUT,
      error,
    );
  }
  if (!stat.isFile()) {
    throw new GeminiError(
      `YAML output is not a file: ${outputPath}`,
      ErrorCode.INVALID_INPUT,
    );
  }
  try {
    inferMediaRefType(outputPath);
  } catch (error) {
    throw new GeminiError(
      `YAML output is not a supported media file: ${outputPath}`,
      ErrorCode.INVALID_INPUT,
      error,
    );
  }
}

/** Format YAML docs into a prompt section. */
export function formatYamlDocsForPrompt(docs: YamlDoc[]): string {
  const parts: string[] = [];
  for (const doc of docs) {
    const label =
      doc.role === "request"
        ? "생성 요청 YAML"
        : "참조 YAML";
    parts.push(
      `### ${label}: ${doc.path}`,
      "```yaml",
      doc.content.trimEnd(),
      "```",
    );
  }
  return parts.join("\n\n");
}

/**
 * Build the composite analyze prompt:
 * 1. optional user prompt
 * 2. general evaluation checklist
 * 3. request YAML + referenced YAMLs
 */
export function buildSpecAnalyzePrompt(
  userPrompt: string | undefined,
  context: SpecAnalyzeContext,
): string {
  const sections: string[] = [];
  const trimmedUser = userPrompt?.trim() ?? "";
  if (trimmedUser) {
    sections.push("## 사용자 분석 요청", trimmedUser);
  }
  sections.push("## 일반 분석 요청", DEFAULT_SPEC_ANALYZE_PROMPT);
  sections.push(
    "## 미디어 생성 스펙 (YAML)",
    formatYamlDocsForPrompt(context.docs),
  );
  return sections.join("\n\n");
}

/**
 * Resolve media inputs when a generation request YAML is supplied.
 * If `inputs` is empty, use the YAML `output` path (must exist on disk).
 */
export function resolveInputsFromSpec(
  inputs: string[] | undefined,
  context: SpecAnalyzeContext,
): string[] {
  if (Array.isArray(inputs) && inputs.length > 0) {
    return inputs;
  }
  if (!context.outputPath) {
    throw new GeminiError(
      "generation YAML has no output path; provide media inputs or set output in the YAML",
      ErrorCode.INVALID_INPUT,
    );
  }
  assertAnalyzeOutputMedia(context.outputPath);
  return [context.outputPath];
}

const REQUEST_SPEC_EXTS = new Set([".yaml", ".yml", ".json"]);

function isHttpOrYouTubeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * True when a local path looks like a generation request YAML/JSON
 * (by extension). URLs are never treated as request specs.
 */
export function isAnalyzeRequestSpecPath(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || isHttpOrYouTubeUrl(trimmed)) return false;
  return REQUEST_SPEC_EXTS.has(path.extname(trimmed).toLowerCase());
}

export interface PartitionedAnalyzeInputs {
  /** At most one generation request YAML/JSON among inputs. */
  requestFile: string | null;
  /** Remaining media paths/URLs. */
  mediaInputs: string[];
}

/**
 * Split analyze `inputs` into at most one generation request file
 * (`.yaml`/`.yml`/`.json`) and the rest as media.
 */
export function partitionAnalyzeInputs(inputs: string[]): PartitionedAnalyzeInputs {
  const requestFiles: string[] = [];
  const mediaInputs: string[] = [];
  for (const raw of inputs) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (isAnalyzeRequestSpecPath(trimmed)) {
      requestFiles.push(trimmed);
    } else {
      mediaInputs.push(trimmed);
    }
  }
  if (requestFiles.length > 1) {
    throw new GeminiError(
      `analyze accepts at most one generation YAML/JSON among inputs; got ${requestFiles.length}`,
      ErrorCode.INVALID_INPUT,
    );
  }
  return {
    requestFile: requestFiles[0] ?? null,
    mediaInputs,
  };
}
