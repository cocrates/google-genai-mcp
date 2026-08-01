# Architecturally Significant Requirements

Living registry for google-genai-mcp. Status of each ASR must stay current.

## Summary

| ID | Title | Category | Status | Related ADRs | Spec |
|----|-------|----------|--------|--------------|------|
| ASR-001 | MCP 전송 방식 | Integration & dependencies | approved | adr/mcp-transport.md | spec/google-genai-mcp.md — Decisions |
| ASR-002 | CLI 구조 및 인터랙티브 모드 | Deliverable form | approved | adr/cli-mcp-entry-point.md, adr/cli-unified-command-surface.md | spec/google-genai-mcp.md — Decisions, Requirements |
| ASR-003 | 패키징 구조 | Structure & organization | approved | — | spec/google-genai-mcp.md — Constraints |
| ASR-004 | MVP 기능 범위 | Scope boundary | approved | — | spec/google-genai-mcp.md — Decisions, Out of Scope |
| ASR-005 | Gemini API 클라이언트 통합 방식 | Integration & dependencies | approved | adr/gemini-client-lifecycle.md | spec/google-genai-mcp.md — Decisions |
| ASR-006 | 바이너리 출력 처리 | Structure & organization | approved | — | spec/google-genai-mcp.md — Decisions |
| ASR-007 | 오류 처리 및 복구 전략 | Quality bar | approved | — | spec/google-genai-mcp.md — Decisions |
| ASR-008 | 로깅 및 관찰 가능성 | Quality bar | approved | — | spec/google-genai-mcp.md — Decisions |
| ASR-009 | 테스트 전략 | Quality bar | approved | — | spec/google-genai-mcp.md — Constraints |
| ASR-010 | Node.js 버전 호환성 및 의존성 관리 | Constraints | approved | — | spec/google-genai-mcp.md — Constraints |
| ASR-011 | 비디오 생성 시간 초과 처리 | Structure & organization | approved | — | spec/google-genai-mcp.md — Decisions |
| ASR-012 | TypeScript 타입 안전성 및 공개 API 경계 | Quality bar | approved | — | spec/google-genai-mcp.md — Decisions |
| ASR-013 | 파일 기반 입력 지원 | Deliverable form | approved | — | spec/google-genai-mcp.md — Requirements, 경로 해석 |
| ASR-019 | Interaction 메타데이터 관리 | Structure & organization | approved | — | spec/google-genai-mcp.md — Interaction 관리 |
| ASR-020 | 인터랙티브 세션 관리 | Deliverable form | approved | — | spec/google-genai-mcp.md — Requirements, Interaction 관리 |
| ASR-021 | Multi-turn 편집 | Structure & organization | approved | — | spec/google-genai-mcp.md — Requirements, Interaction 관리 |
| ASR-014 | API 이중 체계 관리 | Integration & dependencies | approved | — | spec/google-genai-mcp.md — Decisions |
| ASR-015 | 산출물 보관 전략 | Structure & organization | approved | — | spec/google-genai-mcp.md — Decisions |
| ASR-016 | 출력 파일 위치 관리 | Deliverable form | approved | — | spec/google-genai-mcp.md — Decisions, Requirements |
| ASR-017 | 백그라운드 실행 모드 | Structure & organization | approved | — | spec/google-genai-mcp.md — Decisions |
| ASR-018 | Audio(TTS) 생성 지원 | Scope boundary | approved | adr/speech-long-form-chunking.md (approved) | spec/google-genai-mcp.md — Audio 스키마, Requirements |
| ASR-022 | 장문 Speech 분할·병합 전략 | Structure & organization | approved | adr/speech-long-form-chunking.md, adr/speech-chunk-failure-recovery.md | spec/google-genai-mcp.md — 장문 Speech 분할·병합, 장문 Speech 처리 |
| ASR-023 | 미디어 이해(분석) MCP 기능 | Scope boundary | approved | adr/media-understanding-mcp.md | spec/google-genai-mcp.md — Analyze |
| ASR-024 | Analyze 요청·응답 스키마 | Deliverable form | approved | adr/analyze-request-response-schema.md | spec/google-genai-mcp.md — Analyze, Requirements |
| ASR-025 | Analyze 입력·업로드 전략 | Integration & dependencies | approved | adr/analyze-input-upload-strategy.md | spec/google-genai-mcp.md — Analyze |
| ASR-026 | Analyze interaction·모델 기본값 | Structure & organization | approved | adr/analyze-interaction-and-model.md | spec/google-genai-mcp.md — Analyze |
| ASR-027 | Analyze CLI 표면 | Deliverable form | approved | adr/analyze-cli-surface.md, adr/cli-unified-command-surface.md | spec/google-genai-mcp.md — CLI |
| ASR-028 | CLI 통합 커맨드 표면 | Deliverable form | approved | adr/cli-unified-command-surface.md | spec/google-genai-mcp.md — CLI, Decisions |
| ASR-029 | 참조 미디어 필드 명명·검증 | Deliverable form | approved | adr/unified-references-field.md | spec/google-genai-mcp.md — references |

## Dependency Order (recommended review path)

