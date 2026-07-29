# Analyze Input Upload Strategy

## Concern
`analyze`의 `inputs[]` 항목을 Gemini에 **어떻게 전달**할 것인가? (로컬 인라인 vs Files API, URL/YouTube, MIME 추론, 개수 한도)

## Status
approved

## Context
- 상위: `adr/media-understanding-mcp.md`(통합 analyze), `adr/analyze-request-response-schema.md`(`inputs`+`prompt`→`text`).
- Gemini 입력 방법 ([동영상 이해](https://ai.google.dev/gemini-api/docs/video-understanding?hl=ko) 등):
  - **인라인** base64 — 총 요청 ~20MB 이하(이미지·오디오 문서 기준; 짧은 비디오도 유사).
  - **Files API** — 대용량·장시간·재사용; 업로드 후 `PROCESSING` → **`ACTIVE` 폴링** 필수.
  - **공개 URL / YouTube** — `uri`로 직접 전달(YouTube는 공개만; 미리보기·쿼터 제한).
- 생성 QA 시나리오: `generate` 산출물(특히 video)이 수십~수백 MB일 수 있어 **인라인만**이면 실패한다.
- 패키지에 이미 `inferMediaRefType`·확장자→MIME 매핑이 있다 (`src/core/output.ts`). Files API 업로드 헬퍼는 아직 없음.
- Gemini 2.5+ 기준 요청당 동영상 최대 약 10개.

## Decision
**Option A — 하이브리드 전달 + URL 패스스루**
로컬 ≤20MB 인라인 / 초과 Files API+ACTIVE 폴링. YouTube·공개 http(s)는 `uri` 패스스루. MIME은 `inferMediaRefType` 재사용. `inputs` 1–10개.

## Options

### Option A — 하이브리드 전달 + URL 패스스루
- **로컬 경로:** 파일 크기(및 합산 추정)가 임계값 **이하**면 인라인 `{type, data, mime_type}`; **초과**면 Files API 업로드 → ACTIVE까지 폴링 → `{type, uri, mime_type}`.
  - 권장 임계값: 파일당 **20MB** (요청 총량 가이드에 맞춤). video도 동일 규칙(짧고 작으면 인라인 가능).
- **`inputs` 문자열 해석:**
  1. YouTube (`youtube.com` / `youtu.be`) → `type: video`, `uri` 그대로
  2. 그 외 `http(s)://` → `uri` 패스스루; 타입은 URL path 확장자 또는(불가 시) 명시 오류
  3. 그 외 → workspace/절대 **로컬 경로** (존재·가독성 검사)
- **MIME/타입:** 로컬·URL 확장자는 기존 `inferMediaRefType` + MIME 맵 재사용. 추론 실패 시 즉시 `INVALID_INPUT`.
- **개수:** `inputs.length` 1–10 (API 상한에 맞춤).
- **폴링:** 5초 간격; `ACTIVE` 진행, `FAILED` 즉시 에러. 대기 상한은 Downstream(또는 구현 시 합리적 기본, 예: 15분) — 생성 CLI와 달리 업로드 처리는 무한 대기를 피함.
- Pro: 작은 이미지 QA는 빠름; 큰 비디오도 동작; YouTube·공개 URL로 사용자 분석 시나리오 커버; 에이전트는 경로/URL만 넣으면 됨.
- Con: 인라인/Files 분기·폴링 구현; URL MIME 애매한 경우 오류 처리 필요.

### Option B — 로컬은 항상 Files API
- 모든 로컬 파일을 업로드+ACTIVE 대기 후 `uri`만 사용. URL/YouTube는 Option A와 동일 패스스루 가능.
- Pro: 코드 경로 단순; 크기 분기 없음.
- Con: 작은 PNG 분석도 업로드 지연; Files API 쿼터·48h 보관에 불필요하게 의존.

### Option C — 로컬 인라인만 (대용량 거부)
- 임계값 초과 시 명확한 에러(“Files API 미지원” 또는 “파일 축소 필요”). YouTube는 선택.
- Pro: 구현 최소.
- Con: 생성 video QA·장문 오디오 분석이 깨짐 — 제품 시나리오와 충돌.

### Option D — 로컬 경로만 (URL/YouTube MVP 제외)
- 전달 방식은 A 또는 B. `inputs`는 로컬만.
- Pro: MVP 범위 축소; URL 보안·MIME 이슈 연기.
- Con: 사용자 “이 YouTube 요약해줘”·공개 이미지 URL 분석을 MCP만으로 못 함; 나중에 스키마는 같아도 문서·테스트 추가 필요.

## Tradeoffs

| | A 하이브리드+URL | B 항상 Files | C 인라인만 | D 로컬만 |
|---|---------------|-------------|-----------|---------|
| 생성 video QA | ✅ | ✅ | ❌ | ✅(로컬이면) |
| 작은 이미지 지연 | 낮음 | 높음 | 낮음 | A/B에 따름 |
| YouTube/공개 URL | ✅ | ✅(확장 시) | 선택 | ❌ |
| 구현 복잡도 | 중간 | 낮~중 | 낮음 | A보다 낮음 |
| 에이전트 편의 | 높음 | 중 | 낮음(큰 파일) | 중 |

## Recommendation (optional)
- **Option A** 권장.
- 생성 QA(대용량)와 임의 URL 분석을 한 규칙으로 커버하고, 작은 파일은 인라인으로 빠르게.
- Option D로 URL을 빼면 단기 구현은 줄지만, `inputs: string[]` 계약상 URL을 넣는 것이 자연스러워 **MVP에 패스스루를 포함하는 편이 낫다**.
- Option B는 운영 단순성을 원할 때만; 기본 체감은 A가 낫다.

## Consequences
- `src/core/`에 Files 업로드+ACTIVE 대기 유틸 추가(analyze 전용, 이후 재사용 가능).
- `inputs` 항목별 해석기(YouTube / http(s) / local)와 기존 MIME 추론 연결.
- GCS 등록·외부 비공개 URL 다운로드 대행은 **비범위**(공개 URI만 패스스루; 로컬만 읽기).
- 폴링 중 MCP tool call이 길어질 수 있음 — 클라이언트 timeout 이슈는 모델/백그라운드 Downstream과 연계 검토.

## Related ASRs
- ASR-025 — Analyze 입력·업로드 전략 — 본 ADR
- ASR-024 — Analyze 요청·응답 스키마 — `inputs[]` 의미 구체화
- ASR-023 — 미디어 이해 MCP — 상위
- ASR-013 — 파일 기반 입력 — 로컬 경로 해석(workspace 상대) 재사용

## Downstream Concerns
- [ ] **ACTIVE 대기 상한·백오프** 수치 확정 (구현 시 기본 15분 후보)
- [x] **모델 기본값** — `adr/analyze-interaction-and-model.md`
- [x] **Interaction** — 동 ADR
- [ ] **합산 20MB** 추정(여러 인라인+prompt) 정밀 규칙 vs 파일당만
- [ ] MCP 장시간 업로드 시 클라이언트 timeout 완화(진행 로그 stderr 등)

## Related
- `adr/analyze-request-response-schema.md` — approved
- [동영상 이해 — 입력 방법](https://ai.google.dev/gemini-api/docs/video-understanding?hl=ko)
- [이미지 이해](https://ai.google.dev/gemini-api/docs/image-understanding?hl=ko)
- [오디오 이해](https://ai.google.dev/gemini-api/docs/audio?hl=ko)

## Tags
`analyze`, `files-api`, `inline`, `youtube`, `mime`, `upload`

## Approved
- 2026-07-29: Option A, user confirmed
