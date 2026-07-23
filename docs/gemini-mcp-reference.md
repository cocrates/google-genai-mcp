# gemini-mcp 참조 구조 분석

> **Source:** https://github.com/RLabs-Inc/gemini-mcp (v0.8.1)
> **Purpose:** google-genai-mcp 개발 시 구조적 참고 자료
> **Analyzed:** 2026-07-23

---

## 1. 프로젝트 개요

Google Gemini API의 Image/Video/Audio/Text 생성 기능을 MCP(Model Context Protocol) 서버 + CLI로 제공하는 프로젝트. Claude Code와 Gemini를 연동하는 것이 주 목표.

| 항목 | 내용 |
|------|------|
| 런타임 | Node.js 18+ / Bun 1.2+ |
| 언어 | TypeScript (strict) |
| 패키지 매니저 | npm + bun (이중 지원) |
| 빌드 | `tsc` (TypeScript 컴파일러) |
| 테스트 | vitest |
| 린트/포맷 | ESLint + Prettier |
| 라이선스 | MIT |

---

## 2. 디렉토리 구조

```
gemini-mcp/
├── src/
│   ├── index.ts                    # 엔트리포인트 (MCP/CLI 분기)
│   ├── server.ts                   # MCP 서버 설정 및 tool 등록
│   ├── gemini-client.ts            # Gemini API 클라이언트 (싱글톤)
│   ├── cli/
│   │   ├── index.ts                # CLI 라우터 (명령어 분기)
│   │   ├── config.ts               # CLI 설정 관리 (~/.config/gemini-cli/)
│   │   ├── commands/               # CLI 명령어 핸들러
│   │   │   ├── config.ts           # gcli config
│   │   │   ├── image.ts            # gcli image
│   │   │   ├── query.ts            # gcli query
│   │   │   ├── research.ts         # gcli research
│   │   │   ├── search.ts           # gcli search
│   │   │   ├── speak.ts            # gcli speak
│   │   │   ├── tokens.ts           # gcli tokens
│   │   │   └── video.ts            # gcli video
│   │   └── ui/                     # CLI UI 컴포넌트
│   │       ├── index.ts            # UI exports
│   │       ├── box.ts              # 박스 렌더링
│   │       ├── colors.ts           # 색상 정의
│   │       ├── progress.ts         # 프로그레스 바
│   │       ├── spinner.ts          # 스피너
│   │       └── theme.ts            # 테마 관리 (5종)
│   ├── tools/                      # MCP Tool 정의
│   │   ├── tool-groups.ts          # Tool 그룹/프리셋 설정
│   │   ├── tool-groups.test.ts     # Tool 그룹 테스트
│   │   ├── query.ts                # gemini-query
│   │   ├── brainstorm.ts           # gemini-brainstorm
│   │   ├── analyze.ts              # gemini-analyze-code/text
│   │   ├── analyze-utils.ts        # 분석 유틸리티
│   │   ├── summarize.ts            # gemini-summarize
│   │   ├── image-gen.ts            # gemini-generate-image
│   │   ├── image-edit.ts           # gemini-*-image-edit
│   │   ├── image-analyze.ts        # gemini-analyze-image
│   │   ├── video-gen.ts            # gemini-generate-video
│   │   ├── speech.ts               # gemini-speak/dialogue
│   │   ├── search.ts               # gemini-search
│   │   ├── structured.ts           # gemini-structured/extract
│   │   ├── code-exec.ts            # gemini-run-code
│   │   ├── youtube.ts              # gemini-youtube
│   │   ├── document.ts             # gemini-analyze-document
│   │   ├── url-context.ts          # gemini-analyze-url
│   │   ├── cache.ts                # gemini-*-cache
│   │   ├── token-count.ts          # gemini-count-tokens
│   │   ├── deep-research.ts        # gemini-deep-research
│   │   └── __tests__/              # Tool 테스트
│   │       └── analyze.test.ts
│   └── utils/
│       ├── logger.ts               # 로깅 유틸리티
│       └── output-dir.ts           # 출력 디렉토리 관리
├── docs/
│   ├── CLI_DESIGN.md               # CLI 설계 문서
│   └── ROADMAP.md                  # 로드맵
├── .claude/                        # Claude Code 설정
├── .husky/                         # Git hooks
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.mjs
├── server.json                     # MCP Registry 메타데이터
├── CLAUDE.md                       # Claude Code 지침
└── README.md
```

---

## 3. 아키텍처 패턴

### 3.1 Dual-Mode Entry Point (`src/index.ts`)

단일 `index.ts`가 두 가지 모드를 분기:

```
CLI 인자 분석
├─ 인자 없음 / `serve` / MCP 플래그 → startMcpServer() (MCP 서버 모드)
└─ 그 외 (`query`, `image`, `video` 등) → runCli() (CLI 모드)
```

