# PROMPTS.md: google-genai-mcp 개발 대화 기록

> **생성일:** 2026-07-23
> **목적:** 프로젝트 초기 설계 의사결정 과정 정리
> **최종 갱신:** 2026-07-23 (세션 4: Entry Point + Core Module 설계)

---

## 1. 프로젝트 요청

**사용자:**
> google gemini가 제공하는 기능을 사용자 또는 에이전트가 쉽게 사용할 수 있도록 CLI와 MCP를 제공하는 프로그램을 개발해줘.

**Cocrates (요약):**
- spec-driven-generation 워크플로우 시작
- 프로젝트 루트: `./` (Type 1 - 단일 프로젝트)
- Step 0 평가: 모든 게이트 실패 → Step 1 (PRD 생성)부터 시작
- 핵심 질문 5가지 제시: 언어/런타임, MCP 버전, CLI 범위, 인증, 패키징

---

## 2. MCP 전송 방식 → ADR 작성

**사용자:**
> MCP를 stdio 방식으로 제공하는 것과 http 방식으로 제공하는 것의 차이는? adr을 작성해서 분석해줘.

**Cocrates (요약):**
- ADR 워크플로우 시작
- 프로젝트 구조 생성: `adr/`, `spec/` 디렉토리
- `spec/ASR.md` 초기화 (ASR-001: MCP 전송 방식)
- `adr/mcp-transport.md` 작성
- 세 가지 옵션 비교:
  - **Option A:** stdio 전용 (단순, 보안 쉬움, 에이전트 호환성 높음)
  - **Option B:** HTTP 전용 (원격 접근, 동시 접근, 배포 유연성)
  - **Option C:** 둘 다 지원 (최대 유연성, 복잡도 높음)
- 추천: Option A (stdio 전용) → 이후 Option C로 확장

---

## 3. MCP 전송 방식 결정 → ADR 승인

**사용자:**
> 좋아 Option A로 하자.

**Cocrates (요약):**
- ADR 승인 처리 완료
- `adr/mcp-transport.md`: Status → approved, Decision 기록
- `spec/ASR.md`: ASR-001 Status → designed, Resolution 기록
- Downstream Concerns 식별:
  1. CLI 포함 여부
  2. 패키징 구조
  3. Gemini API 기능 범위 (MVP)

---

## 4. Downstream Concerns 결정 → PRD 작성

**사용자:**
> 1. CLI + MCP, 2. 단일 패키지: google-genai-mcp, 3. image, video 생성을 mvp로 한다.

**Cocrates (요약):**
- 세 가지 결정을 근거로 PRD 작성(`spec/PRD.md`)
- PRD 내용:
  - **목적:** Gemini Image/Video 생성을 MCP + CLI로 제공
  - **MVP:** Image 생성, Video 생성
  - **언어:** TypeScript + Node.js
  - **패키징:** 단일 패키지 `google-genai-mcp`
  - **전송:** stdio (MCP)
  - **인증:** Google ADC 또는 `GEMINI_API_KEY`

---

## 5. ASR 추가 식별

**사용자:**
> 설계에서 검토해야 할 ASR 항목을 추가로 식별해줘.

**Cocrates:**
- ASR-001~004 이외에 설계에서 검토해야 할 ASR 추가 식별
- 9개 추가 ASR 후보 제시 (ASR-005~013)

---

## 6. Gemini API 클라이언트 통합 → ADR 작성

**사용자:**
> asr-005부터 하자.

**Cocrates:**
- ASR-005 검토 시작
- `@google/genai` SDK 조사: 경량 객체, `GOOGLE_API_KEY` 자동 읽기

**핵심 질문: 여러 에이전트가 동시에 요청하면 어떻게 되나?**

**Cocrates:**
- stdio는 프로세스당 클라이언트 1개 (MCP 사양상 프로세스 격리)
- 여러 에이전트 → 각각 다른 MCP 서버 프로세스 → 충돌 없음
- 싱글톤이 여전히 유효

