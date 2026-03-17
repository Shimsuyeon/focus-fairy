/**
 * /start 커맨드 핸들러
 */

import { reply, replyEphemeral, postMessage, getUserName, getBotToken } from '../utils/slack';
import { formatTime, formatDuration } from '../utils/format';
import { getTodayKey } from '../utils/date';

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

	const now = Date.now();
	const existing = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);

	if (existing) {
		let startTime: number;
		try {
			const parsed = JSON.parse(existing);
			startTime = typeof parsed === 'object' && parsed.time ? parsed.time : parseInt(existing);
		} catch {
			startTime = parseInt(existing);
		}
		const elapsed = formatDuration(now - startTime);
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

	const userName = await getUserName(env, teamId, userId);

	let publicMessage = `:fairy-wand: <@${userId}>님이 집중을 시작했어요! 화이팅! (${formatTime(now)})`;
	if (label) {
		publicMessage += `\n:fairy-sprout: 계획: ${label}`;
	}

	const posted = await postMessage(env, teamId, channelId, publicMessage);

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
		try {
			const parsed = JSON.parse(existing);
			startTime = typeof parsed === 'object' && parsed.time ? parsed.time : parseInt(existing);
		} catch {
			startTime = parseInt(existing);
		}
		const elapsed = formatDuration(Date.now() - startTime);
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