**핵심:** `#!/usr/bin/env node` 헤버로 npm `bin`에 등록. `gemini-mcp`와 `gcli` 두 가지 명령어로 동작.

### 3.2 MCP 서버 구조 (`src/server.ts`)

```
startMcpServer()
├─ 1. 인자 파싱 (parseArgs)
├─ 2. 로깅 레벨 설정
├─ 3. API 키 검증
├─ 4. initGeminiClient() (Gemini 클라이언트 초기화)
├─ 5. McpServer 생성
├─ 6. Tool 등록 (loop over toolRegistrations)
├─ 7. StdioServerTransport 연결
└─ 8. 프로세스 시그널 핸들링 (SIGINT, SIGTERM)
```

**Tool 등록 패턴:**
- `toolRegistrations` 레지스트리 맵: `{ groupId: registerFn }`
- `getEnabledToolGroups()`로 활성화된 그룹만 등록
- 각 `registerFn`은 `McpServer`를 받아 `server.tool()` 호출

### 3.3 Gemini 클라이언트 (`src/gemini-client.ts`)

**싱글톤 패턴** — 전역 `genAI` 변수에 `GoogleGenAI` 인스턴스 1회 생성.

```
initGeminiClient()
├─ API 키 검증
├─ new GoogleGenAI({ apiKey }) 생성
├─ 모델명 설정 (환경변수 또는 기본값)
├─ 출력 디렉토리 초기화
└─ 연결 테스트 (3회 재시도, 10초 타임아웃)
```

**내보내기 함수들:**
| 함수 | 용도 |
|------|------|
| `generateWithGeminiPro()` | Pro 모델 텍스트 생성 |
| `generateWithGeminiFlash()` | Flash 모델 텍스트 생성 |
| `generateWithChat()` | 채팅 히스토리 기반 생성 |
| `generateImage()` | Nano Banana Pro 이미지 생성 |
| `startVideoGeneration()` | Veo 비디오 생성 (비동기) |
| `checkVideoStatus()` | 비디오 상태 폴링 |
| `countTokens()` | 토큰 수 계산 |
| `startDeepResearch()` | Deep Research 에이전트 시작 |
| `checkDeepResearch()` | Deep Research 상태 확인 |
| `followUpResearch()` | Deep Research 후속 질문 |

### 3.4 Tool 시스템 (`src/tools/`)

**Tool Group 기반 로딩:**

```typescript
// tool-groups.ts
TOOL_GROUPS = {
  query:      { tools: ['gemini-query'] },
  'image-gen': { tools: ['gemini-generate-image', 'gemini-image-prompt'] },
  speech:     { tools: ['gemini-speak', 'gemini-dialogue', 'gemini-list-voices'] },
  // ... 18개 그룹
}
```

**프리셋 시스템:**
| 프리셋 | 포함 그룹 |
|--------|----------|
| `minimal` | query, brainstorm |
| `text` | query, brainstorm, analyze, summarize, structured |
| `image` | query, image-gen, image-edit, image-analyze |
| `research` | query, search, deep-research, url-context, document |
| `media` | query, image-gen, image-edit, image-analyze, video-gen, youtube, speech |
| `full` | 전체 18개 그룹 (기본값) |

**Tool 등록 패턴 (각 tool 파일):**
```typescript
export function registerXxxTool(server: McpServer): void {
  server.tool(
    'tool-name',
    { /* zod schema */ },
    async (params) => {
      // 구현
      return { content: [...] }
    }
  )
}
```

---

## 4. MCP Tool 목록 (37개)

### 4.1 텍스트 생성/처리
| Tool | 기능 | 모델 |
|------|------|------|
| `gemini-query` | 직접 쿼리 (thinking level 제어) | Pro/Flash |
| `gemini-brainstorm` | Claude+Gemini 협업 브레인스토밍 | Pro |
| `gemini-analyze-code` | 코드 분석 (quality/security/performance) | Pro |
| `gemini-analyze-text` | 텍스트 분석 (sentiment/entities) | Pro |
| `gemini-summarize` | 요약 (brief/moderate/detailed) | Pro/Flash |
| `gemini-structured` | JSON 스키마 기반 구조화 출력 | Pro |
| `gemini-extract` | 엔티티/팩트/키워드 추출 | Pro |

### 4.2 이미지
| Tool | 기능 | 모델 |
|------|------|------|
| `gemini-generate-image` | 이미지 생성 (4K, 10종 비율) | Nano Banana Pro |
| `gemini-image-prompt` | 이미지 프롬프트 생성 (텍스트) | Pro |
| `gemini-start-image-edit` | 멀티턴 이미지 편집 세션 시작 | Nano Banana Pro |
| `gemini-continue-image-edit` | 이미지 편집 세션 계속 | Nano Banana Pro |
| `gemini-end-image-edit` | 이미지 편집 세션 종료 | - |
| `gemini-list-image-sessions` | 활성 편집 세션 목록 | - |
| `gemini-analyze-image` | 이미지 분석 | Pro/Flash |

