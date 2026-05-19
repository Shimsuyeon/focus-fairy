---
title: /start
description: 집중 세션을 시작합니다.
sidebar:
  order: 1
---

집중 세션을 시작하는 명령어예요. 작업 이름을 함께 입력하면 나중에 통계에서 어떤 작업에 몰입했는지 확인할 수 있어요.

## 사용법

```
/start [작업 이름]
```

## 예시

```
/start 디자인 시스템 토큰 정리
```

세션이 시작되면 채널에 알림이 올라가고, [`/settings sync`](/settings/sync/)를 설정해둔 경우 Slack status도 "집중 중"으로 자동 변경돼요.

## 관련 명령어

- [`/pause`](/commands/pause/) — 세션 일시 정지
- [`/resume`](/commands/resume/) — 일시 정지된 세션 재개
- [`/end`](/commands/end/) — 세션 종료
