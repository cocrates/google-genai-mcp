# MCP 프로토콜: 비동기 처리 메커니즘

> 조사일: 2026-07-23
> 상태: MCP 2026-07-28 Release Candidate 기준

## MCP 통신 모델

MCP는 **JSON-RPC 2.0** 기반의 요청-응답 프로토콜입니다.

```
[클라이언트]                    [서버]
    │                              │
    ├── Request (method, params) ─►│
    │                              │
    │ ◄── Response (result/error) ─┤
```

**핵심:** 요청에 대한 응답이 하나만 옵니다. notification은 예외입니다.

## 요청 유형

| 유형 | 설명 | 응답 |
|------|------|------|
| **Request** | 클라이언트 → 서버 요청 | Response 1개 |
| **Notification** | 일방향 메시지 | 응답 없음 |

## tools/call의 동작

```
[에이전트]                     [MCP 서버]
    │                              │
    │  tools/call 요청             │
    ├─────────────────────────────►│
    │                              │
    │  (서버가 작업 수행)           │
    │                              │
    │  tools/call 응답             │
    │◄─────────────────────────────┤
```

**블로킹 동작:** 클라이언트는 `tools/call` 응답을 받을 때까지 대기합니다.

## Progress Notifications

MCP 사양에서 지원하는 진행상황 전달 메커니즘입니다.

### 동작 원리

```
[에이전트]                     [MCP 서버]
    │                              │
    │  tools/call                  │
    │  + _meta.progressToken       │
    ├─────────────────────────────►│
    │                              │
    │  notifications/progress      │
    │  { progress: 30, ... }       │
    │◄─────────────────────────────┤
    │                              │
    │  notifications/progress      │
    │  { progress: 70, ... }       │
    │◄─────────────────────────────┤
    │                              │
    │  tools/call 응답             │
    │◄─────────────────────────────┤
```

### 메시지 구조

**요청 (진동상황 수신 요청):**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "generate_video",
    "arguments": { "prompt": "a cat playing" },
    "_meta": {
      "progressToken": "unique-token-123"
    }
  }
}
```

**notification (진행상황):**
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "unique-token-123",
    "progress": 50,
    "total": 100,
    "message": "비디오 생성 중..."
  }
}
```

### 제약사항

- `progressToken`은 요청당 고유해야 함
- `progress` 값은 매번 증가해야 함
- `total`은 선택 사항 (모를 수 있음)
- 서버가 notification을 보낼 수도, 안 보낼 수도 있음
- **notification은 응답이 아님** — 클라이언트가 별도로 처리

### LLM에 미치는 영향

**LLM은 progress notification을 보지 않습니다.**

```
MCP 클라이언트 라이브러리 → notification 수신 → 내부 처리
                                      ↓
                              호스트 앱 (표시 가능)
                                      ↓
                              LLM (전달 안 됨)
```

LLM의 컨텍스트에 포함되려면 호스트 앱이 별도로 주입해야 합니다.

## Tasks Extension (MCP 2026-07-28)

비동기 작업을 위한 공식 확장입니다.

### 동작 원리

```
[에이전트]                     [MCP 서버]
    │                              │
    │  tools/call + extension      │
    ├─────────────────────────────►│
    │                              │
    │  CreateTaskResult            │
    │  (즉시 반환: taskId)         │
    │◄─────────────────────────────┤
    │                              │
    │  tasks/get(taskId)           │
    ├─────────────────────────────►│
    │  status: working             │
    │◄─────────────────────────────┤
    │                              │
    │  tasks/get(taskId)           │
    ├─────────────────────────────►│
    │  status: completed           │
    │◄─────────────────────────────┤
    │                              │
    │  tasks/result(taskId)        │
    ├─────────────────────────────►│
    │  CallToolResult              │
    │◄─────────────────────────────┤
```

### 핵심 개념

| 개념 | 설명 |
|------|------|
| **Task** | 비동기 작업의 내구성 있는 핸들 |
| **taskId** | 작업 고유 식별자 (UUID) |
| **CreateTaskResult** | 즉시 반환되는 작업 생성 응답 |
| **tasks/get** | 작업 상태 폴링 |
| **tasks/result** | 완료된 작업의 최종 결과 조회 |
| **tasks/cancel** | 작업 취소 |