**사용자:**
> adr로 정리해줘. HTTP/SSE 에서의 이슈도 포함해 주고. 싱글톤으로 결정해줘.

**핵심 결정:**
- **ASR-005 (Gemini API 클라이언트):** Option A 채택 — 싱글톤
- `adr/gemini-client-lifecycle.md` 작성 및 승인
- HTTP/SSE 확장 시 연결 풀/워커 모델 검토 필요 (Downstream Concerns)

---

## 7. 진행상황 표시 및 비동기 처리

**사용자:**
> CLI 는 progress를 표시하는 것이 좋을 것 같아. 그런데, MCP는 에이전트가 진행상황을 관리할 수 있을 것 같은데, 어떤 방법이 좋을까?

**Cocrates:**
- MCP progress notification (`notifications/progress`) 표준 존재 확인
- **핵심 문제:** 에이전트가 받은 진행상황을 사용자에게 보여주나? → **아님** (대부분의 MCP 클라이언트가 미표시)
- 제안: MCP도 progress를 보내되, CLI와 차별화

---

## 8. Gemini Interactions API 조사

**사용자:**
> gemini interactions api 설명에 보면, 1) 산출물 데이터가 보관됨. 2) 배치 요청이 있음. 이런 기능도 활용하면 좋을 것 같은데

**Cocrates:**
- Interactions API 조사 (2026-06 GA, 권장 API)
- 핵심 발견:
  - **서버 측 상태 관리:** interaction ID로 언제든 상태/결과 조회 가능
  - **백그라운드 실행:** `background=true` → 즉시 ID 반환, 서버에서 비동기 실행
  - **산출물 보관:** 55일 (유료), 1일 (무료)
  - **Batch API:** generateContent 전용 (Interactions API 미지원), 비용 50% 절감

**사용자:**
> A로 해줘. 이미 generateContent는 레거시로 간주된다고 하니. 이미지/동영상 생성 요청의 처리 상태를 관리하고 완료된 이미지/동영상을 로컬에 저장하는 인터페이스도 제공하면 되지 않을까? 그리고, 복수 생성에 대한 batch 작업 기능도 좋겠고.

**핵심 결정:**
- **API 전략:** Interactions API를 MVP에서 바로 도입
- **상태 관리 + 로컬 저장 인터페이스:** interaction ID 기반 상태 관리, 완료 시 로컬 저장
- **Batch 작업:** generateContent + Batch API로 대량 생성 지원
- **출력 위치:** 기본값은 현재 디렉토리, `--output-dir`로 변경 가능

---

## 9. MCP 비동기 처리 메커니즘

**사용자:**
> 에이전트가 MCP 도구를 호출하면, 결과를 에이전트에게 다시 메시지로 요청하는 것으로 이해하고 있는데, MCP에서 비동기적으로 결과를 전달하는 동작이 어떻게 처리되나?

**Cocrates:**
- MCP 비동기 메커니즘 3가지 계층 확인:
  1. **Progress Notifications:** 진행상황 전달, 하지만 `tools/call`은 블로킹
  2. **Tasks Extension (MCP 2026-07-28):** 공식 확장, `CreateTaskResult` 즉시 반환
  3. **Long-Running Operations:** 제안 단계

**사용자:**
> notifications/progress가 반환되면 LLM 모델이 상황을 이해할까?

**Cocrates:**
- **아님** — `notifications/progress`는 MCP 클라이언트 라이브러리에서 소비, LLM의 컨텍스트에 포함되지 않음
- 실용적 해결책 제시:
  - **방식 1 (추천):** 즉시 acknowledgment + 서버 측 폴링 (2개 도구 분리)
  - **방식 2:** MCP 서버가 작업 완료까지 대기 (블로킹)

---

## 10. 백그라운드 실행 모드 결정

