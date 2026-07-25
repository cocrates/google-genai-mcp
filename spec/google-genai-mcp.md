# google-genai-mcp

## Requirement

Google Gemini API의 Image / Video / Speech(TTS) / Music 생성 기능을 MCP 서버와 CLI로 제공하여, AI 에이전트와 개발자가 YAML 요청 파일로 손쉽게 멀티미디어를 생성할 수 있는 단일 TypeScript 패키지.

## Context

- Gemini API는 Nano Banana (Image), Gemini Omni Flash (Video), Gemini TTS (Speech), Lyria 3 (Music)를 통해 고품질 멀티미디어 생성 지원
- Interactions API(GA, 2026-06~)가 서버 측 상태 관리, 백그라운드 실행, 대화 이력 유지 제공
- MCP(Model Context Protocol)를 통해 에이전트(OpenCode, Claude Desktop 등)가 도구로 직접 호출 가능
- YAML 파일 기반 입력으로 복잡한 생성 파라미터를 선언적으로 관리
- PRD: `spec/PRD.md`

## Decisions

### MCP 전송 (ASR-001)
- **stdio 전용** — 로컬 프로세스 기반, stdin/stdout으로 JSON-RPC 통신
- 네트워크 포트 미사용, 프로세스 생명주기는 MCP 클라이언트가 관리
- 향후 HTTP/SSE 확장 가능 (환경변수로 전환)

### CLI 포함 (ASR-002)
- CLI + MCP 둘 다 제공
- **Multi-Bin 구조** — MCP와 CLI를 별도 진입점으로 분리
- CLI: `gemini <files...>` 파일 기반 단일 명령어 + `gemini` 인터랙티브 모드 (멀티 파일·glob OK)
- MCP: `generate` — **요청 파일 1개만** (`filePath`). 여러 건은 클라이언트가 다중/병렬 호출
- MCP: `generate` 응답: **`interactionId` + `files`** (동기면 저장 경로 포함, 비동기는 `files: []`)
- MCP: `download` / `get_interaction` / `continue_interaction` / `list_interactions` / `sync_interactions`
- MCP: `cancel_interaction` / `delete_interaction`

### 패키징 구조 (ASR-003)
- 단일 패키지 `google-genai-mcp`로 배포
- npm `bin` 필드에 2개 명령어 등록:
  - `google-genai-mcp` → MCP 서버 (`src/mcp/index.ts`)
  - `gemini` → CLI (`src/cli/index.ts`)

### 코어 모듈 구조 (ASR-002 파생)
- `src/core/` — MCP와 CLI가 공유하는 비즈니스 로직
- `src/mcp/` — MCP 서버 전용 (tool 등록, 프로토콜 처리)
- `src/cli/` — CLI 전용 (명령어 라우팅, 터미널 UI)
- **의존성:** `gemini` (CLI) → `core/` ← `google-genai-mcp` (MCP) (단방향)
- **핵심 원칙:**
  1. `core/`는 순수 비즈니스 로직 (MCP 프로토콜, CLI 인자 파싱, UI 없음)
  2. `core/`는 `GoogleGenAI`를 직접 사용
  3. 결과 타입 통일 (`GeneratedFile` 등 공유 타입)
  4. MCP tool은 `core/`를 호출만 (입력 변환 → core 호출 → MCP 응답 포맷팅)

### MVP 기능 범위 (ASR-004)
- **In Scope:** Image (Nano Banana), Video (Gemini Omni Flash), Speech (Gemini TTS), Music (Lyria 3)
- **Out of Scope:** 텍스트 생성, 코드 생성, 임베딩, 멀티모달 분석, HTTP(SSE) 전송

### Gemini API 클라이언트 생명주기 (ASR-005)
- **싱글톤** — 애플리케이션 시작 시 1회 생성, 전역 공유
- stdio 환경에서는 프로세스 격리로 동시성 문제 없음
- HTTP/SSE 확장 시 연결 풀/워커 모델 추가 검토
- API 키 변경은 프로세스 재시작으로 해결
- 인증: 환경변수 **`GEMINI_API_KEY`만** 사용 (Google 문서와 동일). `GOOGLE_API_KEY`는 미사용

### 바이너리 출력 처리 (ASR-006)
- 산출물은 로컬 파일로 저장. base64 인라인 미사용
- **`generate` 응답:** 항상 `{ interactionId, files, background }`
  - **동기 (`background=false`):** 로컬 저장 완료 후 `files`에 경로 포함
  - **비동기 (`background=true`):** `files: []` — 산출물 저장은 `download`로 수행 (`download`도 경로 반환)
- MCP `generate`는 **단일 `filePath`만** 허용
- MCP `download` / CLI 동등 인터페이스로 서버 산출물을 로컬에 저장
- **`download` 오류(미완료·실패·없음 등)는 즉시 tool/CLI 에러** — 대기·재시도 없음

### 오류 처리 (ASR-007)
- 입력 오류: 즉시 실패
- 인증 오류: 즉시 실패
- Rate limit: 지수 백오프 최대 3회
- 서비스 오류: 지수 백오프 최대 2회
- Quota 초과: 즉시 실패
- MCP: tool error 응답
- CLI: stderr + exit code (0:성공, 1:일반, 2:입력, 3:인증, 4:API)

### 로깅 (ASR-008)
- 데이터 루트는 **사용자 홈 기준** OS별 경로 (아래 "데이터 디렉터리")
- 로그: `{dataDir}/logs/{date}.log`, 설정: `{dataDir}/config.json`
- **MVP config 스키마(최소):** `{ "logLevel": "debug" | "info" | "warn" | "error" }` — 이후 필요 시 필드 추가
- 기본 quiet, `--verbose` 또는 `LOG_LEVEL=debug` 시 로그 생성

### 테스트 전략 (ASR-009)
- 단위 테스트: Gemini API mocking, 유틸리티
- 통합 테스트: MCP 서버 → tool call → 응답
- 커버리지 목표: 90%+
- 테스트 프레임워크: vitest