### 작업 상태

```
        ┌───────────┐
        │  working  │
        └─────┬─────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
completed  failed   cancelled
              │
              ▼
      input_required
    (사용자 입력 필요)
```

| 상태 | 의미 | 결과 조회 |
|------|------|----------|
| `working` | 실행 중 | 불가 |
| `completed` | 완료 | `tasks/result`로 가능 |
| `failed` | 실패 | 에러 정보 포함 |
| `cancelled` | 취소됨 | 불가 |
| `input_required` | 입력 필요 | `tasks/update`로 응답 |

### TypeScript SDK 지원

```typescript
// 서버 측 (tasksPlugin 사용)
import { tasksPlugin } from '@modelcontextprotocol/sdk';

mcp.use(tasksPlugin({ store: new InMemoryTaskStore() }));

// 클라이언트 측
const result = await client.callTool({ name: 'generate_video', arguments: {...} });

// CreateTaskResult인 경우
if (result.resultType === 'task') {
  const taskId = result.task.taskId;
  
  // 폴링
  while (true) {
    const status = await client.request({ method: 'tasks/get', params: { taskId } });
    if (status.status === 'completed') {
      const finalResult = await client.request({ method: 'tasks/result', params: { taskId } });
      break;
    }
    await sleep(status.pollIntervalMs || 5000);
  }
}
```

### 현재 지원 현황

| 항목 | 상태 |
|------|------|
| SEP-2663 (Tasks Extension) | 스펙에 병합 (2026-05-15) |
| TypeScript SDK | `tasksPlugin()` 구현 진행 중 |
| MCP 2026-07-28 사양 | 공식 확장으로 포함 (Release Candidate) |
| 안정화 | 아직 확정, 마이그레이션 필요 |

## Long-Running Operations (제안 단계)

Tasks와 유사하지만 별도로 제안된 비동기 메커니즘입니다.

### 주요 차이점

| 항목 | Tasks Extension | Long-Running Operations |
|------|----------------|------------------------|
| **상태** | 공식 확장 (병합) | 제안 단계 (SEP) |
| **폴링** | `tasks/get` | `tools/async/status` |
| **결과 조회** | `tasks/result` | `tools/async/result` |
| **추가 기능** | `input_required`, `tasks/update` | `keepAlive`, `pollFrequency` |

### 동작 원리

```typescript
// 1. 비동기 도구 호출
const asyncResponse = await client.request({
  method: "tools/call",
  params: {
    name: "expensive_analysis",
    arguments: { dataset: "large_file.csv" },
    operation: { keepAlive: 3600 }
  }
});

// 2. 상태 폴링
while (true) {
  const status = await client.request({
    method: "tools/async/status",
    params: { token: asyncResponse.operation.token }
  });
  
  if (status.status === "completed") {
    const result = await client.request({
      method: "tools/async/result",
      params: { token: asyncResponse.operation.token }
    });
    break;
  }
  await sleep(1000 * (asyncResponse.operation.pollFrequency || 1));
}
```

## 프로젝트 적용 전략

### MVP (지금 바로 구현 가능)

```
[요청] → MCP 서버에서 Interactions API 호출
  ↓
[progress notification] → MCP 클라이언트에 전달
  ↓
[tools/call result] → 폴링 완료 후 반환
```

- `background=true`: 즉시 반환 + 서버 측 폴링
- `progress notification`: 연결 유지 + 진행상황 전달
- **LLM에게는 결과만 전달**

### Tasks Extension 안정화 후

```
[요청] → CreateTaskResult (taskId 즉시 반환)
  ↓
[LLM] → tasks/get으로 폴링 (또는 다른 도구 호출)
  ↓
[완료] → tasks/result로 최종 결과
```

- LLM이 작업 상태를 직접 관리
- 다른 도구 호출과 병렬 가능
- 프로세스 복구 지원

## 참고 자료

- [MCP Progress Specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress)
- [MCP Tasks Extension](https://modelcontextprotocol.io/extensions/tasks/overview)
- [SEP-2663: Tasks Extension](https://github.com/modelcontextprotocol/specification/pull/2663)
- [TypeScript SDK Tasks PR](https://github.com/modelcontextprotocol/typescript-sdk/pull/2066)
- [MCP 2026-07-28 Release Candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