1. ASR-001 (MCP 전송 방식)
2. ASR-002 (CLI 구조 및 인터랙티브 모드)
3. ASR-003 (패키징 구조)
4. ASR-004 (MVP 기능 범위)
5. ASR-005 (Gemini API 클라이언트 통합 방식)
6. ASR-006 (바이너리 출력 처리)
7. ASR-017 (백그라운드 실행 모드)
8. ASR-011 (비디오 생성 시간 초과 처리)
9. ASR-013 (파일 기반 입력 지원)
10. ASR-014 (API 이중 체계 관리)
11. ASR-015 (산출물 보관 전략)
12. ASR-016 (출력 파일 위치 관리)
13. ASR-019 (Interaction 메타데이터 관리)
14. ASR-020 (인터랙티브 세션 관리)
15. ASR-021 (Multi-turn 편집)
16. ASR-007 (오류 처리 및 복구 전략)
17. ASR-012 (TypeScript 타입 안전성 및 공개 API 경계)
18. ASR-008 (로깅 및 관찰 가능성)
19. ASR-010 (Node.js 버전 호환성 및 의존성 관리)
20. ASR-009 (테스트 전략)
21. ASR-018 (Audio(TTS) 생성 지원)
22. ASR-022 (장문 Speech 분할·병합 전략)
23. ASR-023 (미디어 이해(분석) MCP 기능)
24. ASR-024 (Analyze 요청·응답 스키마)
25. ASR-025 (Analyze 입력·업로드 전략)
26. ASR-026 (Analyze interaction·모델 기본값)
27. ASR-027 (Analyze CLI 표면)
28. ASR-028 (CLI 통합 커맨드 표면)
29. ASR-029 (참조 미디어 필드 명명·검증)

## ASR Detail

### ASR-001 — MCP 전송 방식

- **Category:** Integration & dependencies
- **Status:** approved
- **Statement:** MCP 서버의 전송 방식을 stdio, HTTP(SSE), 또는 둘 다 지원으로 결정해야 한다
- **Why it matters:** 전송 방식이 에이전트 호환성, 배포 모델, 사용자 접근 방식에 직접 영향
- **Depends on:** 없음
- **Related ADRs:**
  - `adr/mcp-transport.md` — approved — MCP 전송 방식 비교 분석
- **Resolution path:** adr
- **Resolution:** Option A 채택 — stdio 전용. 로컬 프로세스로 실행하여 stdin/stdout으로 JSON-RPC 통신.
- **Spec:** —
- **Notes:** 사용자가 stdio vs HTTP 차이를 분석 요청

### ASR-002 — CLI 구조 및 인터랙티브 모드

- **Category:** Deliverable form
- **Status:** approved
- **Statement:** CLI 인터페이스의 명령어 구조와 인터랙티브 모드 설계를 결정
- **Why it matters:** CLI가 사용자와 가장 먼저 마주하는 진입점. 명령어 구조가 사용자 경험과 확장성에 직접 영향
- **Depends on:** ASR-001
- **Related ADRs:**
  - `adr/cli-mcp-entry-point.md` — approved — CLI/MCP Entry Point 구조 (Multi-Bin 채택)
  - `adr/cli-unified-command-surface.md` — approved — `gemini <command> <params>` 통합 (ASR-028)
- **Resolution path:** adr
- **Resolution:** `gemini <command> <parameters>`; 명령 없음 → 인터랙티브. `generate`/`analyze`/`download`/`list`/`show`/`status`/`sync`/`cancel`/`delete`/`help`. bare `gemini <files>` 제거. 인라인 continue 없음(후속은 인터랙티브 `/select`+텍스트). 인라인 대상은 interactionId. global flags 공통. help↔MCP 정합. (구: 파일만으로 생성.)
- **Spec:** `spec/google-genai-mcp.md` — Decisions, Requirements (개정 예정)
- **Notes:**
  - MCP: `generate` / `analyze` / `download` / interaction 관리 도구
  - 2026-07-29: ASR-028 Option A 승인으로 서브커맨드 통합 개정
### ASR-003 — 패키징 구조

- **Category:** Structure & organization
- **Status:** approved
- **Statement:** 프로젝트를 단일 패키지로 배포할지, monorepo로 분리할지 결정
- **Why it matters:** 개발 복잡도, 배포 용이성, 유지보수에 영향
- **Depends on:** ASR-002
- **Related ADRs:** 없음 (Direct Input)
- **Resolution path:** direct-input
- **Resolution:** 단일 패키지 `google-genai-mcp`로 배포.
- **Spec:** —
- **Notes:** 사용자가 단일 패키지 선택

### ASR-004 — MVP 기능 범위

- **Category:** Scope boundary
- **Status:** approved
- **Statement:** MVP에 포함할 Gemini API 기능 결정
- **Why it matters:** 개발 범위와 출시 일정에 직접 영향
- **Depends on:** ASR-001
- **Related ADRs:**
  - `adr/media-understanding-mcp.md` — approved — 통합 `analyze`로 미디어 이해 추가 (ASR-023)
