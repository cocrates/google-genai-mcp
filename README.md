# @cocrates/google-genai-mcp

Google Gemini API의 **Image / Video / Speech(TTS) / Music 생성**과 **미디어 이해(analyze)** 를 [MCP](https://modelcontextprotocol.io) 서버와 CLI로 제공하는 TypeScript 패키지입니다.

에이전트(OpenCode, Claude Desktop, Cursor 등)는 MCP 도구로, 개발자는 터미널에서 YAML/JSON 요청 파일로 동일한 생성·관리 흐름을 사용할 수 있습니다.

| | |
|---|---|
| **패키지** | `@cocrates/google-genai-mcp` |
| **바이너리** | `google-genai-mcp` (MCP), `gemini` (CLI) |
| **런타임** | Node.js 18+ |
| **인증** | `GEMINI_API_KEY` |
| **전송** | MCP stdio (JSON-RPC) |

상세 사양: [`spec/google-genai-mcp.md`](./spec/google-genai-mcp.md) · PRD: [`spec/PRD.md`](./spec/PRD.md)

---

## 기능 요약

- **Image** — Nano Banana (`gemini-3.1-flash-image` 등)
- **Video** — Gemini Omni Flash (`gemini-omni-flash-preview`), Interactions API, 기본 백그라운드 실행
- **Speech** — Gemini TTS (단일·다중 화자, 음성 30종)
- **Music** — Lyria 3 Clip / Pro (`lyria-3-clip-preview`, `lyria-3-pro-preview`)
- **Analyze** — image/audio/video 이해 (`analyze` → `{ interactionId, text }`, 기본 `gemini-3.5-flash`)
- Interactions API 기반 `interactionId` 관리, multi-turn 이어가기
- 생성 요청은 YAML/JSON 파일로 선언 (상대 경로는 요청 파일 디렉터리 기준)

---

## MCP 서버

진입점: `google-genai-mcp` (stdio)

### 도구

| Tool | 설명 |
|------|------|
| `generate` | YAML/JSON **파일 1개**로 생성 → `{ interactionId, files, background }` |
| `analyze` | 미디어 이해 → `{ interactionId, text }` (`inputs`+`prompt`, 선택 `model`) |
| `download` | 완료된 interaction 산출물 저장 (미완료 시 즉시 에러) |
| `get_interaction` | 상태 조회 (서버에 없으면 로컬 매핑 정리) |
| `continue_interaction` | `previous_interaction_id`로 이어가기 (생성·분석 공통) |
| `list_interactions` | 로컬 목록 + 서버 상태 |
| `sync_interactions` | 서버에 없는 로컬 항목 제거 |
| `cancel_interaction` / `delete_interaction` | 취소 / 삭제 |

여러 파일을 생성하려면 클라이언트가 `generate`를 여러 번(또는 병렬로) 호출합니다.

### 클라이언트 설정 예시 (Claude Desktop / Cursor)

```json
{
  "mcpServers": {
    "google-genai": {
      "command": "npx",
      "args": ["-y", "@cocrates/google-genai-mcp"],
      "env": {
        "GEMINI_API_KEY": "your-api-key"
      }
    }
  }
}
```

로컬 빌드본을 쓰려면 `command`를 `node`, `args`를 `["/path/to/google-genai-mcp/dist/mcp/index.js"]`로 지정하면 됩니다.

---

## CLI

진입점: `gemini` — 형태: `gemini <command> [args…] [--verbose] [--force]`

```bash
# 생성
gemini generate ./images/*.yaml
gemini generate a.yaml b.yaml --verbose --force

# 분석 (prompt: -p 또는 stdin; 빈 prompt면 취소)
gemini analyze ./out/clip.mp4 -p "의도대로 나왔는지 평가해 줘"
echo "3문장으로 요약" | gemini analyze ./photo.png

# 관리 (대상은 interactionId)
gemini list
gemini show <interactionId>
gemini download <interactionId> [path]
gemini help

# 인터랙티브 모드 (명령 없음)
gemini
```

### 인라인 명령

| 명령 | 설명 |
|------|------|
| `generate <files…>` | YAML/JSON 생성 |
| `analyze <files…>` | 미디어 분석 → text + interactionId |
| `download` / `list` / `show` / `status` / `sync` / `cancel` / `delete` | interaction 관리 |
| `help [command]` | 도움말 (MCP tool 설명과 정합) |

### 인터랙티브 명령

| 명령 | 설명 |
|------|------|
| `/list` | interaction 목록 |
| `/select N` | N번째 선택 |
| `/show` | 원본 요청 YAML 표시 |
| `/status` | 서버 상태 |
| `/download [path]` | 산출물 저장 |
| `/sync` | 로컬↔서버 동기화 |
| `/cancel` / `/delete` | 취소 / 삭제 |
| (일반 텍스트) | 선택된 interaction에 이어가기 |

Video 등 비동기 작업은 progress를 출력하며 대기합니다. **시간 상한은 없고**, `Ctrl-C`로 중단할 수 있습니다.

### 요청 파일 예시

```yaml
type: image
model: gemini-3.1-flash-image
params:
  prompt: |
    A red circle on a white background
  size: 1K
  aspectRatio: "1:1"
output: "./output/circle.png"
```

`type`은 `image` | `video` | `speech` | `music`입니다. 스키마 전체는 스펙 문서를 참고하세요.

---

## 설치

```bash
# 전역
npm install -g @cocrates/google-genai-mcp

# 또는 npx
npx @cocrates/google-genai-mcp   # MCP
npx -y --package=@cocrates/google-genai-mcp gemini generate ./request.yaml
```

```bash
export GEMINI_API_KEY=your-api-key
```

---

## 로컬 개발 · 테스트

### 준비

```bash
git clone <repo-url>
cd google-genai-mcp
npm install
npm run build
export GEMINI_API_KEY=your-api-key
```

### 스크립트

| 명령 | 설명 |
|------|------|
| `npm run build` | TypeScript → `dist/` |
| `npm run dev` | `tsc --watch` |
| `npm test` | vitest |
| `npm run start:mcp` | MCP 서버 (stdio) |
| `npm run start:cli` | CLI 엔트리 |

### 로컬에서 CLI / MCP 실행

```bash
# CLI
node dist/cli/index.js ./images/kwon-su-a.yaml --verbose
node dist/cli/index.js   # interactive

# MCP (클라이언트가 stdin/stdout으로 붙는 용도)
node dist/mcp/index.js
```

개발 중 MCP 클라이언트에는 빌드된 절대 경로를 등록하세요.

```json
{
  "command": "node",
  "args": ["/ABS/PATH/google-genai-mcp/dist/mcp/index.js"],
  "env": { "GEMINI_API_KEY": "..." }
}
```

코드 수정 후 `npm run build`(또는 `npm run dev`)로 `dist/`를 갱신한 뒤 클라이언트를 재시작하면 됩니다.

### 수동 스모크 체크리스트

1. `gemini`로 image YAML 생성 → `interactionId` + 파일 경로 확인  
2. video YAML → `generate` 완료 후 파일 경로 확인 (필요 시 `background: true` + `/status` · `/download`)  
3. MCP `generate` → (async면) `get_interaction` → `download`  
4. `/sync`, `/cancel`, `/delete` 동작 확인  

단위·통합 테스트는 `npm test`로 실행합니다 (vitest).

---

## GitHub Release · npm 배포

패키지 이름: **`@cocrates/google-genai-mcp`** (scoped). npm에 퍼블리시하려면 해당 scope 권한이 필요합니다.

### 1. 버전 올리기

```bash
npm version patch   # 0.1.0 → 0.1.1
# 또는 minor / major
npm run build
```

### 2. npm 배포

```bash
npm login
npm publish --access public
```

`files` 필드에 `dist`, `README.md`, `LICENSE`만 포함되므로 **publish 전에 반드시 `npm run build`** 하세요. (`dist/`는 gitignore일 수 있습니다.)

### 3. GitHub Release

```bash
git push origin main --follow-tags

gh release create v0.1.1 \
  --title "v0.1.1" \
  --notes "$(cat <<'EOF'
## Changes
- …

## Install
npm install -g @cocrates/google-genai-mcp@0.1.1
EOF
)"
```

태그/릴리스는 `npm version`이 만든 git tag와 버전을 맞추면 됩니다.

### 권장 순서

1. PR 머지 → `main`  
2. `npm version` + `npm run build` + `npm publish`  
3. `git push --follow-tags` + `gh release create`  

CI에서 publish하려면 Node 18+, `NPM_TOKEN`, (선택) `GITHUB_TOKEN`을 시크릿으로 두면 됩니다.

---

## Examples

`examples/` 디렉터리에는 실제 Gemini 모델을 사용한 생성 파이프라인 예시가 포함되어 있습니다. 각 YAML 파일은 하나의 생성 작업을 정의하며, `output/` 디렉터리에 결과물이 저장됩니다.

### 개요

| # | 파일 | 유형 | 출력 | 설명 |
|---|------|------|------|------|
| 1 | `kwon-su-a.yaml` | Image | `kwon-su-a.png` | 기본 캐릭터 레퍼런스 시트 생성 |
| 2 | `kwon-su-a-cafe.yaml` | Image | `kwon-su-a-cafe.png` | 카페 장면 생성 + 변형 이미지들 |
| 3 | `conversation.yaml` | Speech | `conversation.wav` | 수아와 친구의 전화 대화 TTS |
| 4 | `cafe-bgm.yaml` | Music | `cafe-bgm.mp3` | 카페 배경 음악 |
| 5 | `cafe-video.yaml` | Video | `cafe-video.mp4` | 카페 장면 생생한 영상 |

### 상세 설명

#### 1. 캐릭터 레퍼런스 시트 (`kwon-su-a.yaml`)

> Image (`gemini-3.1-flash-image`) → `kwon-su-a.png`

"권수아"라는 22세 한국 여성 캐릭터의 기본 레퍼런스 이미지를 생성합니다. 클린 스튜디오 배경에서 전신 포즈로, 의상·헤어·체형 등 캐릭터 일관성의 기준점이 됩니다.

```bash
gemini generate examples/kwon-su-a.yaml
```

#### 2. 카페 장면 + 변형 (`kwon-su-a-cafe.yaml`)

> Image (`gemini-3.1-flash-image`) → `kwon-su-a-cafe.png` (기본) + 변형 이미지 3종

기본 레퍼런스 이미지를 참조하여 카페 장면으로 변환합니다. 의상(오프화이트 크로켓 가디건 + 블랙 미니 스커트), 배경(카페 인테리어), 포즈(카페 테이블에 앉아 커피잔을 든 모습)를 변경합니다.

**변형 이미지 (edit):**

| 출력 | 변경 내용 |
|------|-----------|
| `kwon-su-a-cafe0.png` | 카페 장면 기본 |
| `kwon-su-a-cafe1.png` | 가방 색상 변경 |
| `kwon-su-a-cafe2.png` | 치마 색상 변경 |
| `kwon-su-a-cafe3.png` | 액세서리(시계, 반지) 추가 |

기본 장면을 생성한 뒤, edit 기능으로 세부 요소를 순차적으로 변형하는 예시입니다.

```bash
# 기본 카페 장면 생성
gemini generate examples/kwon-su-a-cafe.yaml
```

#### 3. 친구와 전화하는 장면

`kwon-su-a-cafe.yaml`의 프롬프트를 수정하여 카페에 앉아 전화로 친구와 수다 떠는 장면으로 변경합니다. 기존 커피잔 포즈 대신 스마트폰을 귀에 대고 대화하는 자연스러운 모습을 연출합니다.

#### 4. 전화 대화 TTS (`conversation.yaml`)

> Speech (`gemini-3.1-flash-tts-preview`) → `conversation.wav`

수아가 여름 방학 유럽 여행을 자랑하고, 친구가 부러워하는 30초짜리 한국어 전화 대화를 생성합니다. 두 명의 화자(수아: `Laomedeia`, 친구: `Callirrhoe`)가 자연스러운 반말로 대화합니다.

**대화 내용 요약:**
- 수아: 유럽 여행(파리, 이탈리아) 계획 자랑
- 친구: 부러워하는 반응, 알바 이야기
- 분위기: 경쾌하고 장난스러운 친구 간 통화

```bash
gemini generate examples/conversation.yaml
```

#### 5. 카페 배경 음악 (`cafe-bgm.yaml`)

> Music (`lyria-3-clip-preview`) → `cafe-bgm.mp3`

카페에서 흘러나오는 듯한 Lo-fi 재즈/Bossa Nova 스타일의 30초 배경 음악을 생성합니다. 어쿠스틱 기타, Fender Rhodes 피아노, 브러시 드럼이 어우러진 따뜻하고 편안한 트랙입니다.

```bash
gemini generate examples/cafe-bgm.yaml
```

#### 6. 카페 영상 (`cafe-video.yaml`)

> Video (`gemini-omni-flash-preview`) → `cafe-video.mp4`

카페 장면 이미지(`kwon-su-a-cafe.png`)를 시작 프레임으로 사용하여, 수아가 전화로 친구와 수다 떠는 8초 영상을 생성합니다. 자연스러운 손동작과 표정 변화, 카페 배경의 미세한 움직임이 포함됩니다.

- **작업 유형**: `image_to_video` (참조 이미지 1장 → 런타임 추론)
- **연출**: 원 컨티뉴어스 샷, 헤ンド홀드 카메라 드리프트
- **오디오**: Lo-fi 재즈 배경음악 + 카페 백색소음

```bash
gemini generate examples/cafe-video.yaml
```

### 전체 파이프라인 실행 순서

```
1. kwon-su-a.yaml           → kwon-su-a.png         (캐릭터 레퍼런스)
2. kwon-su-a-cafe.yaml      → kwon-su-a-cafe.png    (카페 장면)
3. (edit)                   → cafe0~3.png            (변형 이미지)
4. conversation.yaml        → conversation.wav       (전화 대화)
5. cafe-bgm.yaml            → cafe-bgm.mp3          (배경 음악)
6. cafe-video.yaml          → cafe-video.mp4         (카페 영상)
```

---

## Cocrates로 개발됨

이 프로젝트는 **[Cocrates](https://cocrates.ai)** agent harness로 개발되었습니다.

요구 명세 → 아키텍처 결정(ADR/ASR) → 사양 작성 → 구현까지의 대화·결정은 [`PROMPTS.md`](./PROMPTS.md)에 정리되어 있습니다.

관련 산출물:

- `spec/PRD.md`, `spec/ASR.md`, `spec/google-genai-mcp.md`
- `adr/` — MCP 전송, 클라이언트 생명주기, CLI/MCP 엔트리포인트 등

---

## 라이선스

[Apache-2.0](./LICENSE)
