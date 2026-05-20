/**
 * App Home 탭 뷰 빌더.
 * 기존 사용자 / 신규 사용자(세션 기록 0건) 분기로 다른 화면을 보여준다.
 */

import { formatDuration } from '../../utils/format';
import type { SessionState, TodayStats, WeeklyRank } from '../../services/session';

export const HOME_ACTION = {
	settingsSync: 'home_settings_sync',
	settings: 'home_settings',
	help: 'home_help',
} as const;

interface BuildHomeViewArgs {
	userName: string;
	session: SessionState;
	today: TodayStats;
	week: WeeklyRank;
	monthTotalMs: number;
	totalAllTimeMs: number;
}

interface SlackView {
	type: 'home';
	blocks: unknown[];
}

export function buildHomeView({ userName, session, today, week, monthTotalMs, totalAllTimeMs }: BuildHomeViewArgs): SlackView {
	const stateLine = renderStateLine(session);
	const todayLine = today.sessionCount === 0
		? '_오늘은 아직 기록이 없어요. `/start` 로 시작해보세요!_'
		: `누적 ${formatDuration(today.totalMs)} · 세션 ${today.sessionCount}회`;
	const weekLine = week.rank === 0
		? '_이번 주는 아직 기록이 없어요._'
		: `누적 ${formatDuration(week.totalMs)} · 팀 내 ${week.rank}위 / ${week.teamSize}명`;
	const currentMonth = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCMonth() + 1;
	const monthLine = monthTotalMs === 0
		? `_${currentMonth}월은 아직 기록이 없어요._`
		: `누적 ${formatDuration(monthTotalMs)}`;

	return {
		type: 'home',
		blocks: [
			{
				type: 'header',
				text: { type: 'plain_text', text: `:fairy-wand: 안녕하세요, ${userName}!`, emoji: true },
			},
			{ type: 'section', text: { type: 'mrkdwn', text: '*:fairy-fire: 현재 상태*' } },
			{ type: 'section', text: { type: 'mrkdwn', text: stateLine } },
			{ type: 'divider' },
			{ type: 'section', text: { type: 'mrkdwn', text: `*:fairy-chart: 오늘*\n${todayLine}` } },
			{ type: 'section', text: { type: 'mrkdwn', text: `*:fairy-wish: 이번 주*\n${weekLine}` } },
			{ type: 'section', text: { type: 'mrkdwn', text: `*:fairy-sprout: ${currentMonth}월*\n${monthLine}` } },
			{ type: 'section', text: { type: 'mrkdwn', text: `*:fairy-gold: 전체 누적*\n${formatDuration(totalAllTimeMs)}` } },
			{ type: 'divider' },
			{ type: 'section', text: { type: 'mrkdwn', text: '*:gear: 빠른 진입*' } },
			{
				type: 'actions',
				elements: [
					{
						type: 'button',
						text: { type: 'plain_text', text: 'Slack status 동기화', emoji: true },
						action_id: HOME_ACTION.settingsSync,
					},
					{
						type: 'button',
						text: { type: 'plain_text', text: '워크스페이스 설정', emoji: true },
						action_id: HOME_ACTION.settings,
					},
					{
						type: 'button',
						text: { type: 'plain_text', text: '도움말', emoji: true },
						action_id: HOME_ACTION.help,
					},
				],
			},
			{ type: 'divider' },
			{
				type: 'context',
				elements: [
					{
						type: 'mrkdwn',
						text: '채널에서 `/start` 로 집중 시작 · `/help` 로 전체 명령어 · 홈 탭은 매번 열 때 최신 상태로 갱신돼요.',
					},
				],
			},
		],
	};
}

export function buildOnboardingView({ userName }: { userName: string }): SlackView {
	return {
		type: 'home',
		blocks: [
			{
				type: 'header',
				text: { type: 'plain_text', text: `:fairy-wand: 환영해요, ${userName}!`, emoji: true },
			},
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text: '집중요정으로 첫 집중 세션을 시작해봐요. 작업 채널에 봇을 초대한 뒤 명령어를 입력하면 돼요.',
				},
			},
			{ type: 'divider' },
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text:
						'*1.* 작업 채널에서 `/start` 입력 → 집중 세션 시작\n' +
						'*2.* 끝나면 `/end` 로 종료 → 통계에 자동 누적\n' +
						'*3.* 누적된 기록은 이 홈 탭에서 매번 확인할 수 있어요',
				},
			},
			{ type: 'divider' },
			{
				type: 'actions',
				elements: [
					{
						type: 'button',
						text: { type: 'plain_text', text: '도움말 보기', emoji: true },
						action_id: HOME_ACTION.help,
						style: 'primary',
					},
					{
						type: 'button',
						text: { type: 'plain_text', text: 'Slack status 동기화 설정', emoji: true },
						action_id: HOME_ACTION.settingsSync,
					},
				],
			},
			{
				type: 'context',
				elements: [
					{
						type: 'mrkdwn',
						text: '집중 세션은 `/pause`, `/resume`, `/end` 로 컨트롤할 수 있고, `/start` 직후엔 본인에게만 보이는 컨트롤 패널이 같이 떠요.',
					},
				],
			},
		],
	};
}

/** 현재 세션 상태를 한 줄 텍스트로 표현 */
function renderStateLine(session: SessionState): string {
	if (session.state === 'idle') {
		return ':fairy-coffee: 현재 쉬는 중 — `/start` 로 집중을 시작해보세요!';
	}

	const elapsed = formatDuration(session.elapsedMs || 0);
	const labelLine = session.label ? `\n:fairy-sprout: 계획: ${session.label}` : '';

	if (session.state === 'paused') {
		return `:fairy-moon: *일시정지 중* (집중 ${elapsed}) — \`/resume\` 으로 다시 시작!${labelLine}`;
	}

	return `:fairy-fire: *집중 중* — ${elapsed} 경과${labelLine}`;
}