### 4.3 비디오
| Tool | 기능 | 모델 |
|------|------|------|
| `gemini-generate-video` | 비디오 생성 (비동기) | Veo 2.0 |
| `gemini-check-video` | 비디오 상태 폴링 + 다운로드 | - |

### 4.4 오디오
| Tool | 기능 | 모델 |
|------|------|------|
| `gemini-speak` | 단일 화자 TTS | gemini-2.5-flash-preview-tts |
| `gemini-dialogue` | 복수 화자(최대 2명) TTS | gemini-2.5-flash-preview-tts |
| `gemini-list-voices` | 사용 가능한 음성 30종 목록 | - |

### 4.5 검색/연구
| Tool | 기능 | 모델 |
|------|------|------|
| `gemini-search` | 실시간 웹 검색 (인용 포함) | - (Grounding) |
| `gemini-deep-research` | 심층 연구 에이전트 | deep-research-preview |
| `gemini-check-research` | 연구 상태 확인 | - |
| `gemini-research-followup` | 연구 후속 질문 | Pro |

### 4.6 문서/URL
| Tool | 기능 | 모델 |
|------|------|------|
| `gemini-analyze-document` | PDF/DOCX 분석 | Pro/Flash |
| `gemini-summarize-pdf` | PDF 요약 | Pro/Flash |
| `gemini-extract-tables` | 테이블 추출 | Pro/Flash |
| `gemini-analyze-url` | URL 분석 | Pro/Flash |
| `gemini-compare-urls` | URL 비교 | Pro/Flash |
| `gemini-extract-from-url` | URL 데이터 추출 | Pro/Flash |

### 4.7 유틸리티
| Tool | 기능 | 모델 |
|------|------|------|
| `gemini-run-code` | Python 코드 실행 | Pro |
| `gemini-count-tokens` | 토큰 수 계산 | Pro/Flash |
| `gemini-create-cache` | 컨텍스트 캐시 생성 | - |
| `gemini-query-cache` | 캐시된 컨텍스트 쿼리 | Pro/Flash |
| `gemini-list-caches` | 캐시 목록 | - |
| `gemini-delete-cache` | 캐시 삭제 | - |

---

## 5. 주요 구현 패턴

### 5.1 출력 파일 관리 (`src/utils/output-dir.ts`)

```
우선순위:
1. GEMINI_OUTPUT_DIR 환경변수
2. 플랫폼 기본값 + 프로젝트별 해시
   - macOS/Linux: ~/.config/gemini-mcp/output/<project-hash>
   - Windows: %APPDATA%/gemini-mcp/output/<project-hash>

프로젝트 해시 = SHA-256(git 루트 경로).substring(0, 16)
```

### 5.2 로깅 (`src/utils/logger.ts`)

- **stderr 출력** — stdio MCP 환경에서 stdout은 JSON-RPC 전용이므로 모든 로그를 stderr로
- 3단계: `quiet` / `normal` / `verbose`
- `prompt()`와 `response()` 메서드로 LLM 입출력 전용 로깅

### 5.3 CLI 설정 (`src/cli/config.ts`)

- 설정 파일: `~/.config/gemini-cli/config.json`
- Bun 파일 API 사용 (`Bun.file()`, `Bun.write()`)
- 기본값: theme=terminal, outputDir=~/Downloads, voice=Kore, imageSize=2K

### 5.4 CLI UI (`src/cli/ui/`)

- 5종 테마: terminal, neon, ocean, forest, minimal
- 컴포넌트: box, colors, progress, spinner, theme
- ANSI 색상 코드 사용 (의존성 없음)

### 5.5 비디오 생성 비동기 처리

```
startVideoGeneration()
├─ genAI.models.generateVideos() 호출
├─ operation 객체를 Map에 저장
└─ operationName 반환

checkVideoStatus()
├─ Map에서 operation 객체 조회
├─ genAI.operations.getVideosOperation() 폴링
├─ 완료 시 비디오 다운로드 (fetch + API key 헤더)
└─ 파일로 저장
```

### 5.6 Deep Research 비동기 처리

```
startDeepResearch()
├─ genAI.interactions.create() 호출 (background: true)
├─ Interactions API 사용
└─ interaction ID 반환

checkDeepResearch()
├─ genAI.interactions.get() 폴링
├─ 완료 시 output_text 또는 steps에서 텍스트 추출
└─ 전체 응답을 JSON 파일로 저장
```

### 5.7 프록시 지원 (`src/index.ts`)

