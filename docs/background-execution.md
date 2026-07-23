# 백그라운드 실행 (Background Execution)

> 조사일: 2026-07-23

## 개요

Interactions API의 `background=true` 옵션은 장시간 작업을 서버에서 비동기로 실행합니다. 연결 타임아웃 없이 결과를 폴링하거나 스트리밍할 수 있습니다.

## 동작 원리

```
[클라이언트]                    [서버]
    │                              │
    ├── interactions.create ──────►│
    │   { background: true }       │
    │                              │
    │ ◄── interaction ID 즉시 반환─┤
    │                              │
    │    (서버에서 비동기 실행)      │
    │                              │
    ├── interactions.get(id) ─────►│
    │ ◄── status: in_progress ────┤
    │                              │
    ├── interactions.get(id) ─────►│
    │ ◄── status: completed ──────┤
    │                              │
    │    (결과 사용)                │
```

## 상태 흐름

1. `interactions.create({ background: true })` → 즉시 `interaction.id` 반환
2. 서버에서 비동기 실행 시작 (`in_progress`)
3. `interactions.get(id)`로 상태 폴링
4. 완료 시 `completed` + 결과 접근 가능
5. 실패 시 `failed` + 에러 정보

## 사용 예시 (TypeScript)

```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({});

// 1. 백그라운드로 비디오 생성 시작
const interaction = await ai.interactions.create({
  model: 'gemini-2.5-flash-preview-04-17',
  input: 'Create a video of a cat playing piano',
  background: true,
});

console.log(`Interaction ID: ${interaction.id}`);

// 2. 폴링으로 상태 확인
let result = interaction;
while (result.status === 'in_progress') {
  await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 대기
  result = await ai.interactions.get(interaction.id);
  console.log(`Status: ${result.status}`);
}

// 3. 결과 처리
if (result.status === 'completed') {
  console.log('Video generation completed!');
  // result에서 산출물 접근
} else {
  console.log(`Failed with status: ${result.status}`);
}
```

## 스트리밍으로 진행상황 수신

```typescript
// 스트리밍 모드로 진행상황 확인
const stream = await ai.interactions.create({
  model: 'gemini-2.5-flash-preview-04-17',
  input: 'Create a sunset image',
  background: true,
  stream: true,
});

for await (const event of stream) {
  console.log(`Progress: ${event.type}`);
}
```

## 네트워크 중단 복구

스트리밍이 중단된 경우, `last_event_id`로 이어서 받을 수 있습니다:

```typescript
// 중단된 스트리밍 재개
const stream = await ai.interactions.create({
  model: 'gemini-2.5-flash-preview-04-17',
  input: 'Continue...',
  background: true,
  stream: true,
  lastEventId: 'last-received-event-id',
});
```

## 관리 작업

| 작업 | API | 비고 |
|------|-----|------|
| 상태 확인 | `interactions.get(id)` | polled |
| 실행 취소 | `interactions.cancel(id)` | status → cancelled |
| 삭제 | `interactions.delete(id)` | 404 반환 |

## 제약사항

- `background=true`는 `store=true`와만 호환
- `in_progress` 상태에서 `previous_interaction_id` 체인 시 400 에러 (완료 후 체인 가능)
- Managed Agent 사용 시 `environment` 파라미터 필요

## 참고 자료

- [Background Execution Guide](https://ai.google.dev/gemini-api/docs/background-execution)
- [Interactions API Overview](https://ai.google.dev/gemini-api/docs/interactions/interactions-overview)
