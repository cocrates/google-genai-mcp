# Gemini Interactions API

> 조사일: 2026-07-23
> 상태: GA (2026-06-22~), 권장 API

## 개요

Interactions API는 Gemini의 **새로운 표준 API**로, 2026년 6월 GA에 도달했습니다. `generateContent` API는 레거시로 간주되지만 계속 지원됩니다.

**핵심 특징:**
- 서버 측 상태 관리 (대화 기록, 실행 상태)
- 백그라운드 실행 (장시간 작업 비동기 처리)
- 산출물 데이터 보관 (55일, 유료)
- 에이전트/에이전틱 워크플로우 지원

## API 비교

| 항목 | Interactions API (권장) | generateContent (레거시) |
|------|----------------------|------------------------|
| **상태** | GA (2026-06) | 레거시, 지원 지속 |
| **서버 상태 관리** | `previous_interaction_id` | 없음 (클라이언트 관리) |
| **백그라운드 실행** | `background=true` | 없음 |
| **데이터 보관** | 기본 55일 (유료) | 없음 |
| **배치 API** | ❌ 미지원 | ✅ 지원 |
| **명시적 캐싱** | ❌ 미지원 (암묵적 캐싱은 가능) | ✅ 지원 |
| **Safety settings** | ❌ 미지원 | ✅ 지원 |

## 초기화

```typescript
import { GoogleGenAI } from '@google/genai';

// 환경변수 GOOGLE_API_KEY 자동 사용
const ai = new GoogleGenAI({});

// 또는 명시적 API 키
const ai = new GoogleGenAI({ apiKey: 'YOUR_API_KEY' });
```

## 핵심 개념: Interaction

Interaction은 대화나 작업의 **하나의 턴**을 나타내는 핵심 리소스입니다.

```
Interaction
├── id (고유 식별자)
├── status (in_progress | completed | failed | cancelled | requires_action)
├── steps (실행 단계 목록: thought, function_call, model_output 등)
├── user_input (사용자 입력)
└── model_output (모델 출력)
```

## 상태 머신

```
                 ┌─────────────┐
                 │ in_progress │
                 └──────┬──────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
    ┌───────────┐ ┌───────────┐ ┌──────────────┐
    │ completed │ │  failed   │ │   cancelled  │
    └───────────┘ └───────────┘ └──────────────┘
                        │
                        ▼
               ┌────────────────┐
               │ requires_action│ (사용자 입력 필요)
               └────────────────┘
```

## 데이터 보관

| 티어 | 보관 기간 | 비고 |
|------|----------|------|
| Paid Tier | 55일 | AI Studio에서 보관 기간 설정 가능 (7/14/28/55일) |
| Free Tier | 1일 | |

- `store=true` (기본): 서버에 보관, 상태 관리 기능 사용 가능
- `store=false`: 보관 안 함, `background=true`와 호환 안 됨
- `interactions.delete(id)`로 수동 삭제 가능
- 보관 기간 만료 시 자동 삭제

## 참고 자료

- [Interactions API Overview](https://ai.google.dev/gemini-api/docs/interactions/interactions-overview)
- [Background Execution](https://ai.google.dev/gemini-api/docs/background-execution)
- [Migration Guide](https://ai.google.dev/gemini-api/docs/migrate-to-interactions)
- [API Reference](https://ai.google.dev/api/interactions-api)

## SDK 제한사항

- `list()` 메서드 미지원 — interaction 목록을 직접 조회하는 공개 API 없음
- 지원 메서드: `create()`, `get(id)`, `cancel(id)`, `delete(id)`
- AI Studio UI에서는 logs 페이지에서 interaction 열람 가능
- 로컬 매핑(interactions.json)으로 목록 관리 필수
