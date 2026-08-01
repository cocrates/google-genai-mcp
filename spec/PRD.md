# PRD: google-genai-mcp

> **Project root:** `./`
> **Created:** 2026-07-23
> **Updated:** 2026-07-29
> **Status:** Approved
> **Spec:** `spec/google-genai-mcp.md`

## Goal

Google Gemini API의 Image/Video/Speech/Music **생성**과 image/audio/video **이해(분석)** 기능을 MCP 서버와 CLI로 제공하여, AI 에이전트와 개발자가 멀티미디어를 생성·분석·관리할 수 있는 단일 TypeScript 패키지.

## Target Audience

- **Primary:** AI 에이전트 (OpenCode, Claude Desktop, VS Code 등 MCP 지원 클라이언트)
- **Secondary:** 개발자/사용자 (터미널 CLI)

## Core Function

1. **MCP 서버** (`google-genai-mcp`): stdio JSON-RPC로 생성·분석·interaction 관리 도구 노출
2. **CLI** (`gemini`): `gemini <command> <parameters>` + 무명령 시 인터랙티브 세션
3. **공유 core:** Interactions API 기반 비즈니스 로직 (`src/core/`)

## MVP Scope

### In Scope

- Image 생성 (Nano Banana / Gemini image models)
- Video 생성 (Gemini Omni Flash / Interactions API)
- Speech(TTS) 생성 (Gemini TTS, 단일·다중 화자, 음성 30종)
- Music 생성 (Lyria 3 Clip / Pro)
- **미디어 이해(분석):** MCP `analyze` / CLI `gemini analyze` — image/audio/video 설명·QA·평가 (텍스트 결과)
- MCP stdio 전송
- CLI 통합 커맨드: `generate`, `analyze`, `download`, `list`, `show`, `status`, `sync`, `cancel`, `delete`, `help`
- 인터랙티브 모드 (`/list`, `/select`, `/show`, `/status`, `/download`, `/sync`, `/cancel`, `/delete`, `/help`, `/quit`)
- Interaction 관리: `generate`, `analyze`, `download`, `get_interaction`, `continue_interaction`, `list_interactions`, `sync_interactions`, `cancel_interaction`, `delete_interaction`
- 로컬 매핑 (`interactions.json`) + 서버 sync
- 백그라운드 실행 (생성 타입 기본 `false`; YAML/`background`로 비동기 가능)

### Out of Scope

- 텍스트/코드 생성, 임베딩 (범용 텍스트 챗이 아닌 미디어 이해는 In Scope)
- HTTP(SSE) 전송
- Batch API
- Video 확장/보간, `personGeneration`/`negativePrompt` 노출, Google Search grounding
- CLI `--background` 플래그
- CLI bare `gemini <files>` (반드시 `gemini generate <files…>`)
- CLI 인라인 `continue` (후속 턴은 인터랙티브만)
- analyze YAML `type: analyze` / 서버측 `responseSchema` / `media_resolution` 노출
- `continue_interaction` 모달리티 사전 차단

## Key Product Rules

| 주제 | 규칙 |
|------|------|
| CLI 형태 | `gemini <command> <parameters>`; 명령 없으면 인터랙티브 |
| 생성 입력 | YAML/JSON. CLI `generate`는 멀티·glob, MCP `generate`는 **파일 1개** |
| 분석 입력 | MCP/CLI: `inputs`/`files`에 미디어 경로·URL 및/또는 생성 YAML/JSON(`.yaml`/`.yml`/`.json`, 확장자로 인식) + 선택 `prompt`/`-p` |
| 분석 응답 | `{ interactionId, text }`; 미디어만이면 빈 prompt 취소. 생성 YAML이 있으면 스펙·참조 YAML 포함 체크리스트 |
| 경로 | YAML 내 상대 경로 = 요청 파일 디렉터리 기준. 자동 파일명: CLI=CWD, MCP=workspace |
| 생성 응답 | `generate` → `{ interactionId, files, background }` (비동기 시 `files: []`) |
| download | 미완료·실패 등 **즉시 에러** |
| overwrite | MCP=덮어쓰기, CLI=확인 (`--force`) |
| 인증 | `GEMINI_API_KEY` (또는 ADC). `GOOGLE_API_KEY` 미사용 |
| 데이터 디렉터리 | 사용자 홈 기준 OS별 (`dataDir`) |
| CLI Video 대기 | progress + poll, **시간 상한 없음**, Ctrl-C 중단 |
| help | CLI `help` 문구와 MCP tool description 정합 |

## Constraints

- **Language:** TypeScript (strict)
- **Runtime:** Node.js 18+ LTS
- **Package:** 단일 패키지 `google-genai-mcp` (bins: `google-genai-mcp`, `gemini`)
- **Transport:** stdio (MCP)
- **Dependencies:** `@modelcontextprotocol/sdk`, `@google/genai` (바이너리 의존성 배제)
- **Auth:** `GEMINI_API_KEY` 또는 Google ADC
- **Lint/Test:** ESLint + Prettier, vitest, 커버리지 90%+

## Quality Bar

- TypeScript strict 모드
- ESLint + Prettier
- 단위·통합 테스트 (vitest)
- npm 배포 가능

## Success Criteria

1. MCP 클라이언트가 `generate`(단일 파일)로 image/video/speech/music를 생성하고 `{ interactionId, files }`를 받는다
2. MCP `analyze({ inputs, prompt })`로 미디어를 분석하고 `{ interactionId, text }`를 받으며, `continue_interaction`으로 후속 질문이 가능하다
3. 비동기 생성 결과는 `download`로 저장하고, 오류 시 즉시 실패한다
4. CLI에서 `gemini generate|analyze|…` 및 `gemini` 인터랙티브로 동일 기능을 수행한다
5. `npm install -g google-genai-mcp`로 설치 후 `google-genai-mcp` / `gemini` 사용 가능

## Related

- `spec/google-genai-mcp.md` — 상세 요구사항·스키마·ASR Decisions
- `spec/ASR.md` — 아키텍처적으로 중요한 요구사항
- `adr/` — 전송·클라이언트·analyze·CLI 통합 ADR