- `HTTP_PROXY` / `HTTPS_PROXY` 환경변수 감지
- undici `ProxyAgent`를 전역 dispatcher로 주입
- Node.js 내장 fetch (undici 기반)가 프록시를 자동 사용하도록 설정

---

## 6. 설정 파일 비교

### our google-genai-mcp vs gemini-mcp

| 항목 | our spec | gemini-mcp |
|------|----------|------------|
| MCP 전송 | stdio only | stdio only |
| CLI 명령어 | `gemini image/video/audio` | `gcli query/image/video/speak` |
| YAML 입력 | ✅ (파일 기반) | ❌ (인라인 파라미터만) |
| 이미지 모델 | gemini-3.1-flash-image | gemini-3-pro-image-preview |
| 비디오 모델 | veo-3.1-generate-preview | veo-2.0-generate-001 |
| Audio 모델 | gemini-3.1-flash-tts-preview | gemini-2.5-flash-preview-tts |
| 멀티턴 편집 | 미구현 | ✅ (start/continue/end) |
| Deep Research | 미구현 | ✅ (Interactions API) |
| 코드 실행 | 미구현 | ✅ (Python) |
| 웹 검색 | 미구현 | ✅ (Grounding) |
| 컨텍스트 캐시 | 미구현 | ✅ |
| YouTube 분석 | 미구현 | ✅ |
| 문서 분석 | 미구현 | ✅ |
| 출력 위치 | `~/.local/share/google-genai-mcp/` | `~/.config/gemini-mcp/output/<hash>` |
| 로깅 | 파일 기반 (YAML 포맷) | stderr (3단계) |
| 테스트 | vitest, 90%+ 목표 | vitest |
| 의존성 | `@modelcontextprotocol/sdk`, `@google/genai` | `@modelcontextprotocol/sdk`, `@google/genai`, `undici`, `zod`, `zod-to-json-schema` |

---

## 7. 핵심 설계 인사이트

### 7.1 Tool 등록 아키텍처
- **장점:** 그룹별 등록 → 프리셋으로 로딩 제어 → 메모리/컨텍스트 절약
- **구현:** `toolRegistrations` 맵 + `getEnabledToolGroups()` 필터링
- **우리 프로젝트 적용 가능:** tool-groups 패턴은 MCP tool 수가 많아질 때 유용

### 7.2 이미지 반환 방식
- **base64 인라인** — MCP tool response에 이미지 데이터 직접 포함
- **장점:** Claude가 이미지를 바로 볼 수 있음
- **단점:** 대용량 시 프레임 크기 초과 리스크
- **우리 ASR-006과 비교:** 우리는 "파일 경로 반환" 채택 (base64 인라인 미사용)

### 7.3 CLI + MCP 통합
- 단일 엔트리포인트에서 CLI/MCP 분기
- `bin` 필드로 두 가지 명령어 등록 (`gemini-mcp`, `gcli`)
- **장점:** 배포 단순화, 코드 재사용
- **단점:** CLI 의존성 (Bun)이 MCP 서버에도 영향

### 7.4 비동기 작업 처리
- **Video:** `generateVideos()` → operation Map 저장 → `getVideosOperation()` 폴링
- **Deep Research:** `interactions.create(background=true)` → `interactions.get()` 폴링
- **둘 다:** 클라이언트가 상태를 폴링하는 패턴 (서버가 푸시하지 않음)

### 7.5 Gemini API 사용 패턴

```typescript
// 텍스트 생성
genAI.models.generateContent({ model, contents, config })

// 이미지 생성
genAI.models.generateContent({
  model: imageModel,
  contents: prompt,
  config: {
    responseModalities: [Modality.TEXT, Modality.IMAGE],
    imageConfig: { aspectRatio, imageSize },
    thinkingConfig: { thinkingLevel },
  }
})

// 비디오 생성
genAI.models.generateVideos({ model, prompt, config })

// Deep Research
genAI.interactions.create({ input, agent, background: true })

// 토큰 카운트
genAI.models.countTokens({ model, contents })
```

---

## 8. 참고사항

1. **모델 버전 차이:** gemini-mcp는 Gemini 3 Pro/Flash preview, Nano Banana Pro, Veo 2.0 사용. 우리의 Spec은 Gemini 3.1 모델을 목표로 함
2. **zod 사용:** gemini-mcp는 MCP tool schema를 zod로 정의하고 `zod-to-json-schema`로 변환. 우리도 유사한 패턴 적용 가능
3. **Bun 의존성:** CLI 설정에서 `Bun.file()`, `Bun.write()` 사용. Node.js 환경에서는 `fs`로 대체 필요
4. **MCP Registry:** `server.json`으로 MCP Registry에 등록. 프로젝트 메타데이터 정의
5. **재연결 로직:** MCP transport close 시 지수 백오프로 재연결 시도 (최대 5회)
