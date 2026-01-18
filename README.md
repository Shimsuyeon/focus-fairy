# 🧚‍♀️ 집중요정 (Focus Fairy)

8명 스터디 그룹을 위한 슬랙 기반 집중 시간 트래커 봇

## ✨ 기능

| 명령어 | 설명 |
|--------|------|
| `/start` | 집중 시작 |
| `/end` | 집중 종료 (6시간 초과 시 수동 입력 가능: `/end 2시간 30분`) |
| `/today` | 오늘 집중한 사람들 현황 |
| `/mystats` | 내 집중 통계 (이번 주 / 전체 누적) |
| `/weekly` | 이번 주 랭킹 리포트 |
| `/report` | 기간별 리포트 (`thisweek`, `lastweek`, `thismonth`, `26-01-01 26-01-07`) |
| `/export` | 집중 기록 내보내기 (`text`, `graph`, `csv`) |

## 🛠 기술 스택

- **Cloudflare Workers** - 서버리스 배포
- **Cloudflare KV** - 데이터 저장
- **Slack Slash Commands** - 인터페이스
- **TypeScript**

## 🚀 배포

```bash
# 개발 서버
npm run dev

# 배포
npx wrangler deploy

# 시크릿 설정 (멀티 워크스페이스)
echo '{"TEAM_ID_1":"xoxb-...", "TEAM_ID_2":"xoxb-..."}' | npx wrangler secret put SLACK_BOT_TOKENS
```

## 🧚‍♀️ 특징

- 요정 컨셉의 커스텀 이모지 (:fairy-wand:, :fairy-fire: 등)
- 세션 종료 시 랜덤 격려 메시지 15종
- 한국 시간대(KST) 기준 동작
- 멀티 워크스페이스 지원

---

# 📋 릴리즈 노트

## [1.5.0] - 2026-01-19

### ✨ 새로운 기능

- `/export` 명령어 추가: 개인 집중 기록 내보내기
  - `/export` 또는 `/export text` - 텍스트 목록
  - `/export graph` - 일별 막대 그래프 이미지 (QuickChart.io)
  - `/export csv` - CSV 파일 다운로드
  - 기간 지정 가능: `thisweek`, `lastweek`, `thismonth`, `26-01-01 26-01-15`

### 📋 사용 예시

```
/export                     → 이번 주 텍스트
/export graph lastweek      → 지난 주 그래프
/export csv thismonth       → 이번 달 CSV 파일
/export text 26-01-01 26-01-15  → 특정 기간 텍스트
```

---

## [1.4.0] - 2026-01-13

### ✨ 새로운 기능

- 모든 명령어 입력 시 명령어가 채널에 표시되지 않도록 개선
  - `/start`, `/end`: 본인에게 짧은 확인 메시지, 채널에 공지 (멘션)
  - `/today`, `/mystats`: 결과가 본인에게만 표시
  - `/weekly`, `/report`: 채널에 "OOO님이 조회했어요" + 결과 표시

### 🐛 버그 수정

- 일요일 밤~월요일 새벽 세션의 주간 누적 시간 표시 오류 수정
  - 세션을 시작 시간 기준으로 저장
  - "이번 주" / "지난 주" 라벨 동적 표시

### 🔧 개선

- `/today`, `/weekly`, `/report` 리포트에서 멘션(@) 대신 이름 표시
- GitHub 레포지토리 기반 개발 환경으로 전환
- 코드 모듈화로 유지보수성 향상

---

## [1.3.0] - 2026-01-08

### ✨ 새로운 기능

- `/end` 시간 수동 입력 기능 추가
  - 6시간 초과 시 실제 집중 시간 직접 입력 가능
  - 예: `/end 2시간 30분`
- 요정 컨셉의 커스텀 이모지 추가 (:fairy-wand:, :fairy-fire: 등)
- 세션 종료 시 랜덤 격려 메시지 15종

### 💡 사용 예시

> 밤 11시에 `/start` → 깜빡 잠들어서 → 다음날 아침 `/end 3시간` 입력

---

## [1.2.0] - 2026-01-07

### ✨ 새로운 기능

- `/report` 명령어 추가: 기간별 집중 시간 조회
  - `/report thisweek` - 이번 주
  - `/report lastweek` - 지난 주
  - `/report thismonth` - 이번 달
  - `/report 26-01-01 26-01-07` - 특정 기간

---

## [1.0.0] - 2026-01-07

### 🎉 첫 출시

8명 스터디 그룹을 위한 슬랙 기반 집중 시간 트래커 봇

### 📌 주요 기능

- `/start` - 집중 시작
- `/end` - 집중 종료
- `/weekly` - 이번 주 랭킹 리포트
- `/mystats` - 내 집중 통계 (이번 주 / 전체 누적)
- `/today` - 오늘 집중한 사람들 현황