- **Resolution path:** direct-input
- **Resolution:** MVP 기능: Image/Video/Speech/Music 생성 + 미디어 이해(`analyze`). 텍스트/코드 생성·임베딩·HTTP(SSE)는 제외.
- **Spec:** `spec/google-genai-mcp.md` — Decisions MVP, Out of Scope
- **Notes:** 사용자가 image, video 생성을 MVP로 선택. 후속 Speech/Music. 2026-07-29 ASR-023으로 analyze In Scope.

### ASR-005 — Gemini API 클라이언트 통합 방식

- **Category:** Integration & dependencies
- **Status:** approved
- **Statement:** Google Gemini API 클라이언트 SDK(`@google/genai`)의 인스턴스 생성, 생명주기 관리, 재사용 방식을 결정해야 한다
- **Why it matters:** 클라이언트 인스턴스 관리 방식이 연결 풀링, 메모리 사용, 에이전트 재시작 시 상태 복구에 영향. 잘못된 설계 시 리소스 누수 또는 불필요한 재연결 발생
- **Depends on:** ASR-001, ASR-004
- **Related ADRs:**
  - `adr/gemini-client-lifecycle.md` — approved — 클라이언트 생명주기 관리 (싱글톤 vs 요청별)
- **Resolution path:** adr
- **Resolution:** Option A 채택 — 싱글톤. 애플리케이션 시작 시 1회 생성, 전역 공유. stdio 환경에서는 프로세스 격리로 동시성 문제 없음. HTTP/SSE 확장 시 연결 풀/워커 모델 추가 검토. 인증은 `GEMINI_API_KEY`만 사용 (`GOOGLE_API_KEY` 미사용).
- **Spec:** —
- **Notes:** `@google/genai` SDK는 경량 객체 (네트워크 연결 없이 초기화). stdio 프로세스 격리로 여러 에이전트 동시 접근 시에도 충돌 없음. HTTP/SSE 확장 시 재검토 필요

### ASR-006 — 바이너리 출력 처리

- **Category:** Structure & organization
- **Status:** approved
- **Statement:** 이미지/비디오 생성 결과의 바이너리 데이터를 MCP/CLI에 어떻게 전달할지 결정
- **Why it matters:** MCP 프레임 크기 제한, CLI 출력 스트림 제한, 대용량 파일 처리 능력에 직접 영향
- **Depends on:** ASR-004
- **Related ADRs:** —
- **Resolution path:** direct-input
- **Resolution:** 로컬 파일 저장. `generate` 응답 `{ interactionId, files, background }` (동기: files 채움, 비동기: files=[]). MCP는 단일 filePath. `download` 오류는 즉시 실패. `filePath` 미지정 시 YAML `output` → 자동 파일명.
- **Spec:** `spec/google-genai-mcp.md` — Decisions, Requirements
- **Notes:** 2026-07-23 ID+files, download 즉시 에러, MCP 단일 파일

### ASR-007 — 오류 처리 및 복구 전략

- **Category:** Quality bar
- **Status:** approved
- **Statement:** Gemini API 오류(인증 실패, rate limit, quota 초과, 서비스 불가), MCP 프로토콜 오류, CLI 입력 오류를 어떻게 처리하고 사용자에게 전달할지 결정
- **Why it matters:** 오류 처리가 일관되지 않으면 에이전트가 잘못된 결과를 해석하거나, 사용자가 원인을 파악하기 어려워짐. 재시도 가능 여부도 아키텍처에 영향
- **Depends on:** ASR-005
- **Related ADRs:**
  - `adr/speech-chunk-failure-recovery.md` — approved — 장문 청크 루프에 기존 분류·백오프 규칙을 확장 적용
  - `adr/unified-references-field.md` — approved — 참조 경로·타입 부적절 시 즉시 실패 (ASR-029)
- **Resolution path:** direct-input
- **Resolution:** 유형별 처리: 입력 오류(즉시 실패), 인증 오류(즉시 실패), rate limit(지수 백오프 최대 3회), 서비스 오류(지수 백오프 최대 2회), quota 초과(즉시 실패). MCP는 tool error 응답, CLI는 stderr + exit code (0:성공, 1:일반, 2:입력, 3:인증, 4:API). 재시도는 rate limit과 일시적 서비스 오류만.
- **Spec:** —
- **Notes:** 장문 Speech 청크 단위 적용은 ASR-022 참조. 참조 미디어 검증 엄격화는 ASR-029.

### ASR-008 — 로깅 및 관찰 가능성

- **Category:** Quality bar
- **Status:** approved
- **Statement:** stdio 전송 환경에서 로그 출력 방식, 로그 레벨, 디버깅 지원 수준을 결정해야 한다
- **Why it matters:** MCP stdio 환경에서 stdout은 JSON-RPC 전용 — 로그가 stdout으로 출력되면 프로토콜이 깨짐. stderr 또는 파일 로깅이 필수
- **Depends on:** ASR-001
- **Related ADRs:** —
- **Resolution path:** direct-input
- **Resolution:** 데이터 루트는 사용자 홈 기준 OS별 `dataDir`(Linux XDG / macOS Application Support / Windows LocalAppData). 로그 `{dataDir}/logs`, config `{dataDir}/config.json` MVP는 `logLevel`만. 기본 quiet, `--verbose`/`LOG_LEVEL=debug`.
- **Spec:** `spec/google-genai-mcp.md` — 데이터 디렉터리, config.json
- **Notes:** 2026-07-23 크로스플랫폼 홈 기준 dataDir