### Node.js 호환성 (ASR-010)
- Node.js 18+ LTS (`engines` 필드 명시)
- 필수 의존성: `@modelcontextprotocol/sdk`, `@google/genai`
- 바이너리 의존성 배제

### 비디오 생성 시간 초과 (ASR-011)
- 모든 타입 기본 `background=false` (동기 대기). 장시간 작업은 YAML/`background: true`로 비동기
- 비동기 시 `interactionId` 즉시 반환, 완료 후 `download`로 로컬 저장
- CLI 동기 대기 시: progress 표시 (poll 간격 10초). **최대 대기 시간 제한 없음** — 사용자가 Ctrl-C로 중단

### TypeScript 타입 안전성 (ASR-012)
- 외부 노출은 MCP tool input/output schema만
- Gemini SDK 응답은 내부 변환 레이어를 통해 MCP 타입으로 변환

### 파일 기반 입력 지원 (ASR-013)
- CLI는 파일 기반만 지원 — `gemini <file1> <file2> ...`
- 인라인 파라미터 미지원, 모든 파라미터는 YAML/JSON 파일에 기술
- glob 패턴 지원 (`gemini aa/*.yaml bb/*.yaml`)
- MCP: `generate` — **단일 요청 파일**, 응답 `{ interactionId, files, background }`. YAML `type` 자동 분기
- MCP: `download` / `get_interaction` / `continue_interaction` / `list_interactions` / `sync_interactions` / `cancel_interaction` / `delete_interaction`
- **상대 경로 기준 (YAML에 명시된 경로):** 요청 YAML/JSON 파일이 있는 디렉터리 (`dirname(requestFile)`)
  - `params.images[].path`, `output`, `download`의 상대 `filePath` 모두 동일 기준
- 상세 스키마는 아래 "Image/Video/Speech/Music 요청 파일 스키마" 참조

### API 이중 체계 (ASR-014)
- 기본 Interactions API 사용 (단일 생성)
- Batch API는 향후 확장 시 MVP 미포함

### 산출물 보관 (ASR-015)
- **동기:** `generate` 완료 시 로컬 파일 자동 저장
- **비동기:** `download` 호출 시 로컬 파일 저장
- 서버 보관은 Gemini API 기본 동작 (55일) 유지

### 출력 파일 위치 (ASR-016)
- 출력 경로 결정 우선순위: `download`의 `filePath` 인자 > YAML `output` > 자동 파일명 (`{type}_{timestamp}_{hash}.{ext}`)
- YAML에 명시된 상대 `output` / `filePath`: 요청 파일 디렉터리 기준
- **자동 파일명 저장 위치:**
  - CLI: 프로세스 **CWD**
  - MCP: **workspace 디렉터리** (MCP 서버 `process.cwd()`, 클라이언트가 설정한 작업 공간)
- 출력 디렉터리 자동 생성
- **덮어쓰기:**
  - MCP: 대상 파일이 있으면 **overwrite**
  - CLI: 대상 파일이 있으면 **사용자에게 확인** 후 결정 (비대화형/TTY 없으면 실패 — `--force`로 덮어쓰기)

### 백그라운드 실행 (ASR-017)
- **기본값:** image / video / speech / music 모두 `background=false` (동기)
- Music Pro(장편) 등 장시간은 YAML에서 `background=true` 권장
- **오버라이드:** YAML 최상위 `background` (요청 파일 = 소스 오브 트루스). MCP `background` 파라미터는 YAML에 없을 때만 적용
- **유효값 계산:** `yaml.background ?? mcp.background ?? false`
- CLI는 YAML의 `background`를 따름 (별도 `--background` 플래그 없음)

