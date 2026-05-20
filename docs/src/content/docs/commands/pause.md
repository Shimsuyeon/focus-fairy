---
title: /pause
description: 집중 세션을 일시 정지합니다.
sidebar:
  order: 3
---

집중 세션을 일시 정지해요. 잠깐 자리를 비울 때 사용해요.

## 사용법

```
/pause
```

다른 Slack 앱과 명령어가 겹칠 때는 `/fpause`로도 같은 동작을 호출할 수 있어요. 자세한 내용은 [명령어 충돌 회피](/commands/aliases/)를 참고하세요.

일시 정지 중에는 집중 시간이 누적되지 않고, [`/settings sync`](/settings/sync/) 설정 시 Slack status가 "잠깐 자리비움"으로 바뀌어요.
재개하려면 [`/resume`](/commands/resume/)을 입력하세요.

슬래시 명령어 외에도 [App Home 탭](/home/)이나 `/start` 직후 뜨는 [세션 컨트롤 패널](/commands/start/#컨트롤-패널)의 버튼으로도 일시정지할 수 있어요.