**사용자:**
> 1. mcp에 관한 스펙 - 비동기 처리 등은 docs에 별도 문서로 정리해 주고.
> 2. background=true 인것은 요청하고 나중에 결과를 확인하도록 하고, background=false 인 것은 결과가 완료될 때까지 기다리는 것으로 하면 어떨까? 파라미터로 결정할 수 있게. 오래 걸리지 않는 image 생성 등은 background=false를 기본 값으로 하고, 동영상 생성은 background=true로 하는 것도 좋겠고.

**Cocrates:**
- **ASR-017 (백그라운드 실행 모드):** `background` 파라미터로 동기/비동기 결정
  - `background=false` (기본, image): 결과 완료까지 대기 → 파일 경로 반환
  - `background=true` (기본, video): 즉시 interaction ID 반환, 서버 측 폴링
  - 사용자가 명시적으로 오버라이드 가능
- `docs/mcp-async-processing.md` 생성 — MCP 프로토콜 비동기 처리 메커니즘 전체 정리

---

## 11. ASR 검토 세션 — 남은 11개 ASR 전체 결정

**Cocrates:**
- TODO.md 확인: T-004 `in_progress`, ASR-007~017 `identified`
- 의존 순서대로 ASR 검토 시작

### ASR-017: 백그라운드 실행 모드

**Cocrates 제안:** image=false(동기), video=true(비동기), Interactions API background=true, 사용자 오버라이드 가능.

**사용자:** asr-17은 그렇게 결정하면 될 듯.

### ASR-011: 비디오 생성 시간 초과 처리

**Cocrates 제안:** MCP background=true로 timeout 회피. CLI poll 10초/최대 10분.

**사용자:** OK. 그렇게 하자.

### ASR-013: 파일 기반 입력 지원

**Cocrates 제안:** `--prompt-file request.yaml`, MCP `promptFilePath`. YAML/JSON에 전체 파라미터 기술.

**사용자:**
> prompt input뿐 아니라 image_size, aspect_ratio 같은 파라미터도 포함. yaml/json으로 기술하고, batch 처리도.

**Cocrates 수정:** 파일 형식 YAML/JSON, 전체 파라미터 기술, batch 지원.

**사용자:**
> 그냥 prompt-file, promptFilePath로 하자. 생성 파라미터도 프롬프트에 포함. image, video 등 산출물에 대한 파라미터를 yaml/json 파일로 기술하고, 파일을 입력으로 생성 요청.

**결정:** `--prompt-file` / `promptFilePath`, YAML/JSON에 전체 파라미터 기술, batch 처리 지원.

### ASR-014: API 이중 체계 관리

**사용자:** OK 배치 요청은 별도로 하자. (MVP에서는 Interactions API만)

### ASR-015: 산출물 보관 전략

**사용자:** 기본 동작이 좋지. (로컬 자동 저장)

### ASR-016: 출력 파일 위치 관리

**사용자:** 기본적으로 출력 파일도 파라미터로 지정. 지정 안 되면 파일명 규칙.

### ASR-007: 오류 처리 및 복구 전략

**사용자:**
> 오류는 어떻게 처리하는 것이 좋을까?

**Cocrates:** 에러 유형별 정리 — 입력/인증/rate limit/서비스/quota. MCP tool error, CLI exit code (0:성공, 1:일반, 2:입력, 3:인증, 4:API). 재시도는 rate limit과 일시적 서비스 오류만.

**사용자:** 좋아. 그렇게 정리해줘.

### ASR-012: TypeScript 타입 안전성

**사용자:** 오케이. (MCP schema만 공개, Gemini SDK는 내부 변환)

### ASR-008: 로깅 및 관찰 가능성

**사용자:**
> JSON보다 YAML이 어떨까? MCP stderr로 로그가 출력되면 어떻게 확인? CLI stderr도 보일 것 같은데. 파일로 저장되는 것이 좋지 않을까?

**Cocrates 수정:** 파일 기반 로깅 제안.

**사용자:**
> `~/.local/share/google-genai-mcp/logs/` 폴더에 저장. `~/.local/share/google-genai-mcp/config.json`에 configuration 설정.

