# 프로젝트 아키텍처 영향 분석

> 조사일: 2026-07-23
> 대상: google-genai-mcp 프로젝트의 ASR에 미치는 영향

## API 전략 결정

| 구분 | API | 용도 |
|------|-----|------|
| **기본** | Interactions API | 단일 이미지/비디오 생성 (background=true) |
| **대량** | generateContent + Batch API | 대량 생성 (50% 비용 절감) |

## ASR별 영향 분석

### ASR-005: Gemini API 클라이언트 통합 방식

**변경점:**
- `GoogleGenAI` 인스턴스 하나로 두 API 모두 지원
- Interactions API: `ai.interactions.create()`
- Batch API (향후): `ai.batches.create()` (generateContent 경유)

**구조:**
```typescript
const ai = new GoogleGenAI({}); // 싱글톤

// Interactions API (기본)
await ai.interactions.create({ model, input, background: true });

// Batch API (대량 생성, generateContent 경유)
// await ai.batches.create({ model, src: requests }); // 향후 지원 시
```

### ASR-006: 바이너리 출력 처리

**변경점:**
- 산출물이 서버에 보관됨 (55일, 유료)
- 로컬 저장은 선택 사항 (백업/오프라인용)

**출력 흐름:**
```
[서버 보관] ← 기본 (55일)
     ↓
[로컬 저장] ← 사용자 요청 시 (파일 경로 반환)
```

**출력 위치:**
- 기본값: 현재 작업 디렉토리
- 사용자 지정: `--output-dir` 파라미터

### ASR-011: 비디오 생성 시간 초과 처리

**변경점:**
- Interactions API `background=true`로 근본적 해결
- 타임아웃 설계 불필요 (서버가 비동기 처리)

**흐름:**
```
[요청] → interactions.create({background: true}) → 즉시 ID 반환
[폴링] → interactions.get(id) → 5초마다 상태 확인
[완료] → status: completed → 결과 저장
```

### ASR-007: 오류 처리 및 복구 전략

**추가 고려사항:**
- Interactions API 상태 머신에 따른 오류 분류
- `failed` 상태 시 에러 정보 접근
- `requires_action` 상태 시 사용자 입력 필요

**오류 분류:**
| 상태 | 의미 | 처리 |
|------|------|------|
| `failed` | 실행 실패 | 에러 로그, 재시도 안내 |
| `requires_action` | 사용자 입력 필요 | MCP에서 에이전트에 요청 |
| `cancelled` | 사용자 취소 | 로컬 상태 정리 |

### ASR-013: 파일 기반 입력 지원

**MVP에서 더 중요해짐:**
- Batch API 사용 시 JSONL 파일 입력 필수
- 긴 프롬프트는 파일로 관리

**지원 방식:**
| 구분 | CLI | MCP |
|------|-----|-----|
| **단일 요청** | `--prompt-file prompt.txt` | `promptFilePath` 파라미터 |
| **배치 요청** | `batch image requests.jsonl` | MCP tool로 직접 호출 |

## 새 ASR 후보

### ASR-014: API 이중 체계 관리

| 항목 | 내용 |
|------|------|
| **Category** | Integration & dependencies |
| **Statement** | Interactions API를 기본으로 사용하되, Batch API가 필요한 경우 generateContent로 분기하는 구조 결정 |
| **Why it matters** | 두 API의 초기화, 호출 방식, 결과 처리가 다름 |
| **Depends on** | ASR-005 |

### ASR-015: 산출물 보관 전략

| 항목 | 내용 |
|------|------|
| **Category** | Structure & organization |
| **Statement** | 서버 보관(55일)과 로컬 저장의 관계를 결정 |
| **Why it matters** | 서버 보관만으로 충분할지, 로컬 백업이 필요한지 결정 필요 |
| **Depends on** | ASR-006 |

### ASR-016: 출력 파일 위치 관리

| 항목 | 내용 |
|------|------|
| **Category** | Deliverable form |
| **Statement** | 생성된 파일의 기본 저장 위치와 사용자 지정 방식 결정 |
| **Why it matters** | 사용자 기대치와 CLI/MCP 일관성에 영향 |
| **Depends on** | ASR-002, ASR-006 |

### ASR-017: 백그라운드 실행 모드

| 항목 | 내용 |
|------|------|
| **Category** | Structure & organization |
| **Statement** | `background` 파라미터로 요청의 동기/비동기 동작을 결정 |
| **Why it matters** | 이미지(수 초)와 비디오(수분)의 처리 시간 차이가 큰 동작 방식 결정 |
| **Depends on** | ASR-004, ASR-011 |

**설계:**
- `background=false` (기본, image): 결과 완료까지 대기 후 반환
- `background=true` (기본, video): 즉시 interaction ID 반환, 서버 측 폴링
- 사용자가 명시적으로 오버라이드 가능

## 의존성 업데이트

```
ASR-001 (MCP 전송) — designed
  └─ ASR-005 (Gemini API 통합) — designed
       ├─ ASR-006 (바이너리 출력) — designed
       │    └─ ASR-015 (산출물 보관 전략) — 새 후보
       ├─ ASR-014 (API 이중 체계) — 새 후보
       ├─ ASR-011 (비디오 timeout) — identified
       │    └─ ASR-017 (백그라운드 실행 모드) — 새 후보
       └─ ASR-017 (백그라운드 실행 모드)
  └─ ASR-013 (파일 기반 입력) — identified
       └─ ASR-016 (출력 파일 위치) — 새 후보
```