### ASR-009 — 테스트 전략

- **Category:** Quality bar
- **Status:** approved
- **Statement:** 단위 테스트, 통합 테스트, MCP 프로토콜 호환성 테스트의 범위와 커버리지 목표를 결정
- **Why it matters:** 테스트 전략이 CI/CD 파이프라인, 릴리스 품질, 기여자 온보딩에 영향
- **Depends on:** 없음 (독립적)
- **Related ADRs:** —
- **Resolution path:** direct-input
- **Resolution:** 단위 테스트 (Gemini API mocking, 유틸리티), 통합 테스트 (MCP 서버 → tool call → 응답). 커버리지 목표: 90%+. 테스트 프레임워크: vitest. MCP 테스트는 `@modelcontextprotocol/sdk` 유틸리티 활용.
- **Spec:** —
- **Notes:** —

### ASR-010 — Node.js 버전 호환성 및 의존성 관리

- **Category:** Constraints
- **Status:** approved
- **Statement:** 최소 지원 Node.js 버전, npm 의존성 수, 바이너리 의존성 배제 여부를 결정
- **Why it matters:** Node.js 버전이 npm 배포 범위를 결정. 의존성이 많을수록 보안 노출과 설치 시간 증가
- **Depends on:** ASR-003
- **Related ADRs:** —
- **Resolution path:** direct-input
- **Resolution:** Node.js 18+ LTS. `engines` 필드 명시. 필수 의존성만 사용 (`@modelcontextprotocol/sdk`, `@google/genai`). 바이너리 의존성 배제.
- **Spec:** —
- **Notes:** —

### ASR-011 — 비디오 생성 시간 초과 처리

- **Category:** Structure & organization
- **Status:** approved
- **Statement:** Veo API 비디오 생성은 수분 이상 소요될 수 있으므로, MCP tool call timeout과 CLI 사용자 대기 경험을 어떻게 설계할지 결정
- **Why it matters:** MCP 클라이언트별 default timeout이 다름 (일부는 60초). 비디오 생성이 이를 초과하면 연결이 끊길 수 있음
- **Depends on:** ASR-005, ASR-006
- **Related ADRs:** —
- **Resolution path:** direct-input
- **Resolution:** 모든 타입 기본 `background=false` (동기). 장시간은 YAML/`background: true`로 비동기 — `generate`는 ID(+files) 즉시 반환, 완료 후 `download`. CLI 동기 대기: progress(poll 10초), **최대 대기 없음**, Ctrl-C로 중단.
- **Spec:** `spec/google-genai-mcp.md` — Decisions
- **Notes:** 2026-07-23 10분 상한 제거

### ASR-012 — TypeScript 타입 안전성 및 공개 API 경계

- **Category:** Quality bar
- **Status:** approved
- **Statement:** MCP SDK 타입, Gemini SDK 타입, 프로젝트 자체 타입 간의 경계와 외부에 노출되는 인터페이스를 결정
- **Why it matters:** 타입 경계가 명확하지 않으면 Gemini API 응답 구조 변경 시 MCP tool schema까지 영향. 유지보수 비용 증가
- **Depends on:** ASR-005
- **Related ADRs:** —
- **Resolution path:** direct-input
- **Resolution:** 외부 노출은 MCP tool input/output schema만. Gemini SDK 응답은 내부 변환 레이어를 통해 MCP 타입으로 변환. Gemini API 응답 변경 시 MCP schema 영향 최소화.
- **Spec:** —
- **Notes:** —

### ASR-013 — 파일 기반 입력 지원

- **Category:** Deliverable form
- **Status:** approved
- **Statement:** CLI와 MCP 모두에서 생성 파라미터를 YAML/JSON 파일로 입력받는 방식을 결정
- **Why it matters:** Image/Video/Audio 생성 파라미터는 많고, 프롬프트는 길고 복잡할 수 있음. 파일 기반 입력이 없으면 CLI에서는 에스케이프 문제, MCP에서는 JSON-RPC 메시지 크기 제한에 직면
- **Depends on:** ASR-002, ASR-004
- **Related ADRs:**
  - `adr/unified-references-field.md` — approved — 참조 필드명·검증 (ASR-029); `images` 제거
- **Resolution path:** direct-input
- **Resolution:** CLI는 파일 기반(멀티·glob). MCP `generate`는 **단일 filePath**만 — 다건은 클라이언트 다중/병렬 호출. 응답 `{interactionId,files,background}`. 상대 경로=요청 파일 디렉터리. 자동 파일명 위치는 ASR-016. 참조 미디어는 `params.references`만 (ASR-029).
- **Spec:** `spec/google-genai-mcp.md` — Requirements, 경로 해석, Interaction 관리
- **Notes:** 인터랙티브 모드에서 대화 이어가기는 Interactions API `previous_interaction_id`로 처리 — 원본 파라미터 재전송 불필요. 2026-07-31: ASR-029 Option A + `images` 제거 승인.