**결정:** 파일 기반 로깅, config.json에서 log level 설정.

### ASR-010: Node.js 버전 호환성

**사용자:** 오케이. (18+ LTS, 의존성 최소화)

### ASR-009: 테스트 전략

**사용자:**
> 커버리지 목표를 최고 수준으로 해줘.

**결정:** 커버리지 90%+.

---

## 12. Image 생성 파라미터 및 YAML 스키마 설계

**사용자:**
> image 생성 파라미터를 어떻게 할지, image 생성을 위한 json/yaml 파일은 어떻게 구성할 지에 대해 검토해 보자.

**Cocrates:**
- Gemini API Image Generation 문서 조사
- Imagen 4 파라미터 분석 (deprecated 예정 2026-08-17)
- Nano Banana (새 모델) 정보 수집
- Image 파라미터 후보 제시:
  - `numberOfImages`, `imageSize`, `aspectRatio`, `personGeneration`, `negativePrompt`, `seed`
- YAML 스키마 3가지 안안 제시:
  - **안안 A:** 단일 파라미터 구조
  - **안안 B:** 타입 명시적 구조 (`type: image`)
  - **안안 C:** 배치 지원 구조

**사용자:**
> 1. 다양한 산출물에 대해 명시할 수 있어야 하므로, type별 명시적 구조가 좋은 것 같아.
> 2. 기본 이미지는 1개로 하자. output filename도 정한다.
> 3. nano banana에서 핵심은 참조 이미지. "Take the blue floral dress from the first image..."

**Cocrates:**
- 아키텍처 영향 분석:
  - 모델 변경: Imagen 4 → **Nano Banana 필수** (참조 이미지는 Imagen에서 불가)
  - MCP tool schema에 `images[]` 파라미터 추가 필요
  - PRD Scope 업데이트 필요
- Nano Banana 모델 비교표 제시 (Nano Banana 2 vs Pro)
- 참조 이미지 3가지 유형 조사:
  - **Object Reference:** 객체 시각적 충실도 유지
  - **Character Reference:** 인물/캐릭터 일관성 유지
  - **Style Reference:** 아트 스타일 재현 (Pro만)

**사용자:**
> 다양한 산출물에 대해 명시할 수 있어야 하므로, type별 명시적 구조가 좋은 것 같아. 기본 이미지는 1개. output filename도 정한다. 참조 이미지 목록이 필요하다.

**Cocrates:**
- 타입 기반 YAML 스키마 확정 방향 제시
- model 선택 질문: Nano Banana 2 vs Pro

**사용자:**
> 기본 모델은 3.1-flash, aspectRatio는 16:9, output은 ok.

**Cocrates:**
- 최종 Image YAML 스키마 확정:

```yaml
type: image
model: gemini-3.1-flash-image
params:
  prompt: |
    Take the blue floral dress from the first image
    and let the woman from the second image wear it.
  images:
    - path: "./references/dress.jpg"
    - path: "./references/woman.png"
  size: 1K
  aspectRatio: "16:9"
  seed: null
output: "./output/result.png"
```

- 필드별 기본값 확정:
  - `model`: `gemini-3.1-flash-image`
  - `aspectRatio`: `"16:9"`
  - `size`: `"1K"`
  - `output`: 자동 파일명 생성

---

## 13. Video 생성 파라미터 설계

**사용자:**
> video도 거의 동일한 포맷으로 결정될 것 같다.

**Cocrates:**
- Veo 3.1 API 문서 조사
- Image vs Video 파라미터 비교표 제시:
  - 공통: `prompt`, `images`, `aspectRatio`, `seed`
  - Video 고유: `durationSeconds`, `resolution`
  - Video 제한: `aspectRatio` 2종 (`16:9`, `9:16`), 참조 이미지 최대 3개

- Video YAML 스키마 제시:

