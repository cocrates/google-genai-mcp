# Gemini Batch API

> 조사일: 2026-07-23
> 상태: generateContent API 전용 (Interactions API 미지원)

## 개요

Batch API는 대량의 요청을 비동기로 처리하는 API입니다. **비용 50% 절감**과 함께 24시간 내 완료를 목표로 합니다.

## 핵심 특징

| 항목 | 내용 |
|------|------|
| **비용** | 표준 API 대비 50% 할인 |
| **처리 시간** | 24시간 SLO (대부분 더 빠름) |
| **최대 요청 수** | 200,000 요청/배치 |
| **파일 크기 제한** | 입력 파일 2GB |
| **결과 보관** | 기본 6주 |
| **지원 모달리티** | 텍스트, 이미지, 비디오 |

## 제출 방식

### 1. Inline Requests (소규모 배치)

20MB 미만의 소규모 배치에 적합합니다.

```python
inline_requests = [
    {
        'contents': [{'parts': [{'text': 'A big letter A surrounded by animals'}]}],
        'config': {'response_modalities': ['TEXT', 'IMAGE']}
    },
    {
        'contents': [{'parts': [{'text': 'A big letter B surrounded by animals'}]}],
        'config': {'response_modalities': ['TEXT', 'IMAGE']}
    }
]

batch_job = client.batches.create(
    model="gemini-3-pro-image-preview",
    src=inline_requests,
    config={'display_name': "inline-image-batch"}
)
```

### 2. JSONL 파일 입력 (대규모 배치)

대량 요청 시 JSONL 파일을 File API로 업로드 후 사용합니다.

```jsonl
{"key": "request-1", "request": {"contents": [{"parts": [{"text": "A red car"}]}], "generation_config": {"responseModalities": ["TEXT", "IMAGE"]}}}
{"key": "request-2", "request": {"contents": [{"parts": [{"text": "A blue car"}]}], "generation_config": {"responseModalities": ["TEXT", "IMAGE"]}}}
```

```python
# 파일 업로드
uploaded_file = client.files.upload(
    file="batch-requests.jsonl",
    config=types.UploadFileConfig(display_name='image-batch', mime_type='jsonl')
)

# 배치 작업 생성
batch_job = client.batches.create(
    model="gemini-3-pro-image-preview",
    src=uploaded_file.name,
    config={'display_name': "file-image-batch"}
)
```

## 상태 관리

```python
# 상태 확인
batch_job = client.batches.get(name=batch_job.name)
print(f"State: {batch_job.state.name}")

# 상태값
# JOB_STATE_UNSPECIFIED
# JOB_STATE_QUEUED      - 대기 중
# JOB_STATE_IN_PROGRESS - 처리 중
# JOB_STATE_SUCCEEDED   - 완료
# JOB_STATE_FAILED      - 실패
# JOB_STATE_CANCELLED   - 취소됨
# JOB_STATE_CANCELLING  - 취소 중
```

## 결과 조회

```python
if batch_job.state.name == 'JOB_STATE_SUCCEEDED':
    # Inline 응답인 경우
    for i, response in enumerate(batch_job.dest.inlined_responses):
        if response.response:
            for part in response.response.candidates[0].content.parts:
                if part.text:
                    print(part.text)
                elif part.inline_data:
                    image = part.as_image()
                    image.save(f"image_{i+1}.png")
        elif response.error:
            print(f"Error: {response.error}")
```

## 이미지 생성 배치

이미지 생성 시 Batch API는 더 높은 rate limit을 제공합니다:

```python
batch_job = client.batches.create(
    model="gemini-3-pro-image-preview",
    src=inline_requests,
    config={
        'display_name': "image-generation-batch",
    },
)
```

## Webhook 지원

배치 작업 완료 시 Webhook으로 알림을 받을 수 있습니다:

```python
batch_job = client.batches.create(
    model="gemini-3-pro-image-preview",
    src=inline_requests,
    config={
        'display_name': "batch-with-webhook",
        'webhook': {
            'uri': 'https://your-server.com/webhook',
            'events': ['batch.succeeded', 'batch.failed']
        }
    }
)
```

## 제약사항 및 주의사항

| 항목 | 내용 |
|------|------|
| **API 의존성** | generateContent API 전용 (Interactions API 미지원) |
| **TypeScript SDK** | 아직 미지원 (Python/REST만 지원, JS 지원 예정) |
| **멱등성** | 배치 작업 생성은 멱등하지 않음 (동일 요청 2번 제출 시 2개 작업 생성) |
| **Image 출력** | 기본 1K 해상도만 지원 (2K/4K 미지원) |
| **캐싱** | 암묵적 캐싱 지원 |

## 우리 프로젝트에 미치는 영향

### MVP 전략

MVP에서는 Interactions API를 기본으로 사용하되, 대량 생성이 필요한 경우:

```
[일반 요청] → Interactions API (background=true)
[대량 요청] → generateContent + Batch API
```

### 향후 통합 가능성

Interactions API에 배치 기능이 추가되면 마이그레이션 가능:
- 현재: 두 API 분리 사용
- 향후: Interactions API로 통합

## 참고 자료

- [Batch API Guide](https://ai.google.dev/gemini-api/docs/batch-api)
- [Batch API Reference](https://ai.google.dev/api/batch-api)
- [Python Cookbook Example](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Batch_mode.ipynb)
