# Speech Long-Form Chunking

## Concern
장문 Speech(TTS) 요청을 어떻게 분할 생성하고, 결과를 하나의 wav로 자연스럽게 이어붙일 것인가?

## Status
approved

## Context
- Gemini TTS는 수 분 이상 출력에서 품질·일관성 저하가 있고, 청크 분할을 권장한다.
- 현재 CLI speech는 `params.text` 전체를 **단일 동기** `createInteraction`으로 보낸다. 장문(예: `draw-with-ai.yaml` ~8k자)에서는 progress 없이 수 분~수십 분 대기하거나 체감상 “멈춤”이 된다.
- 생성 경로는 L16→WAV 래핑을 하지만, 다운로드 경로 버그는 별도로 수정됨. **이어붙이기 자체는 기술적으로 가능**하다.
- 프롬프트 관례상 `# SPEECH SYNTHESIS` / `AUDIO PROFILE` / `DIRECTOR'S NOTES` + `#### TRANSCRIPT` 본문이 한 `text`에 묶인다. 스타일 지시와 읽을 대본을 분리·재부착할 여지가 있다.
- ASR-018(TTS 지원)은 “포함 여부”만 결정했고, 장문 전략은 미정이다.

## Decision
**Option C — 길이 임계값 + 문장/문단 예산 분할**
임계값 미만은 기존처럼 단일 요청, 초과 시에만 문단→문장 경계로 나눠 순차 생성한 뒤 하나의 wav로 병합·저장. 스타일 프리앰블(`DIRECTOR'S NOTES` 등)은 낭독 대상이 아니므로 TRANSCRIPT 본문과 분리해 각 청크에 재부착한다.

> 2026-07-26 개정: 청크 사이 무음 삽입은 제거. 각 청크 오디오가 이미 앞뒤 무음을 포함해 추가 간격이 오히려 어색한 공백을 만들었다. 병합은 청크 PCM을 그대로 이어붙인다(간격 0ms).

## Options

### Option A — TRANSCRIPT 줄 단위 분할 + 무음 간격 concat (제안안)
- `#### TRANSCRIPT`(또는 동등 마커) 이후 비어 있지 않은 줄마다 별도 TTS 요청. 스타일 프리앰블은 각 청크에 재부착.
- 빈 줄은 “문단 경계”로 보고 더 긴 무음(예: 400–600ms), 일반 줄 사이는 짧은 무음(예: 150–300ms)을 삽입한 뒤 PCM/WAV concat.
- Pro: CLI에서 장문 체감 개선, progress를 줄 단위로 표시 가능, Google 권장(짧은 청크)과 정합, 대화 스크립트(`화자: …`)에 특히 잘 맞음.
- Con: API 호출 N회 → latency·비용·rate limit. 줄이 긴 산문 한 줄이면 여전히 무거움. 청크 간 톤/피치 드리프트. interaction이 N개가 되어 로컬 매핑·`/list` UX가 애매해질 수 있음.

### Option B — 현상 유지 (단일 요청) + 문서/예제만 가이드
- 구현 변경 없이 README·예제에서 “짧은 청크로 YAML을 나누라”고 안내.
- Pro: 구현 단순, 모델에 맡긴 호흡·운율이 한 세션 안에서 유지될 수 있음.
- Con: 장문 CLI UX 문제 미해결. 사용자가 수동으로 파일을 쪼개야 함.

### Option C — 길이 임계값 + 문장/문단 예산 분할
- `text`가 임계값(예: 문자·바이트·예상 초)을 넘을 때만 자동 분할. 경계는 **줄**이 아니라 문장/문단(또는 soft wrap 후 N자 이하).
- TRANSCRIPT 마커가 있으면 프리앰블/본문 분리; 없으면 전체를 본문으로 취급.
- Pro: 짧은 요청은 1회 유지. 산문 장문에도 줄 길이 함정에 덜 걸림. MCP/CLI 공통 core에 두기 쉬움.
- Con: 경계 휴리스틱·임계값 튜닝 필요. “한 줄 = 한 호흡”이라는 작성자 의도와 어긋날 수 있음.

### Option D — YAML 명시 세그먼트 (`params.segments` / 다중 text)
- 스키마에 세그먼트 배열을 추가하고, 작성자(또는 에이전트)가 경계를 정함. CLI는 concat만 담당.
- Pro: 경계·간격이 예측 가능. 자동 파싱 모호성 없음.
- Con: 스키마·예제·스킬 프롬프트 변경. 기존 단일 `text` 호환 레이어 필요.

## Tradeoffs

