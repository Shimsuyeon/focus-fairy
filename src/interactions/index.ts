/**
 * Slack Interactivity 핸들러
 * 모달 제출, 버튼 클릭 등 interactive component 이벤트 처리
 */

import { postMessage, updateMessage, getBotToken } from '../utils/slack';
import { formatTime } from '../utils/format';
import { getTodayKey } from '../utils/date';

interface SlackInteractionPayload {
	type: string;
	trigger_id?: string;
	user: { id: string; team_id: string };
	channel?: { id: string };
	message?: { ts: string; text: string };
	actions?: Array<{ action_id: string }>;
	view?: {
		callback_id: string;
		private_metadata: string;
		state: {
			values: Record<string, Record<string, { value: string }>>;
		};
	};
}

export async function handleInteraction(request: Request, env: Env): Promise<Response> {
	const formData = await request.formData();
	const payloadStr = formData.get('payload') as string;

	if (!payloadStr) {
		return new Response('', { status: 200 });
	}

	const payload: SlackInteractionPayload = JSON.parse(payloadStr);

	switch (payload.type) {
		case 'view_submission':
			return handleViewSubmission(payload, env);
		case 'block_actions':
			return handleBlockActions(payload, env);
		default:
			return new Response('', { status: 200 });
	}
}

/** 모달 제출 핸들러 */
async function handleViewSubmission(payload: SlackInteractionPayload, env: Env): Promise<Response> {
	const { view, user } = payload;
	if (!view) return new Response('', { status: 200 });

	switch (view.callback_id) {
		case 'start_plan_modal':
			return handleStartPlanSubmission(user.id, user.team_id, view, env);
		case 'start_button_plan_modal':
			return handleButtonPlanSubmission(user.id, user.team_id, view, env);
		default:
			return new Response('', { status: 200 });
	}
}

/** 버튼 클릭 핸들러 */
async function handleBlockActions(payload: SlackInteractionPayload, env: Env): Promise<Response> {
	const actionId = payload.actions?.[0]?.action_id;

	if (actionId === 'add_plan_button') {
		return handleAddPlanButton(payload, env);
	}

	return new Response('', { status: 200 });
}

/** "계획 추가" 버튼 클릭 → 모달 오픈 */
async function handleAddPlanButton(payload: SlackInteractionPayload, env: Env): Promise<Response> {
	const { trigger_id, user, channel, message } = payload;
	if (!trigger_id || !channel || !message) {
		return new Response('', { status: 200 });
	}

	const token = await getBotToken(env, user.team_id);
	if (!token) return new Response('', { status: 200 });

	const metadata = JSON.stringify({ channelId: channel.id, messageTs: message.ts });

	const modal = {
		trigger_id,
		view: {
			type: 'modal',
			callback_id: 'start_button_plan_modal',
			private_metadata: metadata,
			title: { type: 'plain_text', text: '계획 추가' },
			submit: { type: 'plain_text', text: '추가!' },
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

	await fetch('https://slack.com/api/views.open', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(modal),
	});

	return new Response('', { status: 200 });
}

/** B안: /start plan 모달 제출 → 새 메시지 */
async function handleStartPlanSubmission(
	userId: string,
	teamId: string,
	view: NonNullable<SlackInteractionPayload['view']>,
	env: Env
): Promise<Response> {
	const planText = view.state.values['plan_block']?.['plan_input']?.value?.trim();
	const channelId = view.private_metadata;

	if (!planText || !channelId) {
		return new Response('', { status: 200 });
	}

	const now = Date.now();
	const existing = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);

	if (existing) {
		return new Response(JSON.stringify({
			response_action: 'errors',
			errors: { plan_block: '이미 집중 중이에요! /end로 먼저 종료해주세요.' },
		}), { headers: { 'Content-Type': 'application/json' } });
	}

	const checkinData = JSON.stringify({ time: now, label: planText });
	await env.STUDY_KV.put(`${teamId}:checkin:${userId}`, checkinData);

	const todayKey = getTodayKey();
	const todayList: string[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:today:${todayKey}`)) || '[]');
	if (!todayList.includes(userId)) {
		todayList.push(userId);
		await env.STUDY_KV.put(`${teamId}:today:${todayKey}`, JSON.stringify(todayList));
	}

	const lines = planText.split('\n').filter((l: string) => l.trim());
	const planDisplay = lines.length > 1
		? '\n' + lines.map((l: string) => `• ${l.trim()}`).join('\n')
		: ` ${planText}`;

	const publicMessage =
		`:fairy-wand: <@${userId}>님이 집중을 시작했어요! 화이팅! (${formatTime(now)})` +
		`\n:fairy-sprout: 계획:${planDisplay}`;

	await postMessage(env, teamId, channelId, publicMessage);

	return new Response('', { status: 200 });
}

/** C안: 버튼 → 모달 제출 → 원래 메시지 업데이트 */
async function handleButtonPlanSubmission(
	userId: string,
	teamId: string,
	view: NonNullable<SlackInteractionPayload['view']>,
	env: Env
): Promise<Response> {
	const planText = view.state.values['plan_block']?.['plan_input']?.value?.trim();

	let channelId: string;
	let messageTs: string;
	try {
		const meta = JSON.parse(view.private_metadata);
		channelId = meta.channelId;
		messageTs = meta.messageTs;
	} catch {
		return new Response('', { status: 200 });
	}

	if (!planText || !channelId || !messageTs) {
		return new Response('', { status: 200 });
	}

	// KV 체크인 데이터에 라벨 추가
	const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);
	if (checkIn) {
		let startTime: number;
		try {
			const parsed = JSON.parse(checkIn);
			startTime = typeof parsed === 'object' && parsed.time ? parsed.time : parseInt(checkIn);
		} catch {
			startTime = parseInt(checkIn);
		}
		const checkinData = JSON.stringify({ time: startTime, label: planText });
		await env.STUDY_KV.put(`${teamId}:checkin:${userId}`, checkinData);

		// 원래 메시지에서 시간 정보를 가져와 업데이트
		const lines = planText.split('\n').filter((l: string) => l.trim());
		const planDisplay = lines.length > 1
			? '\n' + lines.map((l: string) => `• ${l.trim()}`).join('\n')
			: ` ${planText}`;

		const updatedMessage =
			`:fairy-wand: <@${userId}>님이 집중을 시작했어요! 화이팅! (${formatTime(startTime)})` +
			`\n:fairy-sprout: 계획:${planDisplay}`;

		await updateMessage(env, teamId, channelId, messageTs, updatedMessage);
	}

	return new Response('', { status: 200 });
}