```yaml
type: video
model: veo-3.1-generate-preview
params:
  prompt: |
    A woman wearing a blue floral dress
    walks through a sunlit garden.
  images:
    - path: "./references/dress.jpg"
    - path: "./references/woman.png"
  durationSeconds: 8
  resolution: 720p
  aspectRatio: "16:9"
  seed: null
output: "./output/result.mp4"
```

- `personGeneration` 파라미터 설명:
  - 값: `dont_allow`, `allow_adult` (기본), `allow_all`
  - 지역 제한: EU/UK/CH/MENA에서 `allow_all` 미지원
  - Video mode별 제한: 텍스트→영상=`allow_all`, 이미지→영상=`allow_adult`만

---

## 14. personGeneration 및 스키마 정리

**사용자:**
> personGeneration은 굳이 노출할 필요 없어 보이네.

**Cocrates:**
- `personGeneration` 내부 고정 (`allow_adult`) 또는 미전달 결정 제시

**사용자:**
> personGeneration 값은 사용하지 않는 것으로 하자. 구글에서 제공하는 기본값으로.

**Cocrates:**
- `personGeneration` 파라미터에서 완전 제외, Google API 기본값에 위임

---

## 15. ASR 업데이트 및 Spec 생성

**사용자:**
> spec 생성해줘.

**Cocrates:**
- spec-writing, todo 스킬 로드
- Step 4 (Spec Creation) 진입
- 승인된 ADR 결정 사항 심층 복사 (Deep-Copy):
  - `adr/mcp-transport.md` → stdio 전용 결정
  - `adr/gemini-client-lifecycle.md` → 싱글톤 결정
- Image/Video YAML 스키마를 Spec에 통합
- `spec/google-genai-mcp.md` 작성:
  - Requirement, Context, Decisions (17개 ASR)
  - Image/Video 요청 파일 스키마 (파라미터 상세)
  - Requirements (MCP 서버, CLI, 요청 파일 처리, 출력 관리, 인증)
  - Constraints, Out of Scope
- `spec/ASR.md` 업데이트: 16개 ASR `designed` → `approved`, Summary 테이블에 Spec 경로 기록
- `TODO.md` 업데이트: T-005 완료, T-005b (Spec 승인) 생성

---

## 16. Audio(TTS) 생성 기능 추가

**사용자:**
> https://ai.google.dev/gemini-api/docs/speech-generation 를 검토하고, 오디오 생성 기능도 추가해줘.

**Cocrates:**
- Gemini TTS 문서 조사
- 모델 분석:
  - `gemini-3.1-flash-tts-preview` (최신, 오디오 태그)
  - `gemini-2.5-flash-tts` (안정적)
  - `gemini-2.5-pro-tts` (고품질)
- 30종 음성 옵션 확인 (Kore, Puck, Zephyr, Charon 등)
- 다중 화자 지원 확인 (최대 2명)
- 인라인 오디오 태그: `[whisper]`, `[slowly]`, `[excited]` 등
- Audio YAML 스키마를 Spec에 추가:

```yaml
type: audio
model: gemini-3.1-flash-tts-preview
params:
  text: |
    Joe: How's it going today, Jane?
    Jane: Not too bad, how about you?
  speakers:
    - name: Joe
      voice: Kore
    - name: Jane
      voice: Puck
  outputFormat: wav
output: "./output/dialogue.wav"
```

- ASR-018 (Audio/TTS 생성 지원) 신규 추가 및 `approved` 처리
- PRD, Context, Decisions, Requirements, Tags 업데이트

**사용자:**
> 복수의 speaker에 대한 정의가 필요해 보임. 각각의 speaker는 name, voice를 속성으로 가짐. 단일 speaker인 경우에는 name이 필요없지만, 복수인 경우에는 구별을 위해서 필요함.

**Cocrates:**
- Audio 스키마 업데이트:
  - **단일 화자:** `voice`만 지정. `name` 불필요.
  - **복수 화자:** `speakers` 배열, 각 항목에 `name` + `voice` 필수.