### ASR-014 — API 이중 체계 관리

- **Category:** Integration & dependencies
- **Status:** approved
- **Statement:** Interactions API를 기본으로 사용하되, Batch API가 필요한 경우 generateContent로 분기하는 구조를 결정
- **Why it matters:** 두 API의 초기화, 호출 방식, 결과 처리가 다름. 명확한 분기 기준이 없으면 코드 복잡도 증가
- **Depends on:** ASR-005
- **Related ADRs:** —
- **Resolution path:** direct-input
- **Resolution:** 기본 Interactions API 사용 (단일 생성). Batch 모드일 때만 generateContent + Batch API 사용. MVP에서는 Batch API 미지원, 향후 확장.
- **Spec:** —
- **Notes:** —

### ASR-015 — 산출물 보관 전략

- **Category:** Structure & organization
- **Status:** approved
- **Statement:** 서버 보관(55일)과 로컬 저장의 관계를 결정
- **Why it matters:** 서버 보관만으로 충분할지, 로컬 백업이 필요한지 결정 필요. 보관 기간 만료 시 데이터 손실 리스크
- **Depends on:** ASR-006
- **Related ADRs:** —
- **Resolution path:** direct-input
- **Resolution:** 동기(`background=false`)는 `generate` 완료 시 로컬 자동 저장. 비동기는 `download` 호출 시 저장. 서버 보관은 Gemini API 기본 동작 (55일) 유지. 추가 장기 보관은 MVP 미포함.
- **Spec:** `spec/google-genai-mcp.md` — Decisions
- **Notes:** —

### ASR-016 — 출력 파일 위치 관리

- **Category:** Deliverable form
- **Status:** approved
- **Statement:** 생성된 파일의 기본 저장 위치와 사용자 지정 방식을 결정
- **Why it matters:** 사용자 기대치와 CLI/MCP 일관성에 영향. 기본값 잘못 선택 시 사용자 불편
- **Depends on:** ASR-002, ASR-006
- **Related ADRs:** —
- **Resolution path:** direct-input
- **Resolution:** 경로 우선순위 — `download`의 `filePath` > YAML `output` > 자동 파일명. YAML 명시 상대 경로는 요청 파일 디렉터리 기준. **자동 파일명 위치: CLI=CWD, MCP=workspace(`process.cwd`)**. 덮어쓰기: MCP=overwrite, CLI=사용자 확인(비대화형은 실패, `--force`로 덮어쓰기).
- **Spec:** `spec/google-genai-mcp.md` — Decisions, 경로 해석, 덮어쓰기
- **Notes:** 2026-07-23 자동 경로·overwrite 정책 확정

### ASR-017 — 백그라운드 실행 모드

- **Category:** Structure & organization
- **Status:** approved
- **Statement:** `background` 파라미터로 요청마다 동기/비동기 동작을 결정. image/video/speech/music 모두 기본 `background=false` (동기)
- **Why it matters:** 기본 동기면 에이전트가 결과를 기다리며, 빈 “백그라운드 알림” 약속을 줄일 수 있음. 장시간은 YAML로만 비동기
- **Depends on:** ASR-004, ASR-011
- **Related ADRs:** —
- **Resolution path:** direct-input
- **Resolution:** 기본값 전 타입 `false`. YAML 최상위 `background`로 오버라이드(소스 오브 트루스). MCP `background`는 YAML 미지정 시에만 적용. 유효값: `yaml.background ?? mcp.background ?? false`. CLI `--background` 플래그 없음. 비동기 산출물은 `download`로 저장.
- **Spec:** `spec/google-genai-mcp.md` — Decisions, 공통 파라미터
- **Notes:**
  - Tasks Extension 안정화 후 마이그레이션 검토
  - 2026-07-23: audio 기본값을 video와 분리(`false`), YAML 우선 규칙 확정
  - 2026-07-24: video 기본도 `false`로 통일 (전 타입 동기 기본)

### ASR-018 — Audio(TTS) 생성 지원

- **Category:** Scope boundary
- **Status:** approved
- **Statement:** MVP에 Gemini TTS를 통한 음성 생성 기능을 포함할지 결정
- **Why it matters:** Image/Video와 함께 멀티미디어 생성 도구로서의 완성도에 영향. 에이전트가 텍스트→음성 변환을 MCP 도구로 직접 호출할 수 있는지 여부
- **Depends on:** ASR-004
- **Related ADRs:**
  - `adr/speech-long-form-chunking.md` — approved — 장문 분할·병합 (ASR-022와 공유)
- **Resolution path:** direct-input
- **Resolution:** MVP에 Audio(TTS) 생성 포함. Gemini 3.1 Flash TTS 모델 사용. 단일 화자 및 다중 화자(최대 2명) 지원. 30종 사전 정의 음성 제공. 인라인 오디오 태그로 스타일 제어 지원. 기본 `background=false`(동기).
- **Spec:** `spec/google-genai-mcp.md` — Audio 스키마, Requirements
- **Notes:** 장문 동작은 ASR-022에서 별도 결정

