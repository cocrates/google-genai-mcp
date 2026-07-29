# CLI Unified Command Surface

## Concern
CLI를 `gemini <command> <parameters>` 형태로 통일하고, 인터랙티브와 동일한 기능을 인라인 명령으로 제공할지?

## Status
approved

## Context
- 현재: `gemini <yaml…>` = 생성, `gemini`(무인자) = 인터랙티브(`/list`, `/select N`, `/download` …). Analyze만 `gemini analyze` 서브커맨드로 추가 예정(ASR-027).
- 생성은 파일 인자, 분석은 서브커맨드, 관리는 인터랙티브만 → **표면이 세 갈래**라 에이전트·스크립트·학습 비용이 큼.
- 사용자 제안:
  - `gemini <command> <parameters>`
  - command: `generate`, `analyze`, 그리고 인터랙티브와 동등한 `download`, `list`, `show`, `sync`, `delete`, `help` 등
  - **인라인 대상 지정은 `interactionId`** (`select` index 아님)
  - command 없으면 인터랙티브 진입
- 이는 ASR-002(“파일 기반 단일 명령어 + 인터랙티브”)를 **개정**하는 결정이다.

## Decision
**Option A — 통합 서브커맨드**

1. **형태:** `gemini <command> [args…] [global flags]`  
   **명령 없음** → 인터랙티브.
2. **인라인 명령 (MVP):**

   | Command | 역할 | 파라미터 |
   |---------|------|----------|
   | `generate` | YAML/JSON 생성 | `<files…>` (glob) |
   | `analyze` | 미디어 이해 | `<files…>` (경로·URL, glob), 선택 `-p`/`--prompt`, 선택 `-m`/`--model` |
   | `download` | 산출물 저장 | `<interactionId> [outputPath]` |
   | `list` | 로컬 목록 | — |
   | `show` | 상세 | `<interactionId>` |
   | `status` | 서버 상태 | `<interactionId>` |
   | `sync` | 로컬↔서버 정리 | — |
   | `cancel` | 취소 | `<interactionId>` |
   | `delete` | 삭제 | `<interactionId…>` |
   | `help` | 도움말 | `[command]` |

3. **`generate` / `analyze` 대칭:** positional `<files…>` (1+). analyze files → MCP `inputs`.
4. **`analyze` prompt:** `-p` 우선, 없으면 stdin(EOF). **없거나 trim 후 빈 문자열이면 취소**(입력 오류 exit). 대화형 한 줄 입력 없음.
5. **`gemini <files>` 제거:** command 없이 파일만 넘기던 진입점 **폐기**. 생성은 반드시 `gemini generate <files…>`.
6. **인라인 `continue` 없음:** 후속 턴은 **인터랙티브만** (`/select` 후 일반 텍스트).
7. **인터랙티브 `/select` 유지** (TTY index 편의). 인라인 관리 명령은 `interactionId`만.
8. **Global flags 공통:** 예 `--verbose`, `--force` — 모든 커맨드·인터랙티브 진입 전에 공통 파싱.
9. **`help` ↔ MCP 정합:** `gemini help` / `help <command>` 문구는 대응 MCP tool description과 의미·제약을 맞춘다(생성=`generate`, 분석=`analyze`, download/list/… 동명 도구).

## Options

### Option A — 통합 서브커맨드
- Pro: CLI·인터랙티브·MCP 정렬; generate/analyze 대칭; 스크립트 가능.
- Con: `gemini <files>` 브레이킹; 파서·help 확대.

### Option B — generate/analyze만 서브커맨드, 관리는 인터랙티브 유지
- Pro: 변경 범위 작음.
- Con: 관리 인라인 미충족.

### Option C — 현행 유지 + analyze만
- Pro: 브레이킹 없음.
- Con: 삼중 표면 지속.

## Tradeoffs

| | A 전체 통합 | B generate/analyze만 | C 현행+analyze |
|---|-----------|---------------------|----------------|
| CLI↔인터랙티브 대칭 | 높음 | 낮음 | 낮음 |
| 스크립트 가능성 | 높음 | 중 | 낮음 |
| 브레이킹 | `gemini <files>` 제거 | 소 | 거의 없음 |

## Recommendation (optional)
- Option A — 사용자 확정 사항 반영 완료.

## Consequences
- ASR-002 / 스펙 CLI Requirements: `gemini generate|analyze|…`; bare files 제거.
- 인라인 continue 미구현; MCP `continue_interaction`·인터랙티브 이어가기만.
- `adr/analyze-cli-surface.md`와 정합(`<files…>` + `-p`/stdin; follow-up=인터랙티브).
- README·예제·verification을 `gemini generate …`로 갱신.
- help 문자열을 MCP tool 설명과 동기화할 단일 소스(또는 대응표) 권장.

## Related ASRs
- ASR-028 — CLI 통합 커맨드 표면 — 본 ADR
- ASR-002 — CLI 구조 — 본 결정으로 개정
- ASR-020 — 인터랙티브 — `/select` 유지, continue는 여기
- ASR-027 — Analyze CLI — `<files…>`·stdin·빈 prompt 취소

## Downstream Concerns
- [x] `gemini <files>` → **제거** (앨리어스 없음)
- [x] 인라인 `continue` → **불필요** (인터랙티브)
- [x] `/select` → **유지**
- [x] global flags → **공통**
- [x] help ↔ MCP → **정합**
- [x] analyze 빈 prompt → **취소**
- [x] status/cancel 인라인 MVP → **포함** (Decision 표)
- [ ] help/MCP 문구 단일 소스 구현 방식
- [ ] MCP `analyze`는 `inputs`+`prompt` 유지 (CLI 매핑)

## Related
- `adr/analyze-cli-surface.md`
- `adr/cli-mcp-entry-point.md`
- `spec/google-genai-mcp.md`

## Tags
`cli`, `subcommand`, `generate`, `analyze`, `interactionId`, `interactive`

## Approved
- 2026-07-29: Option A, user confirmed (bare files 제거, 인라인 continue 없음, `/select` 유지, global flags 공통, help↔MCP 정합, analyze prompt 빈값 취소)
