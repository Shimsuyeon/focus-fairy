---
title: Slack Status 자동 동기화 (/settings sync)
description: 집중 상태를 Slack status에 자동으로 반영하는 방법
sidebar:
  label: /settings sync
  order: 1
---

집중요정과 Slack status를 연결하면, `/start` · `/pause` · `/end`를 입력할 때마다 본인 Slack status가 자동으로 바뀌어요. 동료들이 프로필만 봐도 지금 집중 중인지 알 수 있어요.

## User Presence vs User Status

Slack에는 비슷해 보이지만 다른 두 개념이 있어요.

### user presence (프로필 옆 초록 점)

현재 대화 가능 여부를 나타내요. 이 값을 봇이 건드리려면 **슬랙 앱의 권한을 새로 요청해서 업데이트**한 뒤 봇 재설치까지 필요해요.

### user status (휴가 중·회의 중 같은 상태 설정)

각 유저가 한 번만 user token 사용을 허가하면, 봇이 재설치 없이도 status를 바꿀 수 있어요.

집중요정은 가볍게 도입할 수 있도록 **user status만 건드리는 방향**으로 디벨롭했어요.

## 사용 방법

### 1. `/settings sync` 입력

채널이나 DM에서 `/settings sync`를 입력하면 봇이 Slack status 동기화 안내 메시지를 보내요.

```
/settings sync
```

메시지에는 `/start`, `/pause`, `/end` 시 status가 어떻게 바뀌는지 안내와 함께 **권한 허용 버튼**이 같이 떠요.

### 2. 권한 허용 버튼 누르기

버튼을 누르면 권한 승인 페이지로 이동해요.

### 3. 워크스페이스 선택 후 권한 허용

권한 승인 페이지에서 워크스페이스를 선택하고 권한을 허용하면, 연결 완료 페이지가 표시돼요.

## 상태 매핑

연결하면 다음 명령어 입력 시 Slack status가 자동 변경돼요.

| 명령어 | Slack status |
| --- | --- |
| `/start` | 💻 집중 중 |
| `/pause` | ☕ 잠깐 자리비움 |
| `/resume` | 💻 집중 중 |
| `/end` | (status 제거) |

## 연결 해제

다시 `/settings sync`를 입력하면 현재 연결 상태와 함께 **연결 해제 버튼**이 떠요. 버튼을 누르면 권한이 철회되고 더 이상 status가 자동 변경되지 않아요.

## 참고

원문 글: [집중요정 디벨롭 — 집중 상태와 유지 status 동기화](https://developer-dreamer.tistory.com/237)
