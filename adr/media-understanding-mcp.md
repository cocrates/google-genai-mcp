# Media Understanding MCP Surface

## Concern
google-genai-mcp에 Gemini의 image / audio / video **이해(분석)** 기능을 어떤 형태로 추가할 것인가?

## Status
approved

## Context
- 현재 패키지는 **생성 전용**이다. PRD·스펙 Out of Scope에 `멀티모달 분석 (analyze_image/video)`가 명시되어 있다.
- Gemini Interactions API는 동일 패턴으로 미디어를 입력하고 **텍스트**를 반환한다 ([이미지 이해](https://ai.google.dev/gemini-api/docs/image-understanding?hl=ko), [동영상 이해](https://ai.google.dev/gemini-api/docs/video-understanding?hl=ko), [오디오 이해](https://ai.google.dev/gemini-api/docs/audio?hl=ko)).
- 에이전트 사용 시나리오:
  1. **생성 QA** — `generate`로 만든 image/audio/video가 프롬프트·의도대로인지 분석·평가
  2. **사용자 요청 분석** — 임의 미디어에 대한 설명·분석·평가 요청 → MCP로 호출 → 호스트 AI가 결과를 해석·설명
- 많은 MCP 호스트는 **로컬 동영상/오디오를 직접 보지 못하거나** 토큰·크기 제한으로 전달이 어렵다. 서버 측 업로드 + 분석이 루프를 닫는 데 유리하다.
- 기존 생성 경로에는 `params.references`(로컬 파일)와 Interactions API 인프라가 이미 있다. 이해 기능은 **출력이 파일(바이너리)이 아니라 텍스트**라는 점이 생성과 가장 큰 차이다.

### Gemini 미디어 이해 요약 (API 기준)

| | Image | Video | Audio |
|---|--------|--------|--------|
| **입력** | URL / 인라인(<20MB) / Files API | Files API / 인라인(<100MB·짧은 클립) / YouTube URL / GCS | Files API / 인라인(<20MB) |
| **대표 모델** | `gemini-3.5-flash` 등 멀티모달 Gemini | 동일 | 동일 |
| **출력** | 텍스트 (캡션, VQA, 객체 감지·세분화 좌표 등) | 텍스트 (요약, Q&A, `MM:SS` 타임스탬프) | 텍스트 (전사, 화자 분리, 감정, 요약) |
| **대용량** | Files API 권장 | ≥100MB·장시간·재사용 → Files API | ≥20MB → Files API |
| **토큰(대략)** | 해상도·타일 의존 (`media_resolution`) | ~300 tok/s(기본) / ~100(low); 오디오 32 tok/s | 32 tok/s; 최대 ~9.5h |
| **특이** | 바운딩박스·세분화 전용 강화 | 기본 1 FPS 샘플링; 공개 YouTube만 | 구조화 출력으로 전사 스키마 가능 |

공통: Interactions API `input`에 `{type: image|video|audio, uri|data, mime_type}` + 텍스트 프롬프트.

## Decision
**Option A — 통합 `analyze`**
YAML `type: analyze` + MCP 도구 1개로 image/audio/video 이해를 노출한다. 생성 QA와 임의 미디어 분석을 동일 표면으로 커버하고, 기존 파일 기반 UX를 유지한다.

## Options

### Option A — 통합 `analyze` (YAML `type: analyze` + MCP 도구 1개)
- 생성과 같이 **요청 파일 1개**로 image/audio/video(+텍스트 프롬프트)를 선언하고, MCP `analyze`(또는 동일 스키마의 전용 도구)가 텍스트 결과를 반환한다.
- 내부: 필요 시 Files API 업로드 → `interactions.create` → `output_text` (및 선택적 `response_format`).
- Pro: 기존 파일 기반 UX·경로 해석과 일치; 모달리티 공통 파이프라인; 생성 QA·임의 분석 모두 커버.
- Con: `generate`와 응답 스키마가 다름(파일 목록 vs 텍스트); 도구 이름·interaction 매핑 정책을 새로 정해야 함.

### Option B — 모달리티별 도구 (`analyze_image` / `analyze_video` / `analyze_audio`)
- 참고 구현(`docs/gemini-mcp-reference.md`의 `gemini-analyze-image` 등)처럼 도구를 나눈다. YAML은 선택·또는 인라인 인자만.
- Pro: 에이전트가 도구 설명만으로 모달리티·제약을 찾기 쉬움; 스키마를 모달리티별로 좁힐 수 있음.
- Con: 도구 수 증가·중복 업로드/프롬프트 로직; 이 패키지의 “YAML 단일 진입” 철학과 어긋남.

### Option C — 생성 QA 전용 (`evaluate` / post-generate만)
- `interactionId` 또는 방금 저장된 `files` + 원본 YAML 프롬프트를 넣어 “의도 부합 여부”만 평가한다. 임의 사용자 미디어 분석은 제외.
- Pro: 생성 패키지 정체성과 가장 잘 맞음; 범위·위험 작음.
- Con: 사용자 시나리오 2(임의 미디어 설명·분석)를 충족하지 못함; 결국 범용 분석이 다시 필요해질 가능성 높음.

### Option D — Out of Scope 유지 (추가하지 않음)
- 호스트 모델 비전/오디오에 맡기거나, 사용자가 별도 Gemini 클라이언트를 쓴다.
- Pro: 패키지 범위·유지보수 최소; PRD Out of Scope와 일치.
- Con: 로컬 video/audio QA·분석 루프가 MCP만으로는 닫히지 않음; 생성 품질 검증 자동화에 공백.

## Tradeoffs

| | A 통합 analyze | B 모달리티별 도구 | C QA 전용 | D 미추가 |
|---|---------------|------------------|----------|---------|
| 생성 QA | ✅ | ✅ | ✅ | ❌ |
| 임의 미디어 분석 | ✅ | ✅ | ❌ | ❌ (호스트 의존) |
| YAML/파일 UX 일관성 | 높음 | 낮음~중간 | 중간 | — |
| 도구 표면 복잡도 | 낮음(+1) | 높음(+3) | 낮음(+1) | 없음 |
| 생성 패키지 정체성 | 확장 | 확장 | 가장 좁은 확장 | 유지 |
| 구현 재사용 (Interactions/경로) | 높음 | 중간 | 높음 | — |

## Recommendation (optional)
- **Option A** 권장.
- 이유: 시나리오 1·2를 한 표면으로 커버하고, 기존 `generate`+YAML 패턴을 유지하며, Gemini 문서의 통합 Interactions 입력 모델과도 맞다. QA는 `analyze` YAML에서 원본 프롬프트·산출물 경로를 넣으면 충분하고, C처럼 전용 도구로 좁힐 필요는 없다.
- B는 에이전트 디스커버리 이점이 있으나 이 레포의 “파일 1개 = 요청 1건” 규칙과 충돌한다. D는 생성-검증 루프를 의도적으로 포기하는 선택이다.

## Consequences
- 승인 시 PRD/스펙 Out of Scope에서 멀티모달 분석을 제거하고 In Scope로 옮긴다.
- `generate`와 별도 **텍스트 출력** 경로·MCP 응답 스키마가 생긴다.
- 대용량 video/audio는 Files API·폴링(ACTIVE)이 필요해 생성 경로보다 업로드/대기 로직이 추가된다.
- 객체 감지 좌표·세분화 마스크·YouTube URL·구조화 전사 등은 MVP에 넣을지 Downstream에서 결정한다.

## Related ASRs
- ASR-023 — 미디어 이해(분석) MCP 기능 — 본 ADR이 해결하는 핵심 concern
- ASR-004 — MVP 기능 범위 — 생성 전용에서 이해 포함으로 범위 개정 여부
- ASR-013 — 파일 기반 입력 — analyze도 YAML/JSON 단일 파일인지
- ASR-014 — API 이중 체계 — Interactions API로 이해 호출 통일 여부
- ASR-006 — 바이너리 출력 — 이해는 텍스트 출력이므로 별도 응답 계약 필요

## Downstream Concerns
- [x] **입력·업로드 전략:** → `adr/analyze-input-upload-strategy.md` (approved, Option A)
- [x] **요청/응답 스키마:** → `adr/analyze-request-response-schema.md` (approved, Option A)
- [x] **모델·해상도 기본값:** 기본 `gemini-3.5-flash`, `media_resolution` MVP 미노출 — `adr/analyze-interaction-and-model.md`
- [x] **Interaction 매핑:** `interactionId` + `continue_interaction` — `adr/analyze-interaction-and-model.md`
- [x] **CLI:** → `adr/analyze-cli-surface.md` (approved) — `gemini analyze` 플래그; follow-up=생성과 동일
- [ ] **특화 기능 범위:** 이미지 바운딩박스/세분화, 오디오 화자분리 스키마를 1차에 넣을지

## Related
- `adr/analyze-request-response-schema.md` — Downstream (스키마)
- [이미지 이해](https://ai.google.dev/gemini-api/docs/image-understanding?hl=ko)
- [동영상 이해](https://ai.google.dev/gemini-api/docs/video-understanding?hl=ko)
- [오디오 이해](https://ai.google.dev/gemini-api/docs/audio?hl=ko)
- `spec/PRD.md` — Out of Scope: 멀티모달 분석
- `spec/google-genai-mcp.md` — Out of Scope: `analyze_image/video`
- `docs/gemini-mcp-reference.md` — 타 패키지 `gemini-analyze-image` 참고

## Tags
`mcp`, `gemini`, `media-understanding`, `image`, `video`, `audio`, `interactions-api`, `scope`

## Approved
- 2026-07-29: Option A, user confirmed
