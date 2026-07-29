# Analyze Request Response Schema

## Concern
통합 `analyze` MCP 도구의 **요청·응답 계약**을 어떻게 잡을 것인가? (YAML 여부, 인자 형태, 출력 형식)

## Status
approved

## Context
- 상위 결정: `adr/media-understanding-mcp.md` — Option A(통합 `analyze`) 승인.
- `generate`는 파라미터·경로·모달리티가 많아 **YAML/JSON 파일 → `filePath`** 가 맞다.
- `analyze`는 본질적으로 **미디어(+선택적 URL) + “무엇을/어떤 형식으로 분석할지” 텍스트**면 충분하다. 요청마다 목적·출력 형식이 달라 JSON 파일 저장·스키마 강제 등은 호출마다 다르다.
- 호스트 AI가 결과를 해석·사용자에게 설명하므로, MCP는 **텍스트를 그대로 반환**하고 형식은 프롬프트에 맡기는 편이 확장성이 좋다.
- Gemini Interactions API도 `input: [media…, {type:text,text}]` → `output_text` 패턴이다.

## Decision
**Option A — MCP 네이티브: `inputs` + `prompt` → text (+ interactionId)**
YAML 없이 `analyze({ inputs, prompt, model? })` → `{ interactionId, text }`. 단일도 `inputs` 배열. 출력 형식은 prompt에 맡기고 서버측 `responseSchema`는 MVP 제외.
`interactionId`·기본 모델은 `adr/analyze-interaction-and-model.md`에서 확정(후속 개정).

## Options

### Option A — MCP 네이티브: `inputs` + `prompt` → `text` (YAML 없음)
- MCP `analyze({ inputs: string[], prompt: string, model?: string })`.
  - `inputs`: 로컬 경로 및/또는 공개 URL(YouTube 등) 1개 이상. 모달리티는 확장자·URL로 추론.
  - `prompt`: 분석 목적 + 원하는 출력 형식(자유 텍스트, “JSON으로…”, 체크리스트 등).
- 응답: `{ interactionId, text }` (`adr/analyze-interaction-and-model.md`).
- CLI는 동일 인자 또는 `gemini analyze --inputs … --prompt …` 형태; **요청 YAML 필수 아님**.
- Pro: 에이전트가 파일 작성 없이 바로 호출; 형식·후처리는 프롬프트+호스트에 위임; `generate`와 역할 분리 명확.
- Con: `generate`와 입력 UX가 다름(파일 vs 인자); 긴 프롬프트는 MCP 메시지 크기에 실림(실무상 분석 프롬프트는 생성 YAML보다 짧은 경우가 많음).

### Option B — `generate`와 동일: YAML `type: analyze` + `filePath`
- `analyze({ filePath })` 또는 `generate`에 type만 확장.
- YAML에 `inputs`/`media`/`prompt`/`model` 등 필드.
- Pro: 도구·경로 해석·CLI 파일 흐름 단일화.
- Con: 파라미터가 단순한 분석에 파일 I/O 강제; 형식·후처리가 요청마다 다른데 YAML 스키마를 늘리기 쉬움(오버엔지니어링).

### Option C — 하이브리드: MCP는 인자, CLI만 선택적 YAML
- MCP는 Option A. CLI/`gemini`만 편의용 YAML을 허용.
- Pro: 에이전트 경로 단순, 사람용 재현 스크립트 가능.
- Con: 두 입력 경로 유지보수; MVP에 필수는 아님.

### Option D — Option A + 서버측 `response_format`(JSON Schema) 파라미터
- `prompt` 외에 선택적 `responseSchema`로 Interactions `response_format` 고정.
- Pro: 파싱 보장에 유리(전사 세그먼트 등).
- Con: 스키마 설계·검증 부담; 사용자 의도(“형식은 프롬프트에”)와 겹치고 MVP 복잡도↑. 필요 시 후속 확장.

## Tradeoffs

| | A inputs+prompt→text | B YAML filePath | C 하이브리드 | D + responseSchema |
|---|-------------|---------------|------------|-------------------|
| 에이전트 호출 비용 | 낮음 | 높음(파일 작성) | MCP는 낮음 | 중간 |
| generate UX 일관성 | 낮음(의도적 분리) | 높음 | 중간 | — |
| 출력 형식 유연성 | 높음(프롬프트) | 스키마에 묶이기 쉬움 | 높음 | 서버 강제 가능 |
| MVP 범위 | 최소 | 중간 | 중간+ | 큼 |
| 확장(후속 JSON Schema 등) | 쉬움 | 중간 | 쉬움 | 이미 포함 |

## Recommendation (optional)
- **Option A** 권장 — 사용자 제안과 일치.
- 단일 미디어도 **항상 `inputs` 배열**(길이 ≥ 1)로 통일해 도구 스키마를 하나로 유지.
- 출력은 **`text`만 계약**; JSON 파일 저장·재포맷은 호스트 AI 책임.
- `interactionId` / `continue_interaction` / 기본 모델은 별도 Downstream ADR.
- Option C의 CLI YAML은 필요해지면 추가; MVP 필수 아님.
- Option D는 1차 제외, 전사·구조화 수요가 커지면 재검토.

## Consequences
- `analyze`는 **파일 기반 generate와 다른 진입점**이 된다(의도적).
- PRD/스펙: Out of Scope 제거 시 “YAML 필수”가 아니라 **MCP 인자 `inputs`+`prompt`** 로 기술.
- 업로드·MIME 추론·URL 지원은 본 ADR 밖(입력·업로드 전략 ADR).
- 서버가 결과를 `.json`으로 쓰지 않음 — 원하면 `prompt`에 JSON을 요청하고 호스트가 저장.

## Related ASRs
- ASR-024 — Analyze 요청·응답 스키마 — 본 ADR
- ASR-023 — 미디어 이해 MCP — 상위(통합 analyze) 결정
- ASR-013 — 파일 기반 입력 — generate에 적용; analyze는 예외 후보

## Downstream Concerns
- [x] **입력·업로드:** → `adr/analyze-input-upload-strategy.md` (approved, Option A)
- [x] **모델 기본값 / Interaction:** → `adr/analyze-interaction-and-model.md` (approved)
- [x] **CLI 표면:** → `adr/analyze-cli-surface.md` (approved)
- [x] **복수 입력 상한:** 1–10 (`adr/analyze-input-upload-strategy.md`)

## Related
- `adr/media-understanding-mcp.md` — approved, Option A
- Gemini Interactions: media + text → `output_text`

## Tags
`mcp`, `analyze`, `schema`, `prompt`, `inputs`, `text-output`

## Approved
- 2026-07-29: Option A, user confirmed
