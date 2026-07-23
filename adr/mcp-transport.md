# MCP 서버 전송 방식

## Concern
Google Gemini MCP 서버의 전송 방식은 stdio, HTTP(SSE), 또는 둘 다 지원할지 결정해야 한다.

## Status
approved

## Context
- google-genai-mcp 프로젝트는 Google Gemini API 기능을 MCP(Model Context Protocol)로 제공한다
- MCP 사양은 두 가지 주요 전송 방식을 지원: stdio (표준 입출력)와 HTTP (Server-Sent Events)
- 전송 방식 선택은 에이전트 호환성, 배포 모델, 사용자 접근 방식에 직접 영향
- 현재 주요 MCP 클라이언트(OpenCode, Claude Desktop, VS Code 등)의 지원 현황을 고려해야 한다

## Decision
**Option A — stdio 전용**
사용자 승인: 로컬 프로세스 기반 stdio 전송으로 MCP 서버 구현. 네트워크 인프라 없이 에이.stdin/stdout으로 JSON-RPC 통신.

## Options

### Option A — stdio 전용
- MCP 서버를 로컬 프로세스로 실행하고, stdin/stdout으로 JSON-RPC 통신
- 프로세스 생명주기는 클라이언트가 관리 (시작/종료)

**Pro:**
- 구현이 단순 (HTTP 서버 인프라 불필요)
- 보안이 쉬움 (네트워크 포트 노출 없음)
- 대부분의 MCP 클라이언트가 기본 지원
- 로컬 환경에서 즉시 사용 가능

**Con:**
- 원격 접근 불가 (같은 머신에서만 사용 가능)
- 여러 클라이언트가 동시에 접근 불가 (프로세스 1:1)
- 서버리스/컨테이너 배포 시 추가 래퍼 필요

### Option B — HTTP (SSE) 전용
- MCP 서버를 HTTP 서버로 실행하고, Server-Sent Events로 스트리밍 통신
- REST 엔드포인트 + SSE 스트림 조합

**Pro:**
- 원격 접근 가능 (다른 머신에서 접속)
- 여러 클라이언트 동시 접근 지원
- 컨테이너/서버리스 배포에 적합
- 웹 기반 에이전트와 통합 용이

**Con:**
- 구현 복잡도 증가 (HTTP 서버, CORS, TLS 등)
- 보안 고려사항 증가 (인증, 포트 관리)
- 모든 MCP 클라이언트가 HTTP를 지원하지 않을 수 있음
- 인프라 설정 필요

### Option C — 둘 다 지원 (Dual Transport)
- stdio와 HTTP를 모두 지원하고, 환경변수 또는 설정으로 전환
- 기본은 stdio, HTTP는 선택적 활성화

**Pro:**
- 최대 유연성: 로컬 사용자도, 원격 에이전트도 접근 가능
- 점진적 마이그레이션 가능
- 다양한 배포 시나리오 대응

**Con:**
- 구현 복잡도 최대 (두 가지 전송 계층)
- 테스트 매트릭스 증가
- 코드베이스 유지보수 부담

## Tradeoffs

| | stdio 전용 (A) | HTTP 전용 (B) | 둘 다 지원 (C) |
|---|---|---|---|
| **구현 복잡도** | 낮음 | 중간 | 높음 |
| **보안** | 쉬움 (로컬만) | 인증 필요 | 둘 다 관리 |
| **에이전트 호환성** | 높음 (기본 지원) | 선택적 | 최대 |
| **원격 접근** | 불가 | 가능 | 가능 |
| **동시 접근** | 불가 (1:1) | 가능 | 가능 |
| **배포 유연성** | 낮음 | 높음 | 최대 |
| **유지보수** | 쉬움 | 중간 | 어려움 |

## Recommendation
- **MVP阶段: Option A (stdio 전용)** 추천
  - 대부분의 MCP 클라이언트가 stdio를 기본 지원
  - 구현이 단순하고 보안이 쉬움
  - 빠른 프로토타이핑과 검증 가능
- **이후 확장: Option C로 확장 가능**
  - stdio로 먼저 안정화 후 HTTP 지원 추가
  - 환경변수 `MCP_TRANSPORT=stdio|http|both`로 전환

## Consequences

### stdio 전용 채택 시:
- 로컬 개발 및 에이전트 통신에 최적화
- 원격 접근이 필요한 경우 별도 프록시/터널 솔루션 필요
- 향후 HTTP 지원 추가 시 코드 리팩토링 필요

### HTTP 전용 채택 시:
- 인증 메커니즘 (API 키, OAuth 등) 구현 필수
- HTTPS/TLS 설정 필요
- 일부 MCP 클라이언트와 호환성 문제 가능성

### 둘 다 지원 시:
- 추후 확장성은 높지만, 초기 개발 비용 증가
- 각 전송 계층별 테스트 코드 필요

## Related ASRs
- ASR-001 — MCP 전송 방식 — 이 ADR가 직접 다루는 아키텍처 결정

## Downstream Concerns
- [ ] **CLI 포함 여부:** MCP 전용으로 갈지, CLI도 함께 제공할지 결정 (사용자가 이전에 질문)
- [ ] **패키징 구조:** 단일 패키지인지, monorepo로 분리할지 결정
- [ ] **Gemini API 기능 범위:** MVP에 포함할 기능 정의 (텍스트 생성, 멀티모달, 코드 생성 등)

## Related
- MCP 사양: https://spec.modelcontextprotocol.io
- TypeScript MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk

## Tags
`mcp`, `transport`, `architecture`, `typescript`

## Approved
- 2026-07-23: Option A (stdio 전용), 사용자 승인