| | A. TRANSCRIPT 줄 단위 | B. 현상 유지 | C. 임계값+문장 예산 | D. 명시 세그먼트 |
|---|---|---|---|---|
| CLI 장문 UX | 좋음 | 나쁨 | 좋음(임계 초과 시) | 좋음(작성 품질에 의존) |
| 구현 복잡도 | 중 | 낮 | 중~높 | 중(스키마) |
| 산문 한 줄이 긴 경우 | 취약 | 동일 취약 | 강함 | 작성자가 책임 |
| 톤 일관성 | 청크 간 드리프트 | 단일 세션 | 드리프트(청크 시) | 동일 |
| API 비용/호출 수 | 줄 수만큼 | 1 | 청크 수만큼 | 세그먼트 수만큼 |
| 스키마 호환 | 기존 `text` 유지 | 유지 | 유지 | 확장 필요 |
| MCP 적용 | CLI-only로 둘지 결정 필요 | 해당 없음 | core 공유 용이 | core 공유 용이 |

## Recommendation (optional)
- **1차 추천: Option C를 기본으로 하고, TRANSCRIPT가 있으면 “줄 단위를 1차 경계”로 쓰는 하이브리드**  
  - 임계값 미만 → 단일 요청(B와 동일).  
  - 임계값 이상 → 프리앰블 분리 후 TRANSCRIPT 줄 분할(A); **한 줄이 예산 초과면** 그 줄만 문장 단위로 재분할(C).  
  - 무음: 빈 줄=긴 간격, 일반 인접 줄=짧은 간격(설정 가능 상수).  
- 순수 A만 채택해도 지금 겪은 `draw-with-ai` 문제는 대부분 완화되지만, YAML에서 문단이 한 줄로 이어진 경우 재발한다.
- Option D는 스킬/에이전트가 YAML을 쓰는 워크플로가 안정된 뒤의 **명시적 업그레이드**로 두는 편이 낫다.
- **적용 범위:** 로직은 `core`(speech)에 두고 CLI·MCP 모두 쓰게 하는 것을 권장. “CLI만”으로 두면 MCP 장문에서 동일 문제가 남는다.

## Consequences
- 채택 시: wav concat·무음 삽입 유틸, 프리앰블/TRANSCRIPT 파서, 청크별 progress, 부분 실패(어느 줄에서 실패했는지) 정책이 필요해진다.
- 채택 시 **하지 않을 것:** 사용자가 수동으로 수백 YAML을 쪼개야만 장문이 되게 방치(B 단독).

## Related ASRs
- ASR-022 — 장문 Speech 분할·병합 전략 — 본 ADR의 주 관심사
- ASR-018 — Audio(TTS) 생성 지원 — 장문 동작이 TTS 품질·UX를 좌우
- ASR-002 — CLI 구조 — progress/대기 경험과 관련
- ASR-017 — 백그라운드 실행 모드 — 청크 루프는 동기 기본과 어떻게 맞출지 파생

## Downstream Concerns
- [x] **실패·재시도:** 중간 청크 실패 시 처리 → `adr/speech-chunk-failure-recovery.md` (후속 ADR)
- [ ] **임계값 수치:** 문자/바이트/예상 초 — 무엇으로 자를지, 기본값
- [ ] **청크 경계 규칙:** 문단(빈 줄) → 문장 재분할 순서, TRANSCRIPT 마커 이름, 화자 라벨(`수아:`) 유지 여부
- [x] **무음 길이:** 2026-07-26 청크 사이 무음 삽입 제거로 결정(0ms). 청크 자체 앞뒤 무음으로 충분
- [ ] **프리앰블 재부착:** 매 청크에 전체 스타일 vs 요약 vs 최초 1회만
- [ ] **Interaction 모델:** N개 interaction을 모두 로컬에 남길지, 최종 1개만 노출할지, parent/child 메타데이터
- [ ] **MCP vs CLI:** 동일 동작인지, CLI만 자동 청크인지
- [ ] **다중 화자:** 청크 분할이 speaker 태그/speakers 설정과 충돌하지 않는지

## Related
- 트리거: `examples/draw-with-ai.yaml` 장문 동기 TTS 체감 정지 + 수동 interaction download
- 후속: `adr/speech-chunk-failure-recovery.md` — 청크 실패 처리 정책
- Spec (승인 후): `spec/google-genai-mcp.md` Speech 요구사항 보강 예정

## Tags
`speech`, `tts`, `cli`, `chunking`, `wav-concat`

## Approved
- 2026-07-25: Option C (임계값 초과 시 문단/문장 분할 + 병합 저장), 사용자 확인
- 2026-07-26: 청크 사이 무음 삽입 제거(간격 0ms), 사용자 확인
