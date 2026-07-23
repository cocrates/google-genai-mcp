# Verification: google-genai-mcp

**Spec:** `spec/google-genai-mcp.md` (Aligned with `spec/PRD.md`)
**Artifact(s):** `src/core/`, `src/mcp/`, `src/cli/`, `package.json`, `tsconfig.json`
**Verified:** 2026-07-23
**Summary:** 27 pass, 1 fail, 2 partial, 0 not-verifiable

## Inventory & Results

### PRD Level

| # | Spec item | Status | Evidence / Notes |
|---|-----------|--------|------------------|
| 1 | [PRD] Goal — Gemini Image/Video/Audio via MCP + CLI | pass | `src/mcp/server.ts` (MCP), `src/cli/index.ts` (CLI), `src/core/` (shared) |
| 2 | [PRD] Target Audience — AI agents + developers | pass | MCP stdio for agents, CLI for developers |
| 3 | [PRD] Core Function — MCP server + CLI + shared core | pass | Three-layer architecture: `src/mcp/`, `src/cli/`, `src/core/` |

### ASR Decisions

| # | Spec item | Status | Evidence / Notes |
|---|-----------|--------|------------------|
| 4 | [ASR-001] MCP stdio transport | pass | `src/mcp/server.ts:202` — `StdioServerTransport` |
| 5 | [ASR-002] CLI multi-bin + file-based + interactive | pass | `package.json:9-12` — `google-genai-mcp` + `gemini` bins. `src/cli/interactive.ts` — full interactive mode |
| 6 | [ASR-003] Single package `google-genai-mcp` | pass | Single `package.json`, no monorepo |
| 7 | [ASR-004] MVP: Image, Video, Audio | pass | `src/core/image.ts`, `src/core/video.ts`, `src/core/audio.ts` |
| 8 | [ASR-005] Singleton Gemini client, GEMINI_API_KEY only | pass | `src/core/gemini-client.ts:7-23` — singleton pattern, `GEMINI_API_KEY` env var |
| 9 | [ASR-006] Binary output: local file, {interactionId, files, background} | pass | `src/core/types.ts:80-84` — `GenerationResult` type matches. `src/core/generate.ts` saves and returns correctly |
| 10 | [ASR-007] Error classification + retry (rate limit 3x, service 2x) | pass | `src/core/errors.ts:111-162` — `maxRetriesFor` matches spec exactly |
| 11 | [ASR-008] Logging: dataDir-based, file logging, MVP config | pass | `src/core/logger.ts` — YAML-formatted file logger. `src/core/config.ts` — `{logLevel}` schema |
| 12 | [ASR-009] Test strategy: vitest, 90%+ coverage | partial | `package.json:21` — vitest configured, `tsconfig.json` references. **No test files found** in `src/`. Coverage unverifiable |
| 13 | [ASR-010] Node.js 18+, required deps only | pass | `package.json:6-8` — `"node": ">=18"`. Deps: `@google/genai`, `@modelcontextprotocol/sdk` |
| 14 | [ASR-011] Video background=true default, poll 10s, no time limit | pass | `src/core/request.ts:256-270` — `resolveBackground` defaults video to `true`. `src/cli/interactive.ts:95` — 10s poll, infinite loop |
| 15 | [ASR-012] TypeScript type safety, internal conversion layer | pass | `src/core/types.ts` — internal types. `src/mcp/tools.ts` — MCP tool names only. Zod schemas in `server.ts` |
| 16 | [ASR-013] File-based input, MCP single file, CLI multi+glob | pass | `src/cli/index.ts:24-32` — glob expansion. `src/mcp/server.ts:52` — single `filePath` |
| 17 | [ASR-014] Interactions API primary, generateContent fallback | pass | `src/core/image.ts:203-231`, `src/core/video.ts:202-218`, `src/core/audio.ts:194-222` — all have Interactions + legacy fallback |
| 18 | [ASR-015] Sync=auto save, async=download | pass | `src/core/image.ts:131-134` — sync saves files, async returns `files: []` |
| 19 | [ASR-016] Output priority: filePath > YAML output > auto; CLI=CWD, MCP=workspace | pass | `src/core/download.ts:112-128` — priority chain correct. `src/core/paths.ts:31-33` — `process.cwd()` for both (MCP client sets cwd) |
| 20 | [ASR-017] Background defaults: video=true, image/audio=false; YAML override | pass | `src/core/request.ts:256-270` — `yaml.background ?? mcp.background ?? typeDefault` |
| 21 | [ASR-018] Audio TTS: 30 voices, single/multi speaker | pass | `src/core/types.ts:147-178` — all 30 voices. `src/core/audio.ts:29-42` — single/multi speaker via `buildSpeechConfig` |
| 22 | [ASR-019] interactions.json mapping, tmp copies | pass | `src/core/interactions-store.ts` — full CRUD. `src/core/output.ts:57-76` — `copyToTmp` |
| 23 | [ASR-020] Interactive: /list, /select, /show, /status, /download, /sync, /cancel, /delete | pass | `src/cli/interactive.ts:116-291` — all commands implemented |
| 24 | [ASR-021] Multi-turn: previous_interaction_id, no modality gate | pass | `src/core/ops.ts:157-239` — uses `previous_interaction_id`, no modality check |