### ASR-019 — Interaction 메타데이터 관리

- **Category:** Structure & organization
- **Status:** approved
- **Statement:** Interaction ID와 로컬 파일 경로 간의 매핑 정보를 어떻게 저장하고 관리할지 결정
- **Why it matters:** Interactions API가 서버에서 전체 상태를 관리하므로, 로컬에는 매핑 정보만 저장. 매핑이 없으면 인터랙티브 모드에서 이전 생성 기록을 효과적으로 관리할 수 없음
- **Depends on:** ASR-013, ASR-014
- **Related ADRs:** —
- **Resolution path:** direct-input
- **Resolution:** `{dataDir}/interactions.json`에 `interactionId`, `requestFile`(절대 경로), `tmpFile`만 저장. sync/get 시 서버 없는 ID 로컬 삭제. cancel/delete로 서버·로컬 정리. dataDir는 ASR-008.
- **Spec:** `spec/google-genai-mcp.md` — Interaction 관리, get_interaction 응답
- **Notes:** 2026-07-23 sync·cancel·delete·get 응답 스키마 확정

### ASR-020 — 인터랙티브 세션 관리

- **Category:** Deliverable form
- **Status:** approved
- **Statement:** `gemini` 명령어로 시작하는 인터랙티브 세션의 명령어 구조, 세션 lifecycle, 서버 싱크 방식을 결정
- **Why it matters:** 인터랙티브 모드는 CLI의 핵심 사용자 경험. 명령어 구조가 직관적이어야 하고, 서버와의 싱크가 정확해야 함
- **Depends on:** ASR-002, ASR-019
- **Related ADRs:** —
- **Resolution path:** direct-input
- **Resolution:** 명령어: `/list`, `/select N`, `/show`, `/status`, `/download [path]`, `/sync`, `/cancel`, `/delete`. `/sync`는 로컬↔서버 매핑 정리. `/cancel`/`/delete`는 서버 작업 + 로컬 정리.
- **Spec:** `spec/google-genai-mcp.md` — Requirements, Interaction 관리
- **Notes:** GUI/Web UI 확장 시 동일한 Interactions API + 로컬 매핑 구조 재사용 가능

### ASR-021 — Multi-turn 편집

- **Category:** Structure & organization
- **Status:** approved
- **Statement:** 인터랙티브 모드에서 이전 interaction에 이어서 대화를 이어가는 방식을 결정
- **Why it matters:** multi-turn 편집이 가능해야 사용자가 생성 결과를 점진적으로 수정할 수 있음. 서버 컨텍스트 관리 방식이 핵심
- **Depends on:** ASR-014, ASR-020
- **Related ADRs:** —
- **Resolution path:** direct-input
- **Resolution:** Interactions API `previous_interaction_id` 활용. 모달리티(image/video/audio) 사전 차단 없음 — 서버/모델 미지원 시 API 오류를 그대로 전달. 새 interaction 생성 시 로컬 매핑 추가.
- **Spec:** `spec/google-genai-mcp.md` — Requirements, Interaction 관리
- **Notes:** 2026-07-23 continue_interaction 모달리티 미차단 확정

### ASR-022 — 장문 Speech 분할·병합 전략

- **Category:** Structure & organization
- **Status:** approved
- **Statement:** 장문 TTS 요청을 단일 API 호출로 둘지, TRANSCRIPT 줄/문장 단위로 나눠 생성한 뒤 무음 간격을 넣어 wav로 이어붙일지 결정
- **Why it matters:** 장문 동기 TTS는 CLI에서 progress 없이 장시간 대기로 “멈춤”처럼 보이고, Google도 수 분 초과 출력의 품질 저하를 경고하며 청크 분할을 권장함
- **Depends on:** ASR-018, ASR-002, ASR-017, ASR-007
- **Related ADRs:**
  - `adr/speech-long-form-chunking.md` — approved — Option C: 임계값 초과 시 문단/문장 분할 + 무음 삽입 병합 저장
  - `adr/speech-chunk-failure-recovery.md` — approved — Option C: 청크별 재시도 + 부분 캐시 & Resume
- **Resolution path:** adr
- **Resolution:** 낭독 본문 4,000 bytes 초과 시 문단(빈 줄) 단위 분할, 1,500 bytes 초과 문단만 문장 단위 재분할. `#### TRANSCRIPT` 앞 프리앰블은 임계값 제외·전 청크 재부착. 청크 PCM을 그대로 이어붙여 단일 WAV(24kHz·16bit·mono)로 병합(청크 사이 무음 삽입 없음 — 각 청크가 이미 앞뒤 무음 포함, 2026-07-26 개정). 청크별 재시도(rate limit 3회, 5xx 2회); 인증·quota·400은 즉시 중단. 부분 wav 미저장, 무음 대체 금지. 성공 청크는 `{dataDir}/chunks/{requestHash}/{NNN}.pcm`에 캐시하여 재실행 시 자동 재사용, 성공 병합 시 삭제·실패분 7일 후 GC. 로직은 core에 두어 CLI·MCP 공통, `interactions.json`에는 대표 1건만 등록.
- **Spec:** `spec/google-genai-mcp.md` — 장문 Speech 분할·병합 (ASR-022), Requirements 장문 Speech 처리
- **Notes:** 2026-07-25 장문 생성 요청으로 제기. wav concat은 기술적으로 가능(L16→WAV 래핑 전제). 미결: 진행/실패 보고 문구 세부, 청크 간 동시성 상한.