- 화자 규칙 명시:
  - `speakers[].name`은 `params.text` 내의 화자 접두사와 정확히 일치
  - `speakers`와 `params.voice` 동시 지정 시 `speakers` 우선

---

## 17. gemini-mcp 참조 구조 분석

**사용자:**
> https://github.com/RLabs-Inc/gemini-mcp 를 분석해서, docs/ 폴더에 참조 구조로 정리해줘. 어떤 구조로 개발이 되었는지

**Cocrates:**
- gemini-mcp 저장소 전체 분석 (README, package.json, 소스 파일)
- `docs/gemini-mcp-reference.md` 작성
- 핵심 발견:
  - **Dual-Mode Entry:** 단일 `index.ts`에서 CLI/MCP 분기
  - **Tool Group + Preset:** 18개 그룹을 프리셋으로 로딩 제어
  - **싱글톤 클라이언트:** `GoogleGenAI` 인스턴스 1회 생성
  - **Base64 이미지 반환:** MCP tool response에 이미지 데이터 인라인
  - **폴링 기반 비동기:** Video/Deep Research는 operation ID로 상태 폴링
  - ** stderr 로깅:** stdio 환경 보호
- 우리 Spec과의 차이점 정리 (YAML 입력, 이미지 반환 방식, 모델 버전 등)

---

## 18. Dual-Mode Entry 설계 검토 → ADR 작성

**사용자:**
> Dual-Mode Entry에 대해 설계 검토 해줘. 어떤 대안이 있는지?

**Cocrates:**
- ADR 워크플로우 시작
- 4가지 옵션 제시:
  - **Option A:** Single Entry Point (gemini-mcp 패턴)
  - **Option B:** Separate Entry Points (Multi-Bin)
  - **Option C:** CLI-First with MCP Subcommand
  - **Option D:** MCP-First with CLI Binary
- Tradeoffs 테이블 비교 (설치 단순성, 시작 속도, 메모리, 테스트, 확장성)

**사용자:**
> multi-bin이 더 좋은 것 같은데, 에이전트가 사용하는 mcp와 사용자가 사용하는 cli가 동일할 필요는 없음. 단지, 구현되는 기능에서 공유되는 부분에 대한 설계가 필요해 보임.
> 1. multi-bin으로 하고, mcp는 google-genai-mcp로, cli는 gcli가 아니라 gemini로 하자.
> 2. mcp/cli → core module을 어떻게 분리할 것인지, core module이 공유되도록 하려면?

**Cocrates:**
- Option B (Multi-Bin) 채택 확정
- MCP=`google-genai-mcp`, CLI=`gemini` 명명 확정
- Core Module 분리 구조 제안:
  - `src/core/` — 공유 비즈니스 로직 (gemini-client, image, video, audio, output, errors, logger)
  - `src/mcp/` — MCP 서버 전용 (tool 등록, 프로토콜)
  - `src/cli/` — CLI 전용 (명령어, UI)
  - 의존성: `gemini` → `core/` ← `google-genai-mcp` (단방향)
  - 핵심 원칙 4가지: 순수 비즈니스 로직, GoogleGenAI 직접 사용, 결과 타입 통일, MCP tool은 호출만

**사용자:**
> 좋아. 설계 내용을 반영해줘.

**Cocrates:**
- `adr/cli-mcp-entry-point.md` 생성 및 승인
  - Downstream Concerns: Core Module 분리 구조 확정 기록
  - 전체 디렉토리 구조 + 의존성 그래프 + 핵심 원칙 4가지
- `spec/google-genai-mcp.md` 업데이트:
  - CLI 포함 (ASR-002): Multi-Bin 구조 명시
  - 패키징 구조 (ASR-003): bin 필드 2개 명령어 등록
  - **코어 모듈 구조** Decision 신규 추가
  - Constraints: Package 항목에 Multi-Bin 명시
- `spec/ASR.md` 업데이트:
  - ASR-002 Summary: Related ADRs 링크 추가
  - ASR-002 Detail: Resolution path, Resolution 업데이트

