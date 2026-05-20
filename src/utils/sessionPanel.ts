/**
 * 세션 컨트롤 패널 — 본인에게만 보이는 ephemeral 메시지로,
 * 일시정지/재개/종료/통계 버튼을 제공한다.
 * 슬래시 명령어 충돌 회피 + 채널 이동 없이 세션 컨트롤을 가능하게 함.
 */

import { formatDuration } from './format';

export type SessionPanelState = 'focusing' | 'paused' | 'ended';

export const PANEL_ACTION = {
	pause: 'ff_session_pause',
	resume: 'ff_session_resume',
	end: 'ff_session_end',
	stats: 'ff_session_stats',
} as const;

interface BuildPanelArgs {
	state: SessionPanelState;
	startTime?: number;
	pausedAt?: number;
	totalPauseDuration?: number;
}

export function buildSessionPanelBlocks({ state, startTime, pausedAt, totalPauseDuration }: BuildPanelArgs): unknown[] {
	if (state === 'ended') {
		return [
			{
				type: 'section',
				text: { type: 'mrkdwn', text: ':fairy-party: 세션이 종료됐어요! 수고했어요 :fairy-wand:' },
			},
		];
	}

	const now = Date.now();
	let headerText: string;

	if (state === 'paused' && pausedAt && startTime) {
		const focused = formatDuration(pausedAt - startTime - (totalPauseDuration || 0));
		const breakElapsed = formatDuration(now - pausedAt);
		headerText = `:fairy-moon: *일시정지 중* — 집중 ${focused} / 휴식 ${breakElapsed}`;
	} else if (state === 'focusing' && startTime) {
		const focused = formatDuration(now - startTime - (totalPauseDuration || 0));
		headerText = `:fairy-hourglass: *집중 중* — ${focused} 경과`;
	} else {
		headerText = state === 'paused' ? ':fairy-moon: *일시정지 중*' : ':fairy-hourglass: *집중 중*';
	}

	const buttons =
		state === 'paused'
			? [
					{
						type: 'button',
						text: { type: 'plain_text', text: ':fairy-wand: 재개', emoji: true },
						action_id: PANEL_ACTION.resume,
						style: 'primary',
					},
					{
						type: 'button',
						text: { type: 'plain_text', text: '종료', emoji: true },
						action_id: PANEL_ACTION.end,
						style: 'danger',
					},
					{
						type: 'button',
						text: { type: 'plain_text', text: ':bar_chart: 통계', emoji: true },
						action_id: PANEL_ACTION.stats,
					},
				]
			: [
					{
						type: 'button',
						text: { type: 'plain_text', text: ':fairy-moon: 일시정지', emoji: true },
						action_id: PANEL_ACTION.pause,
					},
					{
						type: 'button',
						text: { type: 'plain_text', text: '종료', emoji: true },
						action_id: PANEL_ACTION.end,
						style: 'danger',
					},
					{
						type: 'button',
						text: { type: 'plain_text', text: ':bar_chart: 통계', emoji: true },
						action_id: PANEL_ACTION.stats,
					},
				];

	return [
		{
			type: 'section',
			text: { type: 'mrkdwn', text: headerText },
		},
		{
			type: 'actions',
			elements: buttons,
		},
		{
			type: 'context',
			elements: [
				{
					type: 'mrkdwn',
					text: '슬래시 명령어 대신 이 버튼으로 세션을 컨트롤할 수 있어요. 새로고침하면 사라져요.',
				},
			],
		},
	];
}