### ASR-023 — 미디어 이해(분석) MCP 기능

- **Category:** Scope boundary
- **Status:** approved
- **Statement:** Gemini image/audio/video 이해 API를 MCP/CLI로 노출할지, 어떤 도구·요청 형태(통합 analyze vs 모달리티별 vs QA 전용 vs 미추가)로 노출할지 결정해야 한다
- **Why it matters:** 생성 산출물 QA와 사용자 미디어 설명/분석 요청을 에이전트가 닫힌 루프로 처리하려면 서버 측 미디어 입력이 필요함. 현재 PRD/스펙은 멀티모달 분석을 Out of Scope로 두고 있어 범위 개정이 전제됨
- **Depends on:** ASR-004, ASR-005, ASR-013, ASR-014, ASR-006
- **Related ADRs:**
  - `adr/media-understanding-mcp.md` — approved — Option A: 통합 MCP `analyze` 도구 1개
- **Resolution path:** adr
- **Resolution:** Option A — 통합 `analyze`. ASR-024/025/026으로 스키마·업로드·interaction/모델 확정. 스펙·구현 핸드오프 가능.
- **Spec:** `spec/google-genai-mcp.md` — 미디어 이해 Analyze, Requirements analyze
- **Notes:** 2026-07-29 제기·승인. 사용 시나리오: (1) 생성 결과 적합성 평가 (2) 임의 미디어 설명·분석·평가 후 호스트 AI가 사용자에게 해석.

### ASR-024 — Analyze 요청·응답 스키마

- **Category:** Deliverable form
- **Status:** approved
- **Statement:** `analyze`의 MCP/CLI 입력·출력 계약(YAML 여부, `inputs`/`prompt`, 텍스트 반환, 구조화 출력 파라미터)을 결정해야 한다
- **Why it matters:** generate와 달리 파라미터가 단순하고 출력 형식이 요청마다 다르므로, 잘못된 계약은 에이전트 호출 비용을 높이거나 스키마를 과다 설계하게 됨
- **Depends on:** ASR-023, ASR-013, ASR-006
- **Related ADRs:**
  - `adr/analyze-request-response-schema.md` — approved — Option A: MCP 네이티브 `inputs`+`prompt`(+`model?`) → `{ interactionId, text }`; 2026-08-01 개정: `inputs`의 `.yaml`/`.json`을 생성 스펙으로 인식해 output 분석·체크리스트
  - `adr/analyze-interaction-and-model.md` — approved — 응답에 `interactionId` 포함 확정
- **Resolution path:** adr
- **Resolution:** Option A — `analyze({ inputs: string[], prompt?: string, model?: string })` → `{ interactionId, text }`. 기본: 미디어 `inputs`+`prompt`. `inputs`에 생성 YAML/JSON(확장자, 최대 1개)이 있으면 `output` 분석·`prompt` 생략 가능·합성 프롬프트에 요청/참조 YAML(재귀)+충실도 체크리스트. 별도 `requestFile` 파라미터·`type: analyze`·서버측 `responseSchema`는 제외.
- **Spec:** `spec/google-genai-mcp.md` — Analyze 표면·응답 스키마
- **Notes:** 2026-07-29 승인. interactionId는 ASR-026에서 확정·스키마 개정. 2026-08-01: 생성 스펙을 `inputs` 확장자로 통합(Amendments).

### ASR-025 — Analyze 입력·업로드 전략

- **Category:** Integration & dependencies
- **Status:** approved
- **Statement:** `analyze`의 `inputs[]`(로컬 경로·URL·YouTube)를 Interactions API에 인라인으로 넣을지 Files API로 올릴지, MIME 추론·개수 한도·ACTIVE 폴링을 어떻게 할지 결정해야 한다
- **Why it matters:** 생성 video QA는 대용량 파일이 흔하고, 임의 분석은 URL/YouTube가 흔함. 잘못된 전략은 작은 파일 지연 또는 큰 파일 실패로 이어짐
- **Depends on:** ASR-024, ASR-023, ASR-005, ASR-013
- **Related ADRs:**
  - `adr/analyze-input-upload-strategy.md` — approved — Option A: 하이브리드(≤20MB 인라인 / 초과 Files+ACTIVE) + URL/YouTube 패스스루
- **Resolution path:** adr
- **Resolution:** Option A — 로컬 ≤20MB 인라인, 초과 Files API+ACTIVE 폴링(5초). YouTube·공개 http(s)는 uri 패스스루. MIME=`inferMediaRefType`. inputs 1–10.
- **Spec:** `spec/google-genai-mcp.md` — Analyze 입력·업로드
- **Notes:** 2026-07-29 승인.