---

## 19. CLI 인터페이스 재설계 — 파일 기반 + 인터랙티브 모드

**사용자:**
> spec-driven-generation 스킬을 사용해서, 현재 과제를 검토하고, 다음 내용을 검토해줘.
> CLI 인터페이스를 좀 더 구체적으로 정해보자.
> - image/video/tts 를 생성 요청한다. 파라미터를 구체적으로 정해보자.
> - yaml/json 파일로 산출물에 대해 기술되어 있다. 파일로 생성을 요청한다.

**Cocrates:**
- Step 0 Gate 평가: 모든 Gate 통과 → Step 5 (코드 생성) 진입 가능 상태 확인
- 현재 Spec 분석: CLI 파라미터 명세 부족 영역 식별
  - Image/Video/Audio CLI 인라인 파라미터 미정
  - 출력 파일 명세 미정
  - PRD와의 정합성 이슈 (위치 인자 vs 옵션)
- 핵심 질문 3가지 제시: CLI 파라미터 노출 범위, Prompt 입력 방식, 참조 이미지 CLI 입력

**사용자:**
> CLI는 file로 생성하는 것으로 하자. 파라미터로 생성할 수도 있지만, 사용자에게 불편할 듯.
> 1. gemini \<file1\> \<file2\> ... 이렇게 명령하면, \<file1\> \<file2\>에 명시된 산출물을 생성한다.
> 2. gemini 라고 파라미터 없이 입력하면, 이전 interactions에 대해서 추가적으로 요청할 수 있다.
> 3. 나중에 CLI가 아니라 GUI나 웹 UI도 제공할 수 있을 것 같다.

**Cocrates:**
- 설계 분석:
  - **파일 기반 단일 명령어:** 서브커맨드 제거, YAML `type` 필드로 분기
  - **인터랙티브 모드:** `/list`, `/select`, 텍스트 입력으로 대화 이어가기
  - **GUI/Web UI 확장성:** core/ 모듈 분리로 동일한 비즈니스 로직 재사용 가능
- ASR 영향 분석: ASR-002, ASR-013 수정 + ASR-019~021 신규 후보

---

## 20. Interactions API 기반 Interaction 관리

**사용자:**
> 일단 google interactions api에서 list, previous_interaction_id 를 사용해서 이전 대화를 이어가는 것으로 할 수 있을 것 같은데...

**Cocrates:**
- Interactions API 기반 설계 분석:
  - **서버 측 상태 관리:** `previous_interaction_id`로 대화 이어가기 — 원본 파라미터 재전송 불필요
  - **`list()` API:** 이전 interaction 목록 조회 가능
  - **로컬 저장소 축소:** 전체 상태는 서버가 관리, 로컬에는 매핑 정보만
- 로컬 메타데이터 스키마 제안: `interactionId`, `requestFile`, `tmpFile`
- 저장 구조 제안: `~/.local/share/google-genai-mcp/interactions.json` + `tmp/{hash}.yaml`

**사용자:**
> 인터랙티브 모드에서... interactions api 명세에 보면, 이전 대화 이력은 서버에서 유지되기 때문에 원본 파라미터 등을 다시 줄 필요는 없음. 그런데, 사용자가 알고 싶어할 수도 있으니까. 연결해 두는 것이 좋을 것 같음.

**Cocrates:**
- Multi-turn 편집 흐름 정제:
  - 서버가 전체 컨텍스트 유지 — `previous_interaction_id`만 전달
  - tmpFile은 사용자 참고용 — 원본 요청 확인, 수정 시 참조
  - `/show` 명령어 추가 제안

**사용자:**
> interactions.json에 type, prompt, output, model 등은 yaml 파일에 존재하므로 중복 저장하지는 말자. 그리고, serverId가 아니라 interactionID 이고, parentInteractionId는 필요없다. interaction 단위로 관리한다.

