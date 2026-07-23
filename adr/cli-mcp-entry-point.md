# CLI/MCP Entry Point 구조

## Concern
단일 패키지에서 MCP 서버와 CLI를 어떻게 진입점으로 구조화할 것인가?

## Status
approved

## Context
- ASR-002: CLI + MCP 모두 제공 확정
- ASR-003: 단일 패키지 `google-genai-mcp`로 배포 확정
- gemini-mcp는 Single Entry Point (Dual-Mode) 패턴 사용
- MCP 서버와 CLI는 기능적으로 독립적이며, 공유 코어 모듈을 통해 연결

## Decision
**Option B — Separate Entry Points (Multi-Bin)**
MCP와 CLI를 별도 파일로 분리, `package.json` `bin`에 2개 등록. MCP는 `google-genai-mcp`, CLI는 `gemini`.

## Options

### Option A — Single Entry Point (Dual-Mode)
- 단일 `index.ts`에서 인자 분석으로 MCP/CLI 분기
- Pro: 배포/설치 단순 (실행 파일 1개)
- Con: 분기 로직 누적, MCP 시작 시 CLI 의존성 로드

### Option B — Separate Entry Points (Multi-Bin)
- MCP와 CLI를 별도 진입점으로 분리
- `bin: { "google-genai-mcp": "dist/mcp.js", "gemini": "dist/cli.js" }`
- Pro: 진입점 분리 → MCP 서버가 CLI 의존성 로드 안 함, 독립 테스트 가능
- Con: 진입점 2개, shared 모듈 구조 설계 필요

### Option C — CLI-First with MCP Subcommand
- CLI를 기본으로, MCP는 `gemini serve` 서브커맨드
- Pro: 사용자 경험 통일
- Con: MCP 서버가 CLI 프레임워크 거쳐야 함, 비효율

## Tradeoffs

| | A. Single Entry | B. Multi-Bin | C. CLI-First |
|---|---|---|---|
| **설치 단순성** | ★★★ | ★★ | ★★★ |
| **MCP 시작 속도** | ★★ | ★★★ | ★ |
| **메모리 효율** | ★★ | ★★★ | ★ |
| **테스트 용이성** | ★★ | ★★★ | ★★ |
| **확장성** | ★★ | ★★★ | ★★ |

## Consequences
- MCP 서버: `google-genai-mcp` 명령어로 실행 (Claude Code `claude mcp add`에서 사용)
- CLI: `gemini` 명령어로 실행 (사용자 직접 사용)
- 각 진입점은 core 모듈만 의존, 서로 독립
- `package.json` bin 필드에 2개 명령어 등록

## Related ASRs
- ASR-002 — CLI 포함 여부 — CLI + MCP 모두 제공 확정
- ASR-003 — 패키징 구조 — 단일 패키지 확정

## Downstream Concerns (해결 완료)

- [x] **Core Module 분리:** MCP와 CLI가 공유할 코어 모듈의 경계와 인터페이스 설계 → `src/core/`로 분리 확정
- [x] **의존성 그래프:** core/는 독립, mcp/와 cli/는 core/만 의존 (단방향)

### Core Module 구조 (확정)

```
src/
├── core/                       # 공유 모듈 (비즈니스 로직)
│   ├── gemini-client.ts        # Gemini API 클라이언트 (싱글톤)
│   ├── image.ts                # Image 생성 로직
│   ├── video.ts                # Video 생성 로직
│   ├── audio.ts                # Audio/TTS 로직
│   ├── request-parser.ts       # YAML/JSON 요청 파싱 + 검증
│   ├── output.ts               # 출력 파일 관리
│   ├── errors.ts               # 오류 분류 + 재시도
│   └── logger.ts               # 로깅 (stderr)
│
├── mcp/                        # MCP 서버 전용
│   ├── index.ts                # MCP 엔트리포인트
│   ├── server.ts               # McpServer 설정 + transport
│   └── tools/                  # Tool 정의
│       ├── image.ts
│       ├── video.ts
│       └── audio.ts
│
├── cli/                        # CLI 전용
│   ├── index.ts                # CLI 엔트리포인트
│   ├── commands/               # 명령어 핸들러
│   │   ├── image.ts
│   │   ├── video.ts
│   │   └── audio.ts
│   ├── config.ts               # CLI 설정 (~/.config/gemini-cli/)
│   └── ui/                     # 터미널 UI
│       ├── theme.ts
│       ├── progress.ts
│       └── spinner.ts
```

**의존성:** `gemini` (CLI) ──→ `core/` ←── `google-genai-mcp` (MCP)

**핵심 원칙:**
1. `core/`는 순수 비즈니스 로직 — CLI 인자 파싱, MCP 프로토콜, UI 없음
2. `core/`는 `GoogleGenAI`를 직접 사용 — MCP tool이나 CLI command가 직접 API 호출
3. 결과 타입 통일 — `GeneratedFile { filePath, mimeType, size }` 등 공유 타입
4. MCP tool은 `core/`를 호출만 — 입력 변환 → `core/` 호출 → MCP 응답 포맷팅

## Related
- `docs/gemini-mcp-reference.md` — gemini-mcp 구조 참조

## Tags
`entry-point`, `multi-bin`, `mcp`, `cli`, `structure`

## Approved
- 2026-07-23: Option B (Multi-Bin), 사용자 승인. MCP=`google-genai-mcp`, CLI=`gemini`