### Requirements

| # | Spec item | Status | Evidence / Notes |
|---|-----------|--------|------------------|
| 25 | [Req] MCP 8 tools: generate, download, get, continue, list, sync, cancel, delete | pass | `src/mcp/server.ts` — all 8 tools registered. `src/mcp/tools.ts` — tool name catalog |
| 26 | [Req] get_interaction response: interactionId, status, error, exists, requestFile, tmpFile | pass | `src/core/types.ts:104-111` — `GetInteractionResponse` matches spec schema exactly |
| 27 | [Req] generate response: interactionId, background, files[] | pass | `src/core/types.ts:80-84` — `GenerationResult` matches |
| 28 | [Req] CLI: gemini <files...>, --verbose, --force, exit codes (0-4) | pass | `src/cli/index.ts:11-70` — all flags, glob expansion, exit codes match |
| 29 | [Req] Interactive: all commands + continue conversation | pass | `src/cli/interactive.ts:268-288` — text input continues via `continueInteraction` |
| 30 | [Req] Request file: YAML/JSON parse, validation, relative paths, image count limits | pass | `src/core/request.ts` — full parsing, `resolveImages` with max count (19/3), `resolveAgainst` for paths |
| 31 | [Req] Download error: immediate fail on incomplete/failed/not-found | pass | `src/core/download.ts:86-92` — checks status !== "completed", throws immediately |
| 32 | [Req] Overwrite: MCP=overwrite, CLI=confirm, CLI non-TTY=fail, --force | pass | `src/mcp/server.ts:65` — `overwrite: true`. `src/cli/interactive.ts:15-24` — TTY confirm. `assertCanWrite` in output.ts |

### Authentication

| # | Spec item | Status | Evidence / Notes |
|---|-----------|--------|------------------|
| 33 | [Req] Auth: GEMINI_API_KEY (recommended) or Google ADC | fail | `src/core/gemini-client.ts:12-18` — throws `GeminiError` if `GEMINI_API_KEY` is missing. ADC fallback not implemented. `@google/genai` SDK supports ADC when no apiKey is passed, but the explicit throw prevents it |

### Constraints

| # | Spec item | Status | Evidence / Notes |
|---|-----------|--------|------------------|
| 34 | [Constraint] TypeScript strict mode | pass | `tsconfig.json:12` — `"strict": true` |
| 35 | [Constraint] Single package, multi-bin | pass | `package.json` — single package, two bins |
| 36 | [Constraint] stdio transport | pass | `src/mcp/server.ts:202` — StdioServerTransport |
| 37 | [Constraint] Required deps: @modelcontextprotocol/sdk, @google/genai | pass | `package.json:25-26` — both present. Additional: `glob`, `yaml`, `zod` (utility deps) |
| 38 | [Constraint] ESLint + Prettier | partial | **No config files found** (.eslintrc, eslint.config, .prettierrc). `tsconfig.json` has strict mode which provides some guarantees |
| 39 | [Constraint] vitest, coverage 90%+ | partial | vitest in devDependencies, **no test files found** |

### Out of Scope Violations

| # | Out of Scope item | Status | Evidence / Notes |
|---|-------------------|--------|------------------|
| 40 | No text/code generation | pass | No `generate_text` or `generate_code` tools |
| 41 | No HTTP(SSE) transport | pass | Only `StdioServerTransport` |
| 42 | No Batch API | pass | No batch-related code |
| 43 | No --background CLI flag | pass | CLI parses `--verbose` and `--force` only (`src/cli/index.ts:13-14`) |
| 44 | No continue_interaction modality gate | pass | `src/core/ops.ts:157-239` — no modality pre-check |

### Packaging & Deployment

| # | Spec item | Status | Evidence / Notes |
|---|-----------|--------|------------------|
| 45 | [Success] MCP client can generate via single filePath | pass | `src/mcp/server.ts:48-73` — `generate` tool with single `filePath` param |
| 46 | [Success] CLI gemini <files...> + interactive mode | pass | `src/cli/index.ts:19-22` — files → batch, no files → interactive |
| 47 | [Success] npm install -g works, both bins available | pass | `package.json:9-12` — bin entries. `files: ["dist", "README.md", "LICENSE"]` |
| 48 | [Success] generate → {interactionId, files, background} | pass | All generators return `GenerationResult` |
| 49 | [Success] download saves to local, fails immediately on error | pass | `src/core/download.ts:68-144` — immediate throw on non-completed |

## Deviations (Non-compliance)

### D-001: ADC Authentication Support Missing (Critical)