### Speech(TTS) 생성 (ASR-018)
- Gemini TTS (`gemini-3.1-flash-tts-preview` 등) + Interactions API
- 단일 화자 및 다중 화자(최대 2명), 30종 음성
- 인라인 오디오 태그로 톤/속도 제어 (`[whisper]`, `[slowly]` 등)
- 텍스트 전용 입력 → 오디오 전용 출력 ([Speech generation](https://ai.google.dev/gemini-api/docs/speech-generation))

### 장문 Speech 분할·병합 (ASR-022)

**분할 발동 조건**
- `params.text`의 **낭독 본문(TRANSCRIPT)** 이 **4,000 bytes(UTF-8) 초과**일 때만 분할. 이하면 기존과 동일하게 단일 요청
- 판정 기준은 문자수가 아닌 **바이트 수** (Cloud TTS 문서의 text field 제한 4,000 bytes와 정합)

**프리앰블 분리**
- `#### TRANSCRIPT` 마커가 있으면 그 **이전 전체를 스타일 프리앰블**(`# SPEECH SYNTHESIS`, `AUDIO PROFILE`, `DIRECTOR'S NOTES` 등), **이후를 낭독 본문**으로 분리
- 마커가 없으면 전체를 낭독 본문으로 취급하고 프리앰블은 빈 문자열
- 프리앰블은 낭독 대상이 아니므로 **모든 청크 요청에 원문 그대로 재부착**. 임계값 판정에는 포함하지 않음

**청크 경계 규칙**
- 1차 경계: **문단** — 낭독 본문을 빈 줄(연속 개행)로 분할
- 2차 경계: 한 문단이 **1,500 bytes 초과**면 그 문단만 **문장 단위로 재분할** (`.`, `?`, `!`, `。` 및 개행 기준)
- 짧은 인접 문단끼리 **병합하지 않음** (경계는 작성자 의도를 따름)
- 문장 재분할 후에도 1,500 bytes를 넘는 단일 문장은 그대로 한 청크로 보냄
- 화자 접두사(`수아:` 등)를 포함한 줄은 접두사째로 청크에 유지

**병합**
- 청크 오디오(L16 PCM)를 순서대로 그대로 concat 후 **단일 WAV 헤더로 래핑**하여 `output` 경로에 저장 (24kHz / 16-bit / mono)
- **청크 사이에 무음을 삽입하지 않음** — 각 청크 오디오가 이미 앞뒤 무음을 포함하므로 추가 간격은 불필요하고 어색한 공백을 만듦
- 최종 산출물은 **1개 파일**. 중간 청크 파일은 사용자 산출물이 아님

**실패 처리 및 재시도 (ASR-007 확장)**
- 청크마다 기존 오류 분류·백오프를 적용: rate limit 최대 3회, 일시적 서비스 오류(5xx) 최대 2회, 지수 백오프
- **재시도하지 않고 즉시 전체 중단:** 인증 실패, quota 초과 (남은 청크도 반드시 실패하므로 N배 시도 금지)
- **재시도하지 않고 중단:** 입력 오류 400 (`PROHIBITED_CONTENT` 등 프롬프트 분류기 차단 포함). 동일 텍스트 재시도는 무의미
- 실패 시 **부분 `.wav`를 저장하지 않음**. 실패를 무음으로 대체해 계속 진행하지 않음
- 실패 보고에 **청크 인덱스(`3/27`), 해당 청크 원문 발췌, 오류 분류**를 포함

**부분 캐시 및 Resume**
- 성공한 청크의 PCM을 `{dataDir}/chunks/{requestHash}/{NNN}.pcm`에 보존
- `{requestHash}`는 **model + voice/speakers + outputFormat + 프리앰블 + 낭독 본문 전체 + 경계 규칙 버전**의 해시. `{NNN}`은 0부터의 청크 순번
- 재실행 시 **자동으로** 캐시된 청크를 재사용하고 없는 청크만 API 호출 (별도 플래그 불필요)
- **성공적으로 병합·저장하면 해당 `{requestHash}` 캐시 디렉터리를 삭제**
- 실패로 남은 캐시는 **7일 보존 후 정리(GC)**. GC는 speech 생성 진입 시 만료 디렉터리를 제거
- 텍스트·음성·모델·경계 규칙이 바뀌면 해시가 달라져 캐시는 자연히 무효화됨

**적용 범위 및 Interaction 기록**
- 분할·병합·캐시 로직은 **`core`에 위치**하며 **CLI와 MCP 모두 동일하게** 적용
- 청크마다 서버 interaction이 생성되지만 `interactions.json`에는 **대표 1건만 등록** (마지막 청크의 interaction ID)
- 개별 청크 interaction ID는 로그에만 기록. `/list`·`/show`에 N건이 노출되지 않음
- 진행 상황은 `onProgress`로 청크 단위 보고:
  - 시작: `Long-form speech: N chunk(s), transcript B bytes`
  - 청크: `Speech chunk i/N: generating (B bytes) — "excerpt"` / `cache hit — "excerpt"` / `done`
  - 대기 중(동기 poll): `Speech chunk i/N: in_progress`
  - 병합: `Merging N chunk(s) (generated G, cache C)…` → `Long-form speech complete → path`

### Music(Lyria 3) 생성
- Lyria 3 Clip (`lyria-3-clip-preview`) / Pro (`lyria-3-pro-preview`) + Interactions API
- Clip: 30초 고정. Pro: 수분 풀송(프롬프트·타임스탬프로 길이/구조 제어)
- 텍스트 + 이미지(최대 10) → MP3(기본) + 가사/구조 텍스트 ([Music generation](https://ai.google.dev/gemini-api/docs/music-generation))

### `type: audio` 폐기
- 기존 `audio`는 TTS만을 의미했음 → **`speech`로 이전**. 파서는 `audio` 입력 시 오류로 `speech` 안내

### Interaction 메타데이터 관리 (ASR-019)
- `{dataDir}/interactions.json`에 최소한의 매핑 정보 저장
- 서버 메타데이터(타입, 프롬프트, 상태 등)는 중복 저장하지 않음 — 목록은 로컬 기반, 상태는 get(id)로 확인
- 로컬 저장 정보: `interactionId`, `requestFile`(원본 yaml 절대 경로), `tmpFile`(복사본 파일명)
- YAML 요청 파일은 `{dataDir}/tmp/{hash}.yaml`로 복사하여 보관 (사용자 참고용)
- **서버 동기화:**
  - `sync_interactions` / `/sync`: 로컬 목록의 각 ID를 서버에서 조회, 서버에 없으면 로컬 매핑(및 관련 tmp) 삭제
  - `get_interaction`: 서버에 해당 ID가 없으면 로컬 매핑을 삭제하고 not-found 응답

### 인터랙티브 세션 관리 (ASR-020)
- `gemini` 파라미터 없이 실행 시 인터랙티브 세션 시작
- 명령어: `/help`, `/list`, `/select N`, `/show`, `/status`, `/download [path]`, `/sync`, `/cancel`, `/delete [indexes...]`, `/quit`
- 시작 시 가장 최근 interaction(가장 큰 index) 자동 선택. 목록은 **최신순**(높은 index 먼저). index는 1부터 단조 증가하며 변경되지 않음
- `/list`는 로컬 데이터만 (서버 get 없음). index·prev index·requestFile 표시
- `/select` / `/show` / `/status`에서 서버 get_interaction 결과 표시 (사용자에게는 index 중심, interactionId 숨김)
- 텍스트 continue 후 새 interaction을 자동 선택하고 세션 유지
- `/delete`는 `/delete 0 1`처럼 복수 index, 인자 없으면 selected 삭제
- `/help` / `/help <cmd>` 도움말
- `/download`는 MCP `download`와 동일 규칙
- `/sync`는 로컬↔서버 매핑 정리
- `/cancel`은 selected 취소

### Multi-turn 편집 (ASR-021)
- Interactions API `previous_interaction_id` 활용
- 사용자가 `/select N`으로 interaction 선택 후 텍스트 입력
- 서버에 `previous_interaction_id`와 새 텍스트만 전송 — 원본 파라미터 재전송 불필요
- 서버가 이전 컨텍스트를 유지하면서 새 요청 처리
- 새 interaction이 생성되면 로컬 interactions.json에 매핑 추가
- **모달리티 제한 없음** — image/video/speech/music 모두 허용. 미지원 시 API 오류 전달
---

## 로컬 저장 구조

### 데이터 디렉터리 (`dataDir`)

사용자 홈(`os.homedir()`) 기준 OS별 경로:

| OS | `dataDir` |
|----|-----------|
| Linux | `~/.local/share/google-genai-mcp` (`$XDG_DATA_HOME` 있으면 그 아래) |
| macOS | `~/Library/Application Support/google-genai-mcp` |
| Windows | `%USERPROFILE%\AppData\Local\google-genai-mcp` |

### 디렉토리 레이아웃

```
{dataDir}/
├── tmp/                          # 원본 YAML 복사본 (참고용)
│   ├── {hash1}.yaml
│   ├── {hash2}.yaml
│   └── ...
├── chunks/                       # 장문 Speech 청크 PCM 캐시 (미완료 작업분)
│   └── {requestHash}/
│       ├── 000.pcm
│       ├── 001.pcm
│       └── ...
├── interactions.json             # interactionId ↔ 파일 경로 매핑
├── config.json                   # MVP: logLevel
└── logs/
    └── {date}.log
```

- `chunks/`는 내부 작업 캐시로, 성공 병합 시 해당 `{requestHash}` 디렉터리를 삭제하며 실패분은 7일 후 정리된다

### interactions.json 스키마

```jsonc
{
  "version": 1,
  "nextIndex": 3,
  "interactions": [
    {
      "interactionId": "abc123",
      "requestFile": "/abs/path/a.yaml",
      "tmpFile": "a1b2c3.yaml",
      "index": 1,
      "previousIndex": null,
      "previousInteractionId": null,
      "userText": "Generate a cafe scene…"
    },
    {
      "interactionId": "def456",
      "requestFile": "/abs/path/a.yaml",
      "tmpFile": "a1b2c3.yaml",
      "index": 2,
      "previousIndex": 1,
      "previousInteractionId": "abc123",
      "userText": "반지를 추가해줘"
    }
  ]
}
```

- `index`는 1부터 시작하며 단조 증가(`nextIndex`); 삭제 후에도 재사용하지 않음
- `previousIndex`는 continue 직전 턴의 안정적 index (루트는 `null`)
- `userText`는 해당 턴의 사용자 프롬프트(YAML prompt 또는 continue 텍스트). 서버 get이 image 턴에서 input을 생략하는 경우가 있어 로컬에 보관
- 서버 메타데이터(상태, 출력 경로 등)는 중복 저장하지 않음
- 목록 조회는 로컬 interactions.json 기반 (서버 list API 미지원)
- `/list`는 최신순(높은 index 먼저) 정렬하되, 표시되는 숫자는 안정적 `index`
- 각 interaction의 현재 상태는 서버 get(id)로 확인
- `requestFile`은 절대 경로로 저장 — 이후 `download`·상대 경로 해석·`/show`의 기준 디렉터리로 사용
- **동기화:** `sync_interactions` 또는 `get_interaction` 시 서버에 없으면 로컬 항목 삭제

### config.json 스키마 (MVP)

```jsonc
{
  "logLevel": "info"   // "debug" | "info" | "warn" | "error" — 필요 시 필드 추가
}
```

---

## Image/Video/Speech/Music 요청 파일 스키마

### 경로 해석

- 요청 파일 내 상대 경로(`params.images[].path`, `output`)는 **해당 요청 파일의 디렉터리**를 기준으로 해석한다
- 예: `/proj/reqs/gen.yaml`의 `images[].path: "./refs/a.jpg"` → `/proj/reqs/refs/a.jpg`
- `download`의 상대 `filePath`도 동일하게, 해당 interaction의 `requestFile` 디렉터리 기준 (없으면 CLI=CWD / MCP=workspace)
- **`output` 미지정 시 자동 파일명** 저장 위치: CLI = **CWD**, MCP = **workspace** (`process.cwd()`)
- 절대 경로는 그대로 사용

### 덮어쓰기

| 진입점 | 대상 파일 존재 시 |
|--------|-------------------|
| MCP | 덮어쓰기 (overwrite) |
| CLI (TTY) | 사용자에게 확인 후 결정 |
| CLI (비대화형) | 실패. `--force`로 덮어쓰기 |
### 공통 구조

```yaml
type: image | video | speech | music
model: {모델 ID}
background: true | false          # 선택. 미지정 시 타입별 기본값
params:
  {타입별 고유 파라미터}
output: {출력 파일 경로}         # 요청 파일 디렉터리 기준 상대 경로 가능
```

### 공통 파라미터

| 필드 | 필수 | 타입 | 기본값 | 값 |
|------|------|------|--------|-----|
| `type` | ✅ | enum | — | `"image"`, `"video"`, `"speech"`, `"music"` (`"audio"` 폐기) |
| `model` | ❌ | string | 타입별 기본 모델 | 타입별 허용 모델 |
| `background` | ❌ | boolean | `false` (모든 타입) | 동기/비동기 오버라이드 |
| `output` | ❌ | string | 자동 생성 | 출력 파일 경로 (요청 파일 디렉터리 기준) |
### Image 요청

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

#### Image 파라미터

| 필드 | 필수 | 타입 | 기본값 | 값 |
|------|------|------|--------|-----|
| `type` | ✅ | `"image"` | — | `"image"` |
| `model` | ❌ | string | `"gemini-3.1-flash-image"` | `gemini-3.1-flash-image`, `gemini-3-pro-image` |
| `params.prompt` | ✅ | multi-line string | — | 최대 4096자 |
| `params.images` | ❌ | array | `[]` | 최대 19개 (Nano Banana 2: 14객체+5캐릭터) |
| `params.images[].path` | ✅ | string | — | 이미지 파일 경로 (요청 파일 디렉터리 기준) |
| `params.size` | ❌ | enum | `"1K"` | `"0.5K"`, `"1K"`, `"2K"`, `"4K"` |
| `params.aspectRatio` | ❌ | string | `"16:9"` | `"1:1"`, `"3:4"`, `"4:3"`, `"9:16"`, `"16:9"`, `"21:9"` 등 |
| `params.seed` | ❌ | int \| null | `null` | 재현성 시드 |
| `background` | ❌ | boolean | `false` | 공통 파라미터 참조 |
| `output` | ❌ | string | 자동 생성 | 출력 파일 경로 (.png, 요청 파일 디렉터리 기준) |

### Video 요청

```yaml
type: video
model: gemini-omni-flash-preview

params:
  prompt: |
    A woman wearing a blue floral dress
    walks through a sunlit garden.
  images:
    - path: "./references/dress.jpg"
    - path: "./references/woman.png"
  durationSeconds: 8
  aspectRatio: "16:9"
  task: reference_to_video   # optional; inferred from images when omitted
  seed: null

output: "./output/result.mp4"
```

#### Video 파라미터

| 필드 | 필수 | 타입 | 기본값 | 값 |
|------|------|------|--------|-----|
| `type` | ✅ | `"video"` | — | `"video"` |
| `model` | ❌ | string | `"gemini-omni-flash-preview"` | Omni Flash (`gemini-omni-flash-preview`) |
| `params.prompt` | ✅ | multi-line string | — | 장면·카메라·조명 등 상세 기술 |
| `params.images` | ❌ | array | `[]` | 참조 이미지 (최대 10) |
| `params.images[].path` | ✅ | string | — | 이미지 파일 경로 (요청 파일 디렉터리 기준) |
| `params.durationSeconds` | ❌ | number | 모델 기본 | `response_format.duration`로 `"Ns"` 전달 |
| `params.resolution` | ❌ | string | — | 파싱만 함 (Omni video_config에 resolution 필드 없음) |
| `params.aspectRatio` | ❌ | string | `"16:9"` | `"16:9"`, `"9:16"` |
| `params.task` | ❌ | enum | 이미지 수로 추론 | `text_to_video`, `image_to_video`, `reference_to_video`, `edit` |
| `params.seed` | ❌ | int \| null | `null` | 재현성 시드 |
| `background` | ❌ | boolean | `false` | 공통 파라미터 참조 |
| `output` | ❌ | string | 자동 생성 | 출력 파일 경로 (.mp4, 요청 파일 디렉터리 기준) |

### Video 전용 고려사항
- **모델:** Gemini Omni Flash (`gemini-omni-flash-preview`) — Interactions API 네이티브. Veo(`generateVideos`)는 사용하지 않음
- Video 기본은 **동기** (`background=false`). 장시간이면 YAML에서 `background=true` 후 `download`로 저장
- `delivery=uri`로 요청 (대용량 대비). 이후 get/download는 inline/uri 모두 처리
- Conversational editing: `continue_interaction` / 인터랙티브 이어가기로 이전 영상을 자연어 수정 (`previous_interaction_id`)
- `task` 미지정 시: 이미지 0→`text_to_video`, 1→`image_to_video`, 2+→`reference_to_video`

### Speech 요청 (TTS)

출처: [Speech generation](https://ai.google.dev/gemini-api/docs/speech-generation)

#### 단일 화자

```yaml
type: speech
model: gemini-3.1-flash-tts-preview

params:
  text: |
    Say in a spooky whisper:
    "By the pricking of my thumbs...
    Something wicked this way comes"
  voice: Kore
  outputFormat: wav

output: "./output/speech.wav"
```

#### 복수 화자 (최대 2명)

```yaml
type: speech
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

#### Speech 파라미터

| 필드 | 필수 | 타입 | 기본값 | 값 |
|------|------|------|--------|-----|
| `type` | ✅ | `"speech"` | — | `"speech"` |
| `model` | ❌ | string | `"gemini-3.1-flash-tts-preview"` | `gemini-3.1-flash-tts-preview`, `gemini-2.5-flash-preview-tts`, `gemini-2.5-pro-preview-tts` |
| `params.text` | ✅ | multi-line string | — | TTS 변환할 텍스트. 인라인 태그 지원 (`[whisper]`, `[slowly]`, `[excited]` 등) |
| `params.voice` | ❌ | string | `"Kore"` | 단일 화자 음성. `speakers` 사용 시 무시 |
| `params.speakers` | ❌ | array | — | 복수 화자 (최대 2). 지정 시 `voice`보다 우선 |
| `params.speakers[].name` | ✅ | string | — | `params.text`의 화자 접두사와 일치 |
| `params.speakers[].voice` | ✅ | string | — | 해당 화자 음성 (30종) |
| `params.outputFormat` | ❌ | enum | `"wav"` | 로컬 저장 확장자/래핑 힌트. API `response_format`에는 `mime_type`을 보내지 않음 (400). TTS는 보통 PCM → 로컬에서 WAV 헤더 래핑 |
| `background` | ❌ | boolean | `false` | 공통 파라미터 참조 |
| `output` | ❌ | string | 자동 생성 | `.wav` 등 (요청 파일 디렉터리 기준) |

#### 화자 규칙
- **단일 화자:** `voice`만 지정
- **복수 화자:** `speakers`에 `name` + `voice`. `name`은 `text` 내 접두사와 일치
- `speakers`와 `voice` 동시 지정 시 `speakers` 우선

#### 음성 옵션 (30종)

| 음성 | 특성 | 음성 | 특성 | 음성 | 특성 |
|------|------|------|------|------|------|
| Zephyr | Bright | Puck | Upbeat | Charon | Informative |
| Kore | Firm | Fenrir | Excitable | Leda | Youthful |
| Orus | Firm | Aoede | Breezy | Callirrhoe | Easy-going |
| Autonoe | Bright | Enceladus | Breathy | Iapetus | Clear |
| Umbriel | Easy-going | Algieba | Smooth | Despina | Smooth |
| Erinome | Clear | Algenib | Gravelly | Rasalgethi | Informative |
| Laomedeia | Upbeat | Achernar | Soft | Alnilam | Firm |
| Schedar | Even | Gacrux | Mature | Pulcherrima | Forward |
| Achird | Friendly | Zubenelgenubi | Casual | Vindemiatrix | Gentle |
| Sadachbia | Lively | Sadaltager | Knowledgeable | Sulafat | Warm |

#### Speech 전용 고려사항
- **기본 동기** (`background=false`)
- Interactions: `response_format.type=audio` + `generation_config.speech_config`
- 이미지/영상 입력 불가 (텍스트 only)
- **장문 자동 분할:** 낭독 본문이 4,000 bytes를 넘으면 문단(1,500 bytes 초과 시 문장) 단위로 나눠 순차 생성하고 그대로 이어붙여 단일 WAV로 병합 (청크 자체 앞뒤 무음으로 충분, 별도 간격 삽입 없음) — "장문 Speech 분할·병합 (ASR-022)" 참조
- 모델은 수 분 초과 출력에서 품질·일관성이 저하되므로 장문은 분할이 기본 동작

### Music 요청 (Lyria 3)

출처: [Music generation](https://ai.google.dev/gemini-api/docs/music-generation)

#### 텍스트 → 클립 (30초)

```yaml
type: music
model: lyria-3-clip-preview

params:
  prompt: |
    A short instrumental acoustic guitar piece.
    Warm, intimate, fingerpicked. No vocals.
  outputFormat: mp3

output: "./output/guitar-clip.mp3"
```

#### 풀송 + 커스텀 가사 (Pro)

```yaml
type: music
model: lyria-3-pro-preview

params:
  prompt: |
    Dreamy indie pop, mid-tempo, soft synths and acoustic guitar.
    Create a 2-minute song with verse / chorus / bridge.
  lyrics: |
    [Verse 1]
    Walking through the neon glow,
    city lights reflect below.

    [Chorus]
    We are the echoes in the night,
    burning brighter than the light.
  outputFormat: mp3
  lyricsOutput: "./output/echoes.lyrics.txt"

output: "./output/echoes.mp3"
```

#### 이미지 영감 + 타임라인 구조 (Pro)

```yaml
type: music
model: lyria-3-pro-preview
background: true

params:
  prompt: |
    An atmospheric ambient track inspired by the mood and colors
    in the reference images. Instrumental only.

    [0:00 - 0:20] Soft pads and distant piano
    [0:20 - 1:00] Add sparse percussion and rising strings
    [1:00 - 1:30] Peak, then fade to piano alone
  images:
    - path: "./refs/desert-sunset.jpg"
    - path: "./refs/city-night.png"
  outputFormat: mp3

output: "./output/ambient.mp3"
```

#### Music 파라미터

| 필드 | 필수 | 타입 | 기본값 | 값 |
|------|------|------|--------|-----|
| `type` | ✅ | `"music"` | — | `"music"` |
| `model` | ❌ | string | `"lyria-3-clip-preview"` | `lyria-3-clip-preview` (30s), `lyria-3-pro-preview` (풀송) |
| `params.prompt` | ✅ | multi-line string | — | 장르·분위기·악기·길이·구조. 타임스탬프/`[Verse]` 등 프롬프트 내 기술 가능 |
| `params.lyrics` | ❌ | multi-line string | — | 커스텀 가사. 있으면 API `input` 텍스트에 prompt와 합성해 전달 |
| `params.images` | ❌ | array | `[]` | 영감 이미지 최대 **10** |
| `params.images[].path` | ✅ | string | — | 요청 파일 디렉터리 기준 |
| `params.outputFormat` | ❌ | enum | `"mp3"` | 로컬 저장 힌트. API에는 `response_format: { type: "audio" }`만 전송 (기본 MP3). Pro WAV는 응답 mime에 따름 |
| `params.lyricsOutput` | ❌ | string | — | 응답 `output_text`(생성 가사/구조) 저장 경로. 미지정 시 저장 안 함 |
| `background` | ❌ | boolean | `false` | Pro 장편은 `true` 권장 |
| `output` | ❌ | string | 자동 생성 | `.mp3`/`.wav` (요청 파일 디렉터리 기준) |

#### `prompt` + `lyrics` 합성 규칙
- `lyrics` 없으면 `prompt`만 API `input` 텍스트로 사용
- `lyrics` 있으면 대략 다음 형태로 합침 (구현 시 동일 규칙):

```
{prompt}

Use the following lyrics and section tags:

{lyrics}
```

- 가사를 prompt 안에 직접 넣어도 됨 (`lyrics`는 선택적 편의 필드)

#### Music 전용 고려사항
- **Clip:** 항상 ~30초, MP3. **Pro:** 수분, 프롬프트로 길이 조절
- 응답에 오디오 + 가사/구조 텍스트가 함께 올 수 있음 → `lyricsOutput`으로 텍스트 보존
- 출력은 44.1 kHz stereo
- Lyria RealTime(스트리밍)은 범위 밖 (별도 API)

### `type: audio` (폐기)
- 파서 오류 예: `type "audio" is removed; use type: speech for TTS (Gemini) or type: music for Lyria 3`

---

## Requirements

### MCP 서버
- stdio 기반 JSON-RPC 서버로 동작
- `generate` tool: **단일** YAML/JSON `filePath`만 허용 (여러 파일은 클라이언트가 다중/병렬 호출). YAML `type`으로 image/video/speech/music 분기
  - **응답:** `{ interactionId, files, background }` — 동기면 `files`에 저장 경로, 비동기는 `files: []`
  - `background=false`(동기): 로컬 파일 저장까지 완료한 뒤 반환
  - `background=true`(비동기): 즉시 반환 — 산출물은 `download`로 저장
  - 선택 파라미터 `background`: YAML에 `background`가 없을 때만 타입 기본값을 덮어씀
  - 출력 파일 존재 시 **overwrite**
- `download` tool: 완료된 interaction 산출물을 로컬에 저장
  - 입력: `interactionId` (필수), `filePath` (선택)
  - `filePath` 미지정 시: YAML `output` → 없으면 자동 파일명 (저장 위치: workspace)
  - 상대 `filePath`는 해당 interaction의 `requestFile` 디렉터리 기준
  - 출력: 저장된 로컬 파일 경로 (`files`)
  - **미완료·실패·없음 등 오류 시 즉시 에러** (대기·폴링 없음)
  - 대상 파일 존재 시 **overwrite**
- `get_interaction` tool: `interactionId`로 상태 조회. **필수 응답 필드**는 아래 스키마. 서버에 없으면 로컬 매핑 삭제 후 not-found
- `continue_interaction` tool: `interactionId` + 텍스트로 이어가기. image/video/speech/music **모달리티 제한 없음** (미지원 시 API 오류 전달)
- `list_interactions` tool: 로컬 interactions.json 기반 목록. 각 항목 상태는 서버 get(id)로 확인
- `sync_interactions` tool: 로컬 목록을 서버와 맞춤 — 서버에 없는 ID는 로컬(및 tmp)에서 제거. 결과: 유지/삭제 건수
- `cancel_interaction` tool: `interactionId`로 서버 실행 취소 (`interactions.cancel`)
- `delete_interaction` tool: `interactionId`로 서버 삭제 (`interactions.delete`) + 로컬 매핑/tmp 제거
- 오류 시 tool error 응답 반환

### `get_interaction` 응답 스키마 (필수)

```jsonc
{
  "interactionId": "abc123",
  "status": "completed",               // in_progress | completed | failed | cancelled | requires_action
  "error": { "message": "..." } | null,
  "exists": true,
  "requestFile": "/abs/path/a.yaml",
  "tmpFile": "a1b2c3.yaml",
  // --- 메타 ---
  "created": "2026-07-23T12:00:00Z",
  "updated": "2026-07-23T12:00:05Z",
  "previousInteractionId": "prev_id" | null,
  "index": 2,                          // 로컬 안정 index (1..)
  "previousIndex": 1,                  // 로컬 직전 턴 index | null
  "userText": "반지를 추가해줘",         // 로컬 보관 사용자 텍스트 | null
  "model": "gemini-3.1-flash-image",
  "usage": { /* token usage */ } | null,
  // --- 이력 / 산출물 (list에서는 생략 가능) ---
  "input": { /* … */ } | null,
  "steps": [ /* user_input, model_output, …; base64 data는 생략 표기 */ ] | null,
  "outputText": "…" | null,
  "outputImage": { /* mime_type, data redacted */ } | null,
  "outputAudio": { /* … */ } | null,
  "outputVideo": { /* … */ } | null
}
```

- `status`, `interactionId`, `exists`는 항상 포함
- `error`는 실패·취소 등 오류 정보가 있을 때 객체, 없으면 `null`
- 서버에 ID가 없으면: `{ interactionId, exists: false, status: null, error: { message: "..." }, … }` 형태로 반환하고 로컬 항목 삭제
- CLI `/show`는 위 interaction 상세 + 로컬 요청 YAML을 함께 표시
- `list_interactions` / `/list`는 부하를 줄이기 위해 steps/input/output_* 생략(`detail: false`)
### `generate` 응답 스키마

```jsonc
{
  "interactionId": "abc123",
  "background": false,
  "files": [                           // 동기: 1개 이상. 비동기: []
    { "filePath": "/abs/out.png", "mimeType": "image/png", "size": 12345 }
  ]
}
```

### CLI
- `gemini <files...>` 명령어로 YAML 파일 기반 생성 (여러 파일 지원, glob 패턴 지원)
- `gemini` 파라미터 없이 실행 시 인터랙티브 세션 시작
- `--verbose` 옵션으로 로그 활성화
- `--force` 옵션: 출력 파일 덮어쓰기 시 확인 생략
- `background`는 YAML(또는 타입 기본값)을 따름 — CLI `--background` 플래그 없음
- 자동 파일명 저장 위치: **CWD**
- 출력 파일 존재 시: TTY면 확인 프롬프트, 비대화형이면 실패 (`--force`로 덮어쓰기)
- 생성 중 progress 표시 (Video·비동기 대기 시 poll 간격 10초). **시간 상한 없음** — Ctrl-C로 중단
- 비동기 완료 후 산출물 저장은 `download`와 동일한 core 로직 사용
- exit code로 결과 상태 전달 (0:성공, 1:일반, 2:입력, 3:인증, 4:API)

### 인터랙티브 모드
- `gemini` 실행 시 인터랙티브 세션 시작 (가장 큰 index 자동 선택)
- 명령어:
  - `/help` / `/help <cmd>` — 도움말
  - `/list` — 로컬만, 최신순. `* [index] prev=[n] file`
  - `/select N` — 선택 + 서버 상태 요약
  - `/show` — 서버 상세(index 중심, interactionId 숨김) + 요청 YAML
  - `/status` — 서버 상세
  - `/download [path]` — 산출물 저장
  - `/sync` — 로컬↔서버 매핑 동기화
  - `/cancel` — selected 취소
  - `/delete [indexes...]` — 복수 index 삭제, 생략 시 selected
  - `/quit` — 종료
- 텍스트 입력 시 continue 후 **새 턴을 자동 선택**하고 세션 유지

### Interaction 관리
- `{dataDir}/interactions.json` — interactionId ↔ 파일 경로 매핑
- `{dataDir}/tmp/{hash}.yaml` — 원본 YAML 요청 파일 복사본 (사용자 참고용)
- YAML 파일 생성 시: 원본을 tmp/로 복사 후 interactions.json에 매핑 저장 (`requestFile`은 절대 경로)
- 인터랙티브 모드에서 생성 시: tmpFile 없이 interactions.json에 매핑 저장
- 목록 조회: 로컬 interactions.json 기반 (서버 list API 미지원). 각 interaction의 상태는 서버 get(id)로 확인
- **동기화:** `sync_interactions` / `/sync`로 일괄 정리. `get_interaction` / `/status` 시 서버 미존재면 해당 로컬 항목 삭제
- **취소/삭제:** `cancel_interaction`은 실행 중 작업 취소, `delete_interaction`은 서버 리소스 + 로컬 매핑 제거

### 요청 파일 처리
- YAML/JSON 파일 파싱 및 검증
- 필수 필드 누락 시 명확한 오류 메시지
- 상대 경로는 **요청 파일 디렉터리** 기준으로 해석
- `images[].path`로 지정된 파일 존재 여부 검증
- 모델별 참조 이미지 수 제한 검증 (Image: 19개, Video: 3개)

### 장문 Speech 처리
- 낭독 본문이 4,000 bytes(UTF-8) 이하면 단일 API 요청으로 처리 (기존 동작 유지)
- 낭독 본문이 4,000 bytes를 초과하면 자동 분할: 문단(빈 줄) 단위 → 1,500 bytes 초과 문단만 문장 단위 재분할
- `#### TRANSCRIPT` 마커 앞의 프리앰블은 임계값 판정에서 제외하고, 모든 청크 요청에 원문 그대로 재부착
- 청크 오디오를 순서대로 그대로 이어붙여 **단일 WAV 파일 1개**로 저장 (청크 사이 무음 삽입 없음 — 각 청크가 이미 앞뒤 무음 포함)
- 병합 결과는 24kHz / 16-bit / mono WAV 헤더를 가진 재생 가능한 파일
- 청크 단위 진행 상황을 `onProgress`로 보고 (시작 요약, `Speech chunk i/N` + generating/cache hit/done, 병합·완료 메시지). CLI는 stdout에 출력
- 청크 실패 시 rate limit 최대 3회, 5xx 최대 2회 지수 백오프 재시도
- 인증 실패 · quota 초과 · 400 입력 오류(`PROHIBITED_CONTENT` 포함)는 재시도 없이 즉시 전체 중단
- 실패 시 부분 `.wav`를 저장하지 않으며, 실패 청크를 무음으로 대체해 진행하지 않음
- 실패 메시지에 청크 인덱스 · 해당 청크 원문 발췌 · 오류 분류를 포함
- 성공한 청크 PCM을 `{dataDir}/chunks/{requestHash}/{NNN}.pcm`에 저장하고, 재실행 시 자동 재사용
- 병합·저장 성공 시 해당 `{requestHash}` 캐시 디렉터리를 삭제
- 7일이 지난 캐시 디렉터리는 speech 생성 진입 시 정리
- 분할·병합·캐시 로직은 `core`에 위치하며 CLI와 MCP 동작이 동일
- `interactions.json`에는 대표 1건(마지막 청크의 interaction ID)만 등록하며, 개별 청크 ID는 로그에만 기록

### 출력 관리
- 동기 `generate`: 결과를 저장 후 `{ interactionId, files, background: false }` 반환
- 비동기 `generate`: `{ interactionId, files: [], background: true }` — `download`로 저장
- `download` 오류는 즉시 실패. 경로 우선순위 — `filePath` 인자 > YAML `output` > 자동 파일명
- 자동 파일명 위치: CLI=CWD, MCP=workspace
- 출력 디렉터리 자동 생성
- 덮어쓰기: MCP=overwrite, CLI=확인(또는 `--force`)

### 인증
- 환경변수 **`GEMINI_API_KEY`** (필수 권장) 또는 Google ADC (Application Default Credentials)
- `GOOGLE_API_KEY`는 사용하지 않음 — `GEMINI_API_KEY`로 통일
- 인증 실패 시 즉시 명확한 오류 메시지

## Constraints

- **Language:** TypeScript (strict 모드)
- **Runtime:** Node.js 18+ LTS
- **Package:** 단일 패키지 `google-genai-mcp` (Multi-Bin: `google-genai-mcp` + `gemini`)
- **Transport:** stdio (MCP)
- **Auth:** `GEMINI_API_KEY` (또는 ADC)
- **Dependencies:** `@modelcontextprotocol/sdk`, `@google/genai` 필수; 바이너리 의존성 배제
- **Linting:** ESLint + Prettier
- **Testing:** vitest, 커버리지 90%+
- **Deployment:** npm 배포 가능

## Out of Scope

- 텍스트 생성 (`generate_text`)
- 코드 생성 (`generate_code`)
- 임베딩 (`get_embedding`)
- 멀티모달 분석 (`analyze_image/video`)
- HTTP(SSE) 전송
- Batch API 지원
- Video 확장/보간 (`video`, `lastFrame` 파라미터)
- `personGeneration` 파라미터 노출 (Google 기본값 사용)
- `negativePrompt` 파라미터 (MVP)
- Google Search grounding (Nano Banana Pro 기능)
- CLI `--background` 플래그 (YAML/`background` MCP 파라미터로만 오버라이드)
- continue_interaction의 모달리티별 사전 차단 (서버 오류에 위임)
## Open Questions

- 없음 (2026-07-23: CLI 대기 무제한+Ctrl-C, MCP generate 단일 파일·ID+files, download 즉시 에러, 음성 30종, dataDir=홈 기준 OS별, PRD 동기화)

## Related

- `spec/PRD.md` — 프로젝트 목표 및 범위
- `adr/mcp-transport.md` — stdio 전용 결정 (approved)
- `adr/gemini-client-lifecycle.md` — 싱글톤 클라이언트 결정 (approved)
- `adr/speech-long-form-chunking.md` — 장문 Speech 분할 방식 결정 (approved)
- `adr/speech-chunk-failure-recovery.md` — 청크 실패 재시도·resume 결정 (approved)

## Tags
`mcp`, `gemini-api`, `image-generation`, `video-generation`, `speech-generation`, `music-generation`, `tts`, `lyria`, `yaml`, `cli`, `interactive-mode`, `multi-turn`, `interactions-api`, `download`, `sync`, `cancel`, `delete`, `long-form-chunking`, `wav-concat`, `chunk-cache`