### ASR-026 — Analyze interaction·모델 기본값

- **Category:** Structure & organization
- **Status:** approved
- **Statement:** `analyze`가 `interactionId`를 반환하고 `continue_interaction`을 재사용할지, 기본 모델을 무엇으로 할지 결정해야 한다
- **Why it matters:** 후속 질문 UX와 매 호출 비용·편의에 직접 영향
- **Depends on:** ASR-024, ASR-021, ASR-019, ASR-023
- **Related ADRs:**
  - `adr/analyze-interaction-and-model.md` — approved — ID+continue 재사용, 기본 `gemini-3.5-flash`, 선택적 `model` 오버라이드
- **Resolution path:** adr
- **Resolution:** `analyze` → `{ interactionId, text }`; `continue_interaction`으로 follow-up. 로컬 interactions store에 매핑. 기본 모델 `gemini-3.5-flash`. `media_resolution` MVP 미노출.
- **Spec:** `spec/google-genai-mcp.md` — Analyze interaction·모델
- **Notes:** 2026-07-29 사용자 직접 승인.

### ASR-027 — Analyze CLI 표면

- **Category:** Deliverable form
- **Status:** approved
- **Statement:** CLI에서 analyze 호출 형태(서브커맨드/플래그)와 후속 interaction UX를 결정해야 한다
- **Why it matters:** analyze는 YAML이 없어 생성 CLI와 진입점이 다르고, follow-up을 새로 만들면 UX가 이중화됨
- **Depends on:** ASR-024, ASR-026, ASR-002, ASR-020, ASR-021
- **Related ADRs:**
  - `adr/analyze-cli-surface.md` — approved — `gemini analyze` 플래그; follow-up은 기존 인터랙티브+interactionId
  - `adr/cli-unified-command-surface.md` — proposed — 전체 CLI `gemini <command>` 통합 시 analyze 위치 정합 (ASR-028)
- **Resolution path:** adr
- **Resolution:** `gemini analyze <files…> [-p …]`. prompt: `-p` 또는 stdin, 빈 값이면 취소. 후속은 인터랙티브 `/select`+텍스트(인라인 continue 없음). ASR-028 정합.
- **Spec:** `spec/google-genai-mcp.md` — CLI analyze
- **Notes:** 2026-07-29 승인. ASR-028에서 bare files 제거·CLI 통합과 함께 확정.
### ASR-028 — CLI 통합 커맨드 표면

- **Category:** Deliverable form
- **Status:** approved
- **Statement:** CLI를 `gemini <command> <parameters>`로 통일하고, 인터랙티브와 동등한 관리 명령을 인라인으로 제공하며, 대상 지정은 `select` index 대신 `interactionId`로 할지 결정해야 한다
- **Why it matters:** generate(파일)·analyze(서브커맨드)·관리(인터랙티브만)가 갈라지면 학습·스크립트·에이전트 비용이 커짐. analyze 도입 시점이 표면 정리에 적합
- **Depends on:** ASR-002, ASR-020, ASR-027, ASR-024
- **Related ADRs:**
  - `adr/cli-unified-command-surface.md` — approved — Option A: 통합 서브커맨드; bare files 제거; 인라인 continue 없음; `/select` 유지; global flags 공통; help↔MCP
- **Resolution path:** adr
- **Resolution:** Option A. `gemini generate|analyze|download|list|show|status|sync|cancel|delete|help`. 무명령→인터랙티브. `gemini <files>` 제거. 후속 턴은 인터랙티브만. analyze: `<files…>`, `-p`|stdin, 빈 prompt 취소. 인라인은 interactionId; `/select` 유지.
- **Spec:** `spec/google-genai-mcp.md` — CLI 통합 커맨드, Decisions ASR-002/028
- **Notes:** 2026-07-29 승인.

### ASR-029 — 참조 미디어 필드 명명·검증

- **Category:** Deliverable form
- **Status:** approved
- **Statement:** image / video / music 생성 YAML의 참조 미디어 필드명을 통일할지(`references` vs 타입별 `images`), 그리고 경로 미존재·타입 부적절 시 즉시 실패할지 결정해야 한다
- **Why it matters:** 타입마다 필드명이 다르면 에이전트·사용자 실수가 늘고, 부적절 참조를 조용히 넘기면 잘못된 API 호출·디버깅 비용이 커진다
- **Depends on:** ASR-013, ASR-007
- **Related ADRs:**
  - `adr/unified-references-field.md` — approved — Option A: `references` 통일 + 엄격 검증; `images` 제거
- **Resolution path:** adr
- **Resolution:** Option A. image/video/music 정규 필드 `params.references`만 허용. `params.images`는 제거(사용 시 `INVALID_INPUT`). 내부 타입도 `references`. 미존재·비파일·부적절 타입/확장자는 파싱 시 즉시 실패. 빈 `[]` 허용. speech 해당 없음.
- **Spec:** `spec/google-genai-mcp.md` — Image/Video/Music references, 요청 파일 처리, Decisions ASR-029
- **Notes:** 2026-07-31 Option A 승인. 동일일 Downstream: 레거시 `images` 완전 제거.

