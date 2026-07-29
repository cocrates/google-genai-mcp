# Analyze CLI Surface

## Concern
CLI에서 `analyze`를 어떻게 호출하고, 후속 턴은 어떻게 이어갈 것인가?

## Status
approved

## Context
- MCP: `analyze({ inputs, prompt, model? })` → `{ interactionId, text }` (ASR-024/026).
- 생성 CLI: `gemini <yaml…>` 파일 기반; 후속은 `gemini` 인터랙티브에서 `/list` → `/select N` → 일반 텍스트로 `continue_interaction` (ASR-002/020/021).
- Analyze는 YAML이 없으므로 **서브커맨드 + 플래그**가 자연스럽다.
- 사용자 지시: `gemini analyze` 플래그로 분석 요청; 추가 interaction은 **interactionId를 이용해 generation과 동일한 방식**.

## Decision
**Option A — `gemini analyze` + positional files; follow-up은 interactionId**

1. **일회 분석 (CLI)** — ASR-028과 정합:
   ```bash
   gemini analyze <files…> [-p|--prompt "…"] [-m|--model …] [--verbose]
   ```
   - `<files…>`: 로컬 경로·URL(1–10, glob). MCP `inputs`에 매핑.
   - `--prompt`/`-p` 없으면 stdin에서 prompt 읽기. **둘 다 없거나 빈 문자열이면 취소**(입력 오류).
   - stdout: `text` + `interactionId`.
2. **후속 턴:** 인라인 `continue` 없음. **인터랙티브** `/select` 후 일반 텍스트(generation과 동일). `adr/cli-unified-command-surface.md`.
3. **비범위:** YAML `type: analyze`, 인터랙티브 `/analyze`, **`gemini <files>` bare 진입**, 인라인 `continue`.
4. **개정 이력:** `--inputs` → `<files…>` + stdin; 빈 prompt 취소; ASR-028에서 bare files·인라인 continue 제외.

## Options

### Option A — `analyze` 서브커맨드 / follow-up=interactionId 기반
- CLI: `analyze <files…>` (+ `-p` 또는 stdin). MCP는 `inputs`+`prompt` 유지.
- Pro: `generate <files…>`와 대칭; 파이프 친화.
- Con: (구안) `--inputs`보다 URL·glob 문서화 필요.

### Option B — 플래그만 (`gemini --analyze --inputs …`)
- Pro: 서브커맨드 파서 단순화 가능.
- Con: 파일 인자·플래그 혼동; `generate`와 비대칭.

### Option C — 인터랙티브 `/analyze`만
- Pro: 진입점 하나.
- Con: 스크립트·CI·일회 호출에 부적합.

## Tradeoffs

| | A analyze files… | B --analyze 플래그 | C /analyze만 |
|---|-------------|-------------------|-------------|
| generate와 대칭 | 높음 | 낮음 | — |
| 스크립트 친화 | 높음 | 중 | 낮음 |
| stdin prompt | ✅ | 가능 | — |

## Recommendation (optional)
- Option A — `generate`/`analyze` 모두 `<files…>`; prompt는 `-p` 또는 stdin.

## Consequences
- MCP 계약(`inputs`+`prompt`)은 불변; CLI만 positional→`inputs` 매핑.
- ASR-028 승인 시 본 Decision의 CLI 형태가 최종 스펙에 반영.

## Related ASRs
- ASR-027 — Analyze CLI 표면 — 본 ADR
- ASR-028 — CLI 통합 커맨드 — `<files…>` 대칭·stdin prompt
- ASR-002 / ASR-020 / ASR-021 — 생성 CLI·인터랙티브·continue
- ASR-024 / ASR-026 — analyze 인자·interactionId

## Downstream Concerns
- [x] TTY/`-p`/stdin 빈 prompt → **취소**(입력 오류)
- [ ] analyze 결과를 stdout에 text 전문 vs 요약+ID
- [ ] `gemini analyze --help`

## Related
- `adr/cli-unified-command-surface.md` — 상위 CLI 골격
- `adr/analyze-request-response-schema.md`
- `adr/analyze-interaction-and-model.md`
- `adr/cli-mcp-entry-point.md`

## Tags
`cli`, `analyze`, `gemini-analyze`, `continue_interaction`, `stdin`

## Approved
- 2026-07-29: Option A (analyze 서브커맨드), user confirmed — 인자 형태는 ASR-028에서 `<files…>`+stdin으로 개정