**Cocrates:**
- interactions.json 스키마 정제:
  - 중복 제거: 서버 메타데이터(타입, 프롬프트, 상태 등)는 `list()` API에서 조회
  - 로컬에는 `interactionId`, `requestFile`, `tmpFile`만 저장
  - `parentInteractionId` 제거 — 각 interaction은 독립 단위
- `/list` 동작: 서버 `list()` + 로컬 cross-reference
- ASR.md 업데이트:
  - ASR-002: CLI 포함 여부 → CLI 구조 및 인터랙티브 모드 (수정)
  - ASR-013: 파일 기반 입력 지원 (수정 — CLI 파일만 입력 가능)
  - ASR-019: Interaction 메타데이터 관리 (신규)
  - ASR-020: 인터랙티브 세션 관리 (신규)
  - ASR-021: Multi-turn 편집 (신규)
  - Dependency Order 업데이트 (21개)
- Spec 업데이트 (`spec/google-genai-mcp.md`):
  - Decisions: ASR-002, ASR-013 변경 + ASR-019~021 추가
  - Requirements: CLI 파일 기반, 인터랙티브 모드, Interaction 관리
  - 로컬 저장 구조: `interactions.json` 스키마, `tmp/` 디렉토리
  - Context: Interactions API 언급 추가
- TODO.md 업데이트: T-005c 완료

---

## 21. MCP 도구 재설계

**사용자:**
> 일단 MCP 쪽도 동일한 맥락으로 수정하자. generate() 함수에 file로 생성을 요청한다. interaction_id를 반환해서, interaction_id로 상태를 체크하거나 대화를 이어갈 수 있도록 한다. list interactions 도구를 제공한다.

**Cocrates:**
- MCP 도구 재설계:
  - `generate_image`/`generate_video`/`generate_audio` → `generate` (단일 도구)
  - `filePath` 입력, `interactionId` 반환
  - 신규 도구: `get_interaction`, `continue_interaction`, `list_interactions`
- Spec 업데이트:
  - Decisions: MCP 도구 구조 변경
  - Requirements: MCP 서버 도구 목록 업데이트
  - ASR-002, ASR-013 Resolution에 MCP 도구 변경 반영

**사용자:**
> file에 type이 있는데, generate_image, video, audio 함수를 나눌 필요가 있을까?

**Cocrates:**
- 단일 `generate` 도구로 통합:
  - YAML `type` 필드에 따라 image/video/audio 자동 분기
  - CLI `gemini <files...>`와 동일한 철학
  - MCP 도구 수 6개 → 4개로 축소
- Spec, ASR, TODO 업데이트 완료

---

## 22. Interactions API list 제한 발견 및 대안 결정

**사용자:**
> interactions api를 확인해서 interactions 목록을 어떻게 가져올 수 있는지 알아봐줘.

**Cocrates:**
- Interactions API 조사:
  - SDK 메서드: `create()`, `get(id)`, `cancel(id)`, `delete(id)`
  - **`list()` 메서드 미지원** — REST API에도 공개 list 엔드포인트 없음
  - AI Studio UI에서만 logs 페이지로 확인 가능
- 대안 3가지 제시:
  - **옵션 A:** 로컬 interactions.json 기반 (추천)
  - **옵션 B:** AI Studio 로그 페이지 참조
  - **옵션 C:** REST API 직접 호출 (비공식)

**사용자:**
> 좋아 옵션 A로 가자. 로컬 목록으로 보여주고, get(id)로 확인하는 것으로.

**Cocrates:**
- 설계 업데이트:
  - `/list`: 로컬 interactions.json 기반, 각 항목 상태는 서버 `get(id)`로 확인
  - `list_interactions` (MCP): 로컬 기반, 서버 list API 미지원 명시
  - Interactions API 문서: SDK 제한사항 섹션 추가
- 제약사항 명시:
  - 우리 CLI/MCP에서 생성한 interaction만 로컬 목록에 표시
  - 다른 클라이언트에서 생성한 interaction은 AI Studio에서 확인

