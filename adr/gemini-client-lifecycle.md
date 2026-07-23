# Gemini API 클라이언트 생명주기 관리

## Concern
`@google/genai` SDK의 `GoogleGenAI` 인스턴스를 MCP 서버 프로세스와 CLI에서 어떻게 생성하고 관리할지 결정해야 한다. stdio 환경과 향후 HTTP/SSE 환경에서의 동시성 처리 방식도 포함한다.

## Status
approved

## Context
- `@google/genai` SDK는 `new GoogleGenAI({})`로 경량 초기화 가능 (네트워크 연결 없음)
- 환경변수 `GOOGLE_API_KEY`를 자동으로 읽거나, 옵션으로 직접 전달 가능
- stdio MCP 서버: 프로세스당 클라이언트 1개 (MCP 사양상 프로세스 격리)
- CLI: 프로세스 자체가 수명 (실행 → 종료)
- 향후 HTTP/SSE 전송 확장 시(ASR-001 deferred): 여러 클라이언트가 하나의 서버 프로세스에 동시 접속 가능

## Decision
**Option A — 싱글톤 (전역 인스턴스)**
서버 시작 시 1회 생성, 모든 tool call이 같은 인스턴스 사용. stdio 환경에서는 프로세스 격리로 동시성 문제 없음. HTTP/SSE 확장 시 연결 풀/동기화 메커니즘 추가.

## Options

### Option A — 싱글톤 (전역 인스턴스)
- 애플리케이션 시작 시 `GoogleGenAI` 인스턴스를 1회 생성하고 전역으로 공유
- stdio: 프로세스당 1개 → 동시성 문제 없음
- CLI: 프로세스 수명 = 인스턴스 수명 → 자연스러운 싱글톤
- Pro: 구현 단순, 상태 관리 용이, 메모리 효율
- Con: API 키 변경 시 프로세스 재시작 필요

### Option B — 요청별 생성
- 각 tool call마다 새 `GoogleGenAI` 인스턴스 생성
- Pro: 동적 키 변경 가능, 완전한 격리
- Con: 불필요한 객체 생성, 상태 공유 불가, 코드 복잡도 증가

### Option C — 요청별 생성 + 캐싱 (인스턴스 풀)
- 키별 인스턴스를 캐싱하고 재사용
- Pro: 동적 키 지원 + 재사용 효율
- Con: 캐시 관리 복잡도, 메모리 누수 리스크

## Tradeoffs

| | Option A (싱글톤) | Option B (요청별) | Option C (요청별+캐시) |
|---|---|---|---|
| **구현 복잡도** | 낮음 | 중간 | 높음 |
| **동시성 (stdio)** | 문제 없음 (프로세스 격리) | 문제 없음 | 문제 없음 |
| **동시성 (HTTP/SSE)** | 연결 풀 필요 (확장 시) | 자연적 격리 | 캐시 동기화 필요 |
| **메모리** | 최소 | 오버헤드 | 중간 |
| **상태 관리** | 단순 | 분산 | 분산 + 캐시 |
| **키 변경** | 재시작 필요 | 즉시 반영 | 캐시 무효화 |

## Recommendation
- **MVP (stdio): Option A (싱글톤)** — stdio는 프로세스 격리가 보장되므로 싱글톤이 가장 단순하고 효율적
- **HTTP/SSE 확장 시:** 연결 풀(concurrent connections 관리) 또는 워커 프로세스 모델로 전환 검토

## Consequences

### 싱글톤 채택 시:
- MCP 서버 시작 시 `GoogleGenAI` 인스턴스 1회 생성
- 환경변수 `GEMINI_API_KEY` 또는 ADC로 초기화
- API 키 변경은 프로세스 재시작으로 해결
- HTTP/SSE 확장 시: 연결 풀 또는 프로세스당 격리 모델 추가 필요

### 명시적으로 하지 않는 것:
- 요청별 인스턴스 생성
- 인스턴스 풀/캐싱
- 실시간 키 리로딩

## Related ASRs
- ASR-005 — Gemini API 클라이언트 통합 방식 — 이 ADR가 직접 다루는 아키텍처 결정
- ASR-001 — MCP 전송 방식 — stdio 결정이 싱글톤 유효성에 기여. HTTP/SSE 확장 시 재검토 필요

## Downstream Concerns
- [ ] **HTTP/SSE 확장 시 연결 풀 전략:** stdio 싱글톤을 HTTP 환경에서 어떻게 확장할지 (워커 프로세스? 연결 풀?)
- [ ] **인증 분기:** Gemini API (API key) vs Enterprise Agent Platform (ADC/project/location) 초기화 분기 처리
- [ ] **에러 복구 시 클라이언트 상태:** 네트워크 오류 후 클라이언트 재초기화 필요 여부

## Related
- `@google/genai` SDK 문서: https://googleapis.github.io/js-genai/release_docs/
- `adr/mcp-transport.md` — stdio 결정이 이 ADR의 전제 조건

## Tags
`gemini-api`, `client`, `singleton`, `lifecycle`, `concurrency`

## Approved
- 2026-07-23: Option A (싱글톤), 사용자 승인
