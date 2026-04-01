/**
 * /start 커맨드 핸들러
 */

import { reply, replyEphemeral, postMessage, postMessageWithBlocks, getBotToken } from '../utils/slack';
import { formatTime, formatDuration } from '../utils/format';
import { getTodayKey, isAprilFools } from '../utils/date';
import { SESSION_TAGS, DEFAULT_TAG } from '../constants/messages';
import { getUserTimezoneInfo } from './settings';

const RESERVED_SUBCOMMANDS = ['plan'];

export async function handleStart(
	env: Env,
	teamId: string,
	userId: string,
	channelId: string,
	text: string,
	triggerId?: string
): Promise<Response> {
	if (text === 'plan') {
		return handleStartPlan(env, teamId, userId, channelId, triggerId);
	}

	// 만우절 이벤트: Pro 모달 먼저 표시
	if (isAprilFools() && triggerId) {
		const existing = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);
		if (!existing) {
			return openAprilFoolsModal(env, teamId, channelId, text, triggerId);
		}
	}

	const now = Date.now();
	const existing = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);

	if (existing) {
		let startTime: number;
		let isPaused = false;
		try {
			const parsed = JSON.parse(existing);
			if (typeof parsed === 'object' && parsed.time) {
				startTime = parsed.time;
				isPaused = !!parsed.pausedAt;
			} else {
				startTime = parseInt(existing);
			}
		} catch {
			startTime = parseInt(existing);
		}
		const elapsed = formatDuration(now - startTime);
		if (isPaused) {
			return replyEphemeral(`:fairy-moon: 일시정지 중이에요! /resume으로 다시 시작하거나 /end로 종료해주세요 (${elapsed} 경과)`);
		}
		return replyEphemeral(`이미 집중 중이에요! 요정이 지켜보고 있어요 :fairy-hourglass: (${elapsed} 경과)`);
	}

	const label = text && !RESERVED_SUBCOMMANDS.includes(text) ? text : '';
	const checkinData = label ? JSON.stringify({ time: now, label }) : now.toString();
	await env.STUDY_KV.put(`${teamId}:checkin:${userId}`, checkinData);

	const todayKey = getTodayKey();
	const todayList: string[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:today:${todayKey}`)) || '[]');
	if (!todayList.includes(userId)) {
		todayList.push(userId);
		await env.STUDY_KV.put(`${teamId}:today:${todayKey}`, JSON.stringify(todayList));
	}

	const tzInfo = await getUserTimezoneInfo(env, teamId, userId);
	let publicMessage = `:fairy-wand: <@${userId}>님이 집중을 시작했어요! 화이팅! (${formatTime(now, tzInfo.timezone, tzInfo.showLabel)})`;
	if (label) {
		publicMessage += `\n:fairy-sprout: 계획: ${label}`;
	}

	if (label) {
		const posted = await postMessage(env, teamId, channelId, publicMessage);
		if (posted) {
			return replyEphemeral(':fairy-wand: 집중 시작!');
		} else {
			return reply(publicMessage);
		}
	}

	const blocks = [
		{
			type: 'section',
			text: { type: 'mrkdwn', text: publicMessage },
		},
		{
			type: 'actions',
			elements: [
				{
					type: 'button',
					text: { type: 'plain_text', text: ':fairy-sprout: 계획 추가' },
					action_id: 'add_plan_button',
				},
			],
		},
	];

	const posted = await postMessageWithBlocks(env, teamId, channelId, publicMessage, blocks);
	if (posted) {
		return replyEphemeral(':fairy-wand: 집중 시작!');
	} else {
		return reply(publicMessage);
	}
}

async function handleStartPlan(
	env: Env,
	teamId: string,
	userId: string,
	channelId: string,
	triggerId?: string
): Promise<Response> {
	if (!triggerId) {
		return replyEphemeral('모달을 열 수 없어요. 다시 시도해주세요!');
	}

	const existing = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);
	if (existing) {
		let startTime: number;
		let isPaused = false;
		try {
			const parsed = JSON.parse(existing);
			if (typeof parsed === 'object' && parsed.time) {
				startTime = parsed.time;
				isPaused = !!parsed.pausedAt;
			} else {
				startTime = parseInt(existing);
			}
		} catch {
			startTime = parseInt(existing);
		}
		const elapsed = formatDuration(Date.now() - startTime);
		if (isPaused) {
			return replyEphemeral(`:fairy-moon: 일시정지 중이에요! /resume으로 다시 시작하거나 /end로 종료해주세요 (${elapsed} 경과)`);
		}
		return replyEphemeral(`이미 집중 중이에요! 요정이 지켜보고 있어요 :fairy-hourglass: (${elapsed} 경과)`);
	}

	const token = await getBotToken(env, teamId);
	if (!token) {
		return replyEphemeral('봇 토큰을 찾을 수 없어요.');
	}

	const modal = {
		trigger_id: triggerId,
		view: {
			type: 'modal',
			callback_id: 'start_plan_modal',
			private_metadata: channelId,
			title: { type: 'plain_text', text: '집중 시작' },
			submit: { type: 'plain_text', text: '시작!' },
			close: { type: 'plain_text', text: '취소' },
			blocks: [
				{
					type: 'input',
					block_id: 'plan_block',
					optional: true,
					label: { type: 'plain_text', text: ':fairy-sprout: 오늘의 계획' },
					element: {
						type: 'plain_text_input',
						action_id: 'plan_input',
						multiline: true,
						placeholder: {
							type: 'plain_text',
							text: '기획서 작성\n코드리뷰\nPR 머지',
						},
					},
				},
				{
					type: 'input',
					block_id: 'tag_block',
					label: { type: 'plain_text', text: ':fairy-fire: 카테고리' },
					element: {
						type: 'static_select',
						action_id: 'tag_select',
						initial_option: {
							text: { type: 'plain_text', text: SESSION_TAGS.find(t => t.value === DEFAULT_TAG)!.label },
							value: DEFAULT_TAG,
						},
						options: SESSION_TAGS.map(tag => ({
							text: { type: 'plain_text', text: tag.label },
							value: tag.value,
						})),
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
		console.error('Failed to open modal:', data.error);
		return replyEphemeral('모달을 열 수 없어요. 다시 시도해주세요!');
	}

	return new Response('', { status: 200 });
}

/** 만우절 Pro 모달 */
async function openAprilFoolsModal(
	env: Env,
	teamId: string,
	channelId: string,
	text: string,
	triggerId: string
): Promise<Response> {
	const token = await getBotToken(env, teamId);
	if (!token) {
		return replyEphemeral('봇 토큰을 찾을 수 없어요.');
	}

	const metadata = JSON.stringify({ channelId, text });

	const modal = {
		trigger_id: triggerId,
		view: {
			type: 'modal',
			callback_id: 'april_fools_modal',
			private_metadata: metadata,
			notify_on_close: true,
			title: { type: 'plain_text', text: '집중요정 Pro' },
			submit: { type: 'plain_text', text: '구독하기 - 월 9,900원' },
			close: { type: 'plain_text', text: '오늘만 무료체험' },
			blocks: [
				{
					type: 'header',
					text: { type: 'plain_text', text: ':fairy-wand: 집중요정 Pro 출시!' },
				},
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: '*무료 버전은 오늘부터 하루 1회만 사용 가능합니다.*\n\nPro 구독 시 다음 기능을 이용할 수 있어요:',
					},
				},
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: ':fairy-fire: 무제한 집중 세션\n:fairy-sprout: AI 집중력 분석 리포트\n:fairy-party: 프리미엄 요정 이모지 팩\n:fairy-coffee: 자동 커피 배달 연동',
					},
				},
				{
					type: 'divider',
				},
				{
					type: 'context',
					elements: [
						{
							type: 'mrkdwn',
							text: '구독은 언제든 해지할 수 있으며, 첫 달은 50% 할인됩니다.',
						},
					],
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
		console.error('Failed to open april fools modal:', data.error);
		return replyEphemeral('모달을 열 수 없어요. 다시 시도해주세요!');
	}

	return new Response('', { status: 200 });
}

