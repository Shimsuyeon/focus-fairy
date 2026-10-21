# 크롬 웹스토어 등록 자료

[Chrome Web Store 개발자 대시보드](https://chrome.google.com/webstore/devconsole)에서 새 항목을 만들 때 아래 내용을 그대로 붙여넣으면 돼요.

- 패키지: `npm run pack:extension` → `dist/focus-fairy-extension-<version>.zip`
- 스크린샷: `store/screenshots/` (1280×800, 다시 만들기: `bash scripts/store-screenshots.sh` — 가짜 데이터)
- 아이콘: `extension/icons/icon128.png`
- 개인정보처리방침: https://focus-fairy-docs.pages.dev/privacy/

---

## 스토어 등록정보 (Store listing)

### 이름
집중요정

### 요약 (manifest description, 132자 이하)
Slack 집중요정 봇과 연결해 툴바에서 집중을 시작·종료하고, 함께 집중하는 팀원과 이번 달 기록을 확인해요.

### 설명

```
Slack 집중요정(Focus Fairy) 봇을 쓰는 팀을 위한 크롬 익스텐션이에요.
매번 Slack에 들어가 /start, /end 를 치지 않아도, 툴바 팝업에서 바로 집중 세션을 켜고 끌 수 있어요.

■ 툴바에서 바로 집중
• 집중 시작 · 쉬어가기 · 다시 집중 · 종료
• 카테고리(공부·사이드·독서·운동·기타)와 오늘의 계획 입력
• 시작·종료 메시지를 올릴 Slack 채널 선택, 또는 기록만 남기기
• 툴바 배지에 집중 시간 표시, 단축키(Alt+Shift+S)로 시작/쉬어가기

■ 오늘 함께 집중
• 같은 워크스페이스에서 오늘 집중한 팀원과 지금 상태 (계획 내용은 보이지 않아요)

■ 이번 달의 나무
• 월 목표에 가까워질수록 나무가 자라고, 집중한 날마다 열매가 하나씩 열려요
• 일 평균, 최고의 날, 연속 기록, 일별·누적 그래프, 카테고리 비율

■ 여러 워크스페이스
• 여러 Slack 워크스페이스를 연결해 드롭다운으로 전환

■ 연결 방법
Slack 집중요정 홈 탭의 [크롬 익스텐션 연결] 버튼(또는 /settings extension)에서 [익스텐션에 연결하기]를 누르면 자동으로 연결돼요.

※ 집중요정 Slack 봇이 설치된 워크스페이스에서 쓸 수 있어요.
사용 가이드: https://focus-fairy-docs.pages.dev/extension/
```

### 카테고리
생산성 (Productivity) → 워크플로 및 계획 (Workflow & Planning)

### 언어
한국어

### 공개 범위 (Distribution → Visibility)
**Unlisted** (링크가 있는 사람만 설치)

---

## 개인정보 보호 관행 (Privacy practices)

### 단일 목적 (Single purpose)
```
Slack 집중요정 봇의 집중 세션을 브라우저 툴바에서 시작·일시정지·종료하고, 사용자의 집중 기록과 팀의 오늘 집중 현황을 보여주는 것.
```

### 권한별 사용 이유 (Permission justification)

| 권한 | 사용 이유 (그대로 붙여넣기) |
|---|---|
| `storage` | 연결한 워크스페이스의 연결 토큰, 워크스페이스·채널 선택, 마지막 세션 상태를 브라우저에 저장해 팝업과 툴바 배지에 보여주기 위해 사용합니다. |
| `alarms` | 1분마다 툴바 배지의 집중 시간을 갱신하고, 5분마다 Slack에서 바뀐 세션 상태를 서버와 동기화하기 위해 사용합니다. |
| 호스트 권한 `https://focus-fairy.suyeonshim.workers.dev/*` | 집중요정 서버 API로 세션을 시작·종료하고 통계를 불러오기 위해 사용합니다. 다른 사이트에는 접근하지 않습니다. |
| content script (`/extension/connect` 한 페이지) | Slack에서 '익스텐션에 연결하기'를 눌렀을 때 열리는 집중요정 연결 페이지에서 일회용 연결 코드를 읽어 워크스페이스를 연결하기 위해 사용합니다. 다른 페이지에서는 동작하지 않습니다. |

### 원격 코드 (Remote code)
**아니요, 원격 코드를 사용하지 않습니다.** (모든 JS는 패키지에 포함, 외부 스크립트·eval 없음)

### 데이터 사용 (Data usage) — 체크할 항목
- [x] **인증 정보 (Authentication information)** — 집중요정 서버 연결 토큰
- [x] **개인 식별 정보 (Personally identifiable information)** — Slack 표시 이름 (팝업·팀원 현황 표시)
- 나머지(건강, 금융, 위치, 웹 기록, 사용자 활동, 웹사이트 콘텐츠 등)는 체크하지 않음

> 판단이 애매하면 보수적으로 체크하는 편이 심사에 유리해요. 계획·카테고리·집중 시간은 사용자가 직접 입력하는 기록이라 위 항목에 해당하지 않는다고 봤어요.

### 인증 (세 항목 모두 체크)
- [x] 승인된 사용 사례 외에 제3자에게 사용자 데이터를 판매·전송하지 않음
- [x] 단일 목적과 무관한 용도로 사용자 데이터를 사용·전송하지 않음
- [x] 신용도 판단·대출 목적으로 사용자 데이터를 사용·전송하지 않음

### 개인정보처리방침 URL
https://focus-fairy-docs.pages.dev/privacy/

---

## 심사 메모 (Test instructions, 선택)

```
이 익스텐션은 Slack 앱 '집중요정(Focus Fairy)'이 설치된 워크스페이스의 사용자용입니다.
Slack에서 /settings extension → '익스텐션에 연결하기'를 누르면 연결 페이지(https://focus-fairy.suyeonshim.workers.dev/extension/connect)가 열리고 익스텐션이 자동으로 연결됩니다.
연결 전에는 팝업에 연결 안내 화면만 표시됩니다.
```
