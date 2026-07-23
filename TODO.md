# TODO: google-genai-mcp

> **Project root:** `./`
> **Updated:** 2026-07-23

## Snapshot

| Done | In progress | Pending | Blocked | Skipped |
|------|-------------|---------|---------|---------|
| 12   | 0           | 1       | 0       | 0       |

**Recommended next:** `GEMINI_API_KEY`로 E2E 검증. 가능하면 `@google/genai` ≥1.33 업그레이드 (현재 Interactions는 REST 폴백).

## Completed

- [x] 스펙·PRD·ASR 확정
- [x] **T-007** — 스펙 기반 재구현 (`src/core`, `src/mcp`, `src/cli`)
  - MCP: generate(단일 파일)/download/get/continue/list/sync/cancel/delete
  - CLI: `gemini <files...>` + 인터랙티브 명령
  - 경로·background·overwrite·OS별 dataDir·음성 30종
  - `npm run build` 성공

## Pending

- [ ] E2E: image/video/audio + download + continue 실 API 검증
