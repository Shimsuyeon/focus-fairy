/**
 * Slack Interactivity 핸들러
 * 모달 제출, 버튼 클릭 등 interactive component 이벤트 처리
 */

import { postMessage, replyEphemeral } from '../utils/slack';
import { formatTime } from '../utils/format';
import { getTodayKey } from '../utils/date';

interface SlackInteractionPayload {
	type: string;
	user: { id: string; team_id: string };
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
		default:
			return new Response('', { status: 200 });
	}
}

async function handleViewSubmission(payload: SlackInteractionPayload, env: Env): Promise<Response> {
	const { view, user } = payload;
	if (!view) return new Response('', { status: 200 });

	switch (view.callback_id) {
		case 'start_plan_modal':
			return handleStartPlanSubmission(user.id, user.team_id, view, env);
		default:
			return new Response('', { status: 200 });
	}
}

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