- **Spec item:** "인증: 환경변수 `GEMINI_API_KEY` (필수 권장) 또는 Google ADC (Application Default Credentials)"
- **Actual:** `src/core/gemini-client.ts:12-18` explicitly throws `GeminiError` when `GEMINI_API_KEY` is absent. The `@google/genai` SDK natively supports ADC when no `apiKey` is provided, but the code prevents this fallback.
- **Severity:** Major — The spec allows ADC as a valid auth method. Users with Google Cloud ADC configured cannot use the tool without setting `GEMINI_API_KEY`.
- **Risk:** Blocks users in Google Cloud environments where ADC is the standard auth mechanism.
- **Recommended fix:** Remove the explicit throw. Try `new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })` without validation — the SDK will fall back to ADC if no key is provided. Add a helpful error message if both fail.

### D-002: No Test Files (Major)

- **Spec item:** "단위·통합 테스트 (vitest), 커버리지 90%+"
- **Actual:** vitest is configured in `package.json` devDependencies but **no test files exist** anywhere in the project.
- **Severity:** Major — Coverage goal is unverifiable. No regression safety net.
- **Risk:** Any future changes could introduce regressions silently.
- **Recommended fix:** Create test files for core modules (at minimum: `request.ts`, `errors.ts`, `output.ts`, `interactions-store.ts`, `gemini-client.ts`).

### D-003: ESLint/Prettier Not Configured (Minor)

- **Spec item:** "Linting: ESLint + Prettier"
- **Actual:** No `.eslintrc`, `eslint.config.*`, `.prettierrc`, or `prettier.config.*` files found. No lint/format scripts in `package.json`.
- **Severity:** Minor — TypeScript strict mode provides some safety, but no automated code quality enforcement.
- **Risk:** Code style drift, undetected anti-patterns.
- **Recommended fix:** Add ESLint + Prettier configs and `lint`/`format` scripts to `package.json`.

## Undocumented ASRs (Specification Gaps)

### U-001: Legacy API Fallback Strategy (not in Spec)

- **Decision:** Each generator (image, video, audio) implements a fallback from Interactions API to legacy `generateContent`/`generateVideos` when the Interactions API fails.
- **Location:** `src/core/image.ts:203-231`, `src/core/video.ts:202-218`, `src/core/audio.ts:194-222`
- **Category:** Integration & dependencies
- **Gap:** The Spec says "기본 Interactions API 사용" but does not document the fallback behavior. The fallback silently catches API errors and retries with legacy endpoints.
- **Risk:** Users may not know which API path was used. Legacy APIs may have different response formats, quality, or pricing.
- **Recommended action:** Consider registering as ASR or documenting in Spec whether the fallback is intentional and under what conditions it triggers.

### U-002: Interactions API REST Fallback (not in Spec)

- **Decision:** When `@google/genai` SDK does not expose `interactions.create`, the code falls back to direct REST API calls (`interactions-api.ts:40-72`).
- **Location:** `src/core/interactions-api.ts:88-102` — `hasInteractionsSdk` check + REST fallback
- **Category:** Integration & dependencies
- **Gap:** The Spec does not mention REST API as a transport option for the Interactions API. This is a dual-path within the core, separate from the MCP transport decision.
- **Risk:** REST fallback uses a hardcoded API revision (`2026-05-20`) that may become stale.
- **Recommended action:** Document this dual-path strategy or plan migration to SDK-only once `@google/genai` stabilizes Interactions API support.

### U-003: Media Extraction Complexity (not in Spec)

- **Decision:** `src/core/media.ts` implements a multi-layer extraction strategy that searches `output_image/output_audio/output_video`, `outputs[]`, `steps[]`, `model_output`, and `response.candidates` for media data.
- **Location:** `src/core/media.ts:102-144`
- **Category:** Structure & organization
- **Gap:** The Spec does not define the shape of Interactions API responses. The code must handle multiple possible response structures.
- **Risk:** If Gemini API changes response structure, extraction may silently return empty results.
- **Recommended action:** Consider adding a response schema to the Spec or ASR registry.

### U-004: `hasInteractionsSdk` Runtime Feature Detection (not in Spec)

- **Decision:** The code uses runtime feature detection (`hasInteractionsSdk`) to determine whether to use SDK or REST for Interactions API calls.
- **Location:** `src/core/gemini-client.ts:31-35`, used in `image.ts`, `audio.ts`
- **Category:** Integration & dependencies
- **Gap:** This is a pragmatic workaround for `@google/genai` SDK version variability, not documented in Spec.
- **Risk:** May mask SDK version issues. `image.ts:209` also checks `process.env.GEMINI_API_KEY` as a condition, which conflates auth with API capability.
- **Recommended action:** Document or simplify the detection logic.

## Recommended Next Steps

1. **Fix D-001 (ADC):** Modify `gemini-client.ts` to allow SDK ADC fallback. This is the only Critical/Major spec deviation affecting functionality.
2. **Fix D-002 (Tests):** Create test suite targeting 90%+ coverage. Start with `request.ts` (YAML parsing), `errors.ts` (classification), `output.ts` (file I/O), `interactions-store.ts` (CRUD).
3. **Fix D-003 (Lint):** Add ESLint + Prettier configuration and npm scripts.
4. **Review U-001/U-002:** Decide whether to document or consolidate the legacy API fallback strategy in the Spec.

## User Review

{Leave empty for user notes}
