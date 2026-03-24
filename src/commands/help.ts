/**
 * /help 커맨드 핸들러
 * 모달로 전체 명령어 사용법 안내
 */

import { replyEphemeral, getBotToken } from '../utils/slack';

export async function handleHelp(
	env: Env,
	teamId: string,
	triggerId: string
): Promise<Response> {
	if (!triggerId) {
		return replyEphemeral('모달을 열 수 없어요. 다시 시도해주세요!');
	}

	const token = await getBotToken(env, teamId);
	if (!token) {
		return replyEphemeral('봇 토큰을 찾을 수 없어요.');
	}

	const modal = {
		trigger_id: triggerId,
		view: {
			type: 'modal',
			title: { type: 'plain_text', text: '🧚 집중요정 도움말' },
			close: { type: 'plain_text', text: '닫기' },
			blocks: [
				// ⏱ 집중 관리
				{
					type: 'header',
					text: { type: 'plain_text', text: '⏱ 집중 관리' },
				},
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text:
							'*`/start`* — 집중 시작\n' +
							'*`/start [계획]`* — 계획과 함께 시작\n' +
							'*`/start plan`* — 모달로 계획 + 태그 입력\n' +
							'\n' +
							'*`/end`* — 집중 종료 (자동 시간 계산)\n' +
							'*`/end [시간]`* — 직접 시간 입력 (예: `/end 2시간 30분`)\n' +
							'\n' +
							'*`/pause`* — 일시정지\n' +
							'*`/resume`* — 재개',
					},
				},
				{ type: 'divider' },
				// 📊 통계
				{
					type: 'header',
					text: { type: 'plain_text', text: '📊 통계' },
				},
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text:
							'*`/today`* — 오늘 팀원 현황\n' +
							'*`/mystats`* — 내 통계 (주간/누적)\n' +
							'*`/weekly`* — 이번 주 팀 랭킹\n' +
							'\n' +
							'*`/report [기간]`* — 기간별 팀 리포트\n' +
							'  `thisweek` `lastweek` `thismonth` `lastmonth`\n' +
							'  `26-01-01 26-01-07` — 날짜 직접 지정',
					},
				},
				{ type: 'divider' },
				// 🛠 도구
				{
					type: 'header',
					text: { type: 'plain_text', text: '🛠 도구' },
				},
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text:
							'*`/export [형식] [기간]`* — 기록 내보내기\n' +
							'  형식: `text` (기본) · `graph` · `csv`\n' +
							'  기간: `thisweek` `lastweek` `thismonth` `lastmonth`\n' +
							'  또는 `26-01-01 26-01-07` 날짜 직접 지정\n' +
							'  예: `/export graph lastweek` · `/export csv 26-01-01 26-01-07`\n' +
							'\n' +
							'*`/pattern [분석] [월]`* — 집중 패턴 분석\n' +
							'  분석: `time` (시간대별) · `day` (요일별)\n' +
							'  월: `26-03` (선택, 기본 이번 달)\n' +
							'  예: `/pattern time` · `/pattern day 26-02`\n' +
							'\n' +
							'*`/cheer [@팀원] [메시지]`* — 팀원 응원\n' +
							'  `/cheer @팀원` — 커피 1잔 보내기\n' +
							'  `/cheer @팀원 화이팅!` — 메시지와 함께\n' +
							'  `/cheer leaderboard` — 응원 랭킹\n' +
							'  `/cheer leaderboard received` — 받은 커피 랭킹\n' +
							'\n' +
							'*`/settings`* — 워크스페이스 설정 (모달)',
					},
				},
			],
		},
	};

	const res = await fetch('https://slack.com/api/views.open', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(modal),
	});

	const data = (await res.json()) as { ok: boolean; error?: string };
	if (!data.ok) {
		console.error('Failed to open help modal:', data.error);
		return replyEphemeral('모달을 열 수 없어요. 다시 시도해주세요!');
	}

	return new Response('', { status: 200 });
}
