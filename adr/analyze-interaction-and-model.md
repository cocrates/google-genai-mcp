# Analyze Interaction And Model Defaults

## Concern
`analyze`의 **interaction 생명주기**(ID 반환·`continue_interaction`)와 **기본 모델**을 어떻게 잡을 것인가?

## Status
approved

## Context
- 스키마: `inputs`+`prompt`→텍스트 (`adr/analyze-request-response-schema.md`).
- 업로드: 하이브리드+URL (`adr/analyze-input-upload-strategy.md`).
- 생성 경로는 이미 `interactionId` + `continue_interaction`으로 multi-turn을 지원한다 (ASR-021).
- 분석도 후속 질문(“00:15에 뭐가 보이지?”, “JSON만 다시”)이 흔하므로 ID를 넘기는 편이 자연스럽다.
- Gemini 미디어 이해 문서 예시는 `gemini-3.5-flash`를 사용한다.

## Decision
**Interaction — Option A:** `analyze` 응답에 `interactionId`를 포함하고, 기존 `continue_interaction`으로 후속 텍스트 턴을 이어간다. 로컬 `interactions.json`에 analyze 요청도 매핑한다(요청 파일이 없으면 `requestFile`은 비우거나 prompt 요약을 메타로 — 구현 시 generate와 동일 store 스키마 최소 확장).

**Model — Option A:** 기본 모델 `gemini-3.5-flash`. MCP 선택 인자 `model?: string`으로 오버라이드 가능. `media_resolution`은 MVP에서 미노출(후속).

응답 계약 개정: `{ interactionId, text }` (스키마 ADR의 `{ text }`를 본 결정으로 확장).

## Options

### Interaction
#### Option A — ID 반환 + 기존 `continue_interaction` 재사용
- Pro: 도구 추가 없음; 생성과 동일한 follow-up UX; Files URI가 interaction에 남으면 재업로드 없이 질문 가능(서버 동작에 의존).
- Con: analyze도 store에 쌓임; continue가 텍스트만 받아 미디어 추가 턴은 별도 `analyze` 호출.

#### Option B — 텍스트만 반환 (stateless)
- Pro: 매핑·정리 단순.
- Con: 후속 질문마다 미디어 재전달·재업로드.

### Model
#### Option A — 기본 `gemini-3.5-flash` + 선택적 `model` 오버라이드
- Pro: 문서·품질·속도와의 균형; 에이전트가 인자 생략 가능.
- Con: 모델 개명 시 기본값 갱신 필요.

#### Option B — `model` 필수
- Pro: 암묵적 기본값 없음.
- Con: 매 호출 부담; 에이전트 실수 증가.

#### Option C — Pro 계열 기본 (예: `gemini-3.5-pro`)
- Pro: 어려운 VQA·장문 분석에 유리할 수 있음.
- Con: 비용·지연↑; 문서 예시는 Flash.

## Tradeoffs

| | Interaction A | Interaction B |
|---|---------------|---------------|
| 후속 질문 | ✅ continue | 매번 재analyze |
| store 복잡도 | 있음 | 없음 |

| | Model A Flash 기본 | B 필수 | C Pro 기본 |
|---|---------------|--------|-----------|
| 호출 편의 | 높음 | 낮음 | 높음 |
| 비용 | 중간 | 가변 | 높음 |

## Recommendation (optional)
- 사용자 지시와 동일: Interaction A + Model A.

## Consequences
- MCP: `analyze({ inputs, prompt, model? })` → `{ interactionId, text }`.
- `continue_interaction` 도구 설명에 analyze follow-up 가능함을 명시.
- 스키마 ADR 응답을 `{ interactionId, text }`로 정합.
- `media_resolution`·analyze 전용 continue 도구는 비범위.

## Related ASRs
- ASR-026 — Analyze interaction·모델 기본값 — 본 ADR
- ASR-024 — 요청·응답 스키마 — 응답에 `interactionId` 추가
- ASR-021 — Multi-turn — continue 재사용
- ASR-019 — Interaction 메타데이터 — analyze 매핑

## Downstream Concerns
- [ ] store에 `requestFile` 없을 때 list/show UX
- [ ] continue 시 미완료/텍스트 없는 interaction 오류 메시지
- [ ] 기본 모델 문자열 변경 시 README/스펙 동기화
- [x] **CLI:** `adr/analyze-cli-surface.md` (approved)

## Related
- `adr/analyze-request-response-schema.md`
- `adr/analyze-input-upload-strategy.md`
- `adr/analyze-cli-surface.md`

## Tags
`analyze`, `interactionId`, `continue_interaction`, `gemini-3.5-flash`

## Approved
- 2026-07-29: Interaction Option A + Model Option A (`gemini-3.5-flash`), user confirmed
