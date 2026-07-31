# Unified References Field

## Concern
생성 요청 YAML에서 참조 미디어 입력 필드명을 타입별로 다르게 둘 것인가, `references`로 통일할 것인가? 그리고 경로가 없거나 타입이 부적절한 경우 어떻게 처리할 것인가?

## Status
approved

## Context
- 현재 스키마가 타입마다 갈라져 있다:
  - **image / music:** `params.images[].path`
  - **video:** `params.references[]` (`path` + 선택 `type`); 레거시로 `params.images`도 허용·매핑
  - **speech:** 참조 미디어 없음
- 에이전트·사용자가 타입마다 필드명을 바꿔야 해 실수·혼동 비용이 크다. Video가 이미 `references`를 정규 필드로 쓴다.
- 파싱 시 `existsSync`로 존재 검사는 이미 한다 (`request.ts`). 다만 (1) 디렉터리·비정규 파일 여부, (2) image/music에서 지원하지 않는 확장자·모달리티, (3) MIME 기본값 폴백(`getImageMimeType` 등 미지 확장자 → png MIME)으로 **부적절 입력이 API까지 넘어갈 여지**가 있다.
- ASR-007은 입력 오류를 즉시 실패로 분류한다. “없으면/부적절하면 조용히 진행”은 그 결정과 어긋난다.
- ASR-013은 파일 기반 입력을 확정했으나, 참조 필드 **명명 통일**은 아직 결정되지 않았다.

## Decision
**Option A — `references`로 전 타입 통일 + 엄격 검증**
image/video/music 정규 필드를 `params.references`로 통일하고, 미존재·비파일·부적절 타입/확장자는 파싱 단계에서 `INVALID_INPUT`으로 즉시 실패한다.

**Downstream (2026-07-31, user):**
- `params.images` **제거** — 사용 시 즉시 오류 (`params.images is removed; use params.references`).
- 내부 타입(`ImageParams` / `MusicParams`)도 `references`로 통일.
- 빈 `references: []` 허용(생략과 동일).
- 허용 확장자는 스펙 표로 고정.

## Options

### Option A — `references`로 전 타입 통일 + 엄격 검증 (권장)
- image / video / music 모두 정규 필드명을 `params.references`로 통일.
- 항목 형태: `{ path, type? }`. image·music은 `type` 생략 시 `image`로 취급(또는 확장자 추론 후 image만 허용).
- video는 기존처럼 `image` | `video` | `audio` (확장자 추론 또는 명시).
- **`params.images`는 제거** — 사용 시 즉시 오류 (레거시 별칭 없음). Downstream에서 확정.
- 검증(파싱 단계, API 호출 전):
  - 경로 미존재 → `INVALID_INPUT` 즉시 실패
  - 경로가 파일이 아님(디렉터리 등) → 즉시 실패
  - 타입·확장자가 해당 생성 종류에 부적절(예: image 요청에 `.mp4`, music에 audio/video, 미지원 확장자) → 즉시 실패 (MIME 폴백으로 넘겨 보내지 않음)
- Pro: YAML·에이전트 프롬프트·문서가 한 규칙; Video와 정합; 실패가 조기에 드러나 재점검 가능.
- Con: 기존 image/music YAML·예제·PROMPTS 마이그레이션 필요.

### Option B — 필드명 현행 유지 + 엄격 검증만 강화
- image/music은 `images`, video는 `references` 유지.
- 존재·파일 여부·확장자/모달리티 부적절 시 Option A와 동일한 즉시 실패.
- Pro: 기존 image/music YAML 무수정; 변경 범위가 검증 로직에 한정.
- Con: 타입별 필드명 불일치가 남음; 에이전트/문서에 “video만 references” 특례가 계속 필요.

### Option C — `references` 통일 + 존재 실패만, MIME/타입은 warn
- 필드명은 Option A처럼 통일.
- 파일 미존재·비파일만 즉시 실패. 확장자/모달리티 불일치는 warn 후 기존 MIME 폴백으로 API 호출.
- Pro: 마이그레이션·이름 통일 이득; 약간 관대한 실행.
- Con: “부적절해도 실행”이 사용자 의도(“오류 반환으로 재점검”)와 충돌; 조용한 잘못된 MIME 전송 가능.

## Tradeoffs

| | A — 통일 + 엄격 | B — 이름 유지 + 엄격 | C — 통일 + 느슨 |
|---|---|---|---|
| 필드명 일관성 | 높음 | 낮음 | 높음 |
| 기존 YAML 호환 | 레거시 별칭 필요 | 높음 | 레거시 별칭 필요 |
| 부적절 입력 조기 차단 | 높음 | 높음 | 부분(존재만) |
| 에이전트 재점검 UX | 좋음 | 좋음(이름은 혼란) | 약함 |

## Recommendation
- **Option A**를 권장한다. Video가 이미 `references`이고, image/music도 “참조 입력” 의미상 동일하다. 존재·타입 검증을 파싱에서 실패시키면 ASR-007·사용자 요구와 맞는다.
- speech는 참조 미디어가 없으므로 해당 없음(변경 없음).

## Consequences
- 스펙·타입·`request.ts` 파서·예제·PROMPTS/README를 `references` 기준으로 개정.
- image/music 내부 모델도 `references`로 통일.
- `params.images` 사용 시 명확한 오류 메시지.
- 미지원 확장자 목록을 타입별로 명시(스펙 표).

## Related ASRs
- ASR-029 — 참조 미디어 필드 명명·검증 — 본 ADR이 직접 해결
- ASR-013 — 파일 기반 입력 지원 — YAML 스키마·경로 해석의 상위 맥락
- ASR-007 — 오류 처리 및 복구 전략 — 입력 오류 즉시 실패와 정합

## Downstream Concerns
- [x] **레거시 `params.images` 수명:** **제거** — 사용 시 `INVALID_INPUT` (별칭 없음)
- [x] **내부 타입 정리:** `ImageParams` / `MusicParams`도 `references`로 통일
- [x] **허용 확장자·MIME 목록:** 스펙 표로 고정; 미지원 확장자 실패
- [x] **빈 `references: []`:** 허용 (생략과 동일)

## Related
- `spec/google-genai-mcp.md` — Image/Video/Music 파라미터, 요청 파일 처리
- `src/core/request.ts` — `resolveMediaRefs` / reject `params.images`
- `src/core/types.ts` — `ImageParams`, `VideoParams`, `MusicParams`

## Tags
`yaml-schema`, `references`, `validation`, `image`, `video`, `music`

## Approved
- 2026-07-31: Option A, user confirmed
- 2026-07-31: Downstream — `params.images` 제거(오류), 내부 `references` 통일, user confirmed
