/**
 * Slack Interactivity 핸들러
 * 모달 제출, 버튼 클릭 등 interactive component 이벤트 처리
 */

import { postMessage, updateMessage, getBotToken } from '../utils/slack';
import { formatTime } from '../utils/format';
import { getTodayKey } from '../utils/date';

interface SlackBlock {
	type: string;
	block_id?: string;
	text?: { type: string; text: string };
	accessory?: { type: string; text?: { type: string; text: string }; action_id?: string; value?: string; style?: string };
	elements?: Array<{ type: string; text?: { type: string; text: string }; action_id?: string; value?: string }>;
}

interface SlackInteractionPayload {
	type: string;
	trigger_id?: string;
	user: { id: string; team_id: string };
	channel?: { id: string };
	message?: { ts: string; text: string; blocks?: SlackBlock[] };
	actions?: Array<{ action_id: string; value?: string; block_id?: string }>;
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

	if (actionId?.startsWith('toggle_check_')) {
		return handleToggleCheck(payload, env);
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

/** C안: 버튼 → 모달 제출 → 체크리스트로 메시지 업데이트 */
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

	const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);
	if (checkIn) {
		let startTime: number;
		try {
			const parsed = JSON.parse(checkIn);
			startTime = typeof parsed === 'object' && parsed.time ? parsed.time : parseInt(checkIn);
		} catch {
			startTime = parseInt(checkIn);
		}
		const items = planText.split('\n').filter((l: string) => l.trim()).map((l: string) => l.trim());
		const initialChecked = new Array(items.length).fill(false);
		const checkinData = JSON.stringify({ time: startTime, label: planText, checked: initialChecked });
		await env.STUDY_KV.put(`${teamId}:checkin:${userId}`, checkinData);
		const blocks = buildChecklistBlocks(userId, startTime, items, new Array(items.length).fill(false));
		const fallbackText = `:fairy-wand: <@${userId}>님이 집중을 시작했어요! 화이팅! (${formatTime(startTime)})\n:fairy-sprout: 계획: ${items.join(', ')}`;

		await updateMessage(env, teamId, channelId, messageTs, fallbackText, blocks);
	}

	return new Response('', { status: 200 });
}

/** 체크리스트 항목 토글 */
async function handleToggleCheck(payload: SlackInteractionPayload, env: Env): Promise<Response> {
	const { user, channel, message, actions } = payload;
	if (!channel || !message || !actions?.[0]) {
		return new Response('', { status: 200 });
	}

	const action = actions[0];
	const blocks = message.blocks || [];

	// 헤더에서 userId와 startTime 추출
	const headerBlock = blocks.find((b) => b.block_id === 'checklist_header');
	const headerText = headerBlock?.text?.text || '';
	const userIdMatch = headerText.match(/<@([^>]+)>/);
	const userId = userIdMatch ? userIdMatch[1] : user.id;

	// 체크리스트 항목 수집 및 토글
	const items: string[] = [];
	const checked: boolean[] = [];

	for (const block of blocks) {
		if (block.type === 'section' && block.accessory?.action_id?.startsWith('toggle_check_')) {
			const accValue = block.accessory.value || '';
			const [accState, ...accTextParts] = accValue.split(':');
			const accText = accTextParts.join(':');

			let isChecked = accState === 'checked';
			if (block.block_id === action.block_id) {
				isChecked = !isChecked;
			}

			items.push(accText);
			checked.push(isChecked);
		}
	}

	const checkIn = await env.STUDY_KV.get(`${user.team_id}:checkin:${userId}`);
	let startTime = Date.now();
	if (checkIn) {
		try {
			const parsed = JSON.parse(checkIn);
			startTime = typeof parsed === 'object' && parsed.time ? parsed.time : parseInt(checkIn);
		} catch {
			startTime = parseInt(checkIn);
		}

		// KV에 checked 상태 저장
		const label = items.join('\n');
		const checkinData = JSON.stringify({ time: startTime, label, checked });
		await env.STUDY_KV.put(`${user.team_id}:checkin:${userId}`, checkinData);
	}

	const updatedBlocks = buildChecklistBlocks(userId, startTime, items, checked);
	await updateMessage(env, user.team_id, channel.id, message.ts, message.text, updatedBlocks);

	return new Response('', { status: 200 });
}

/** 체크리스트 블록 생성 */
function buildChecklistBlocks(userId: string, startTime: number, items: string[], checked: boolean[]): SlackBlock[] {
	const doneCount = checked.filter(Boolean).length;
	const totalCount = items.length;

	const blocks: SlackBlock[] = [
		{
			type: 'section',
			block_id: 'checklist_header',
			text: {
				type: 'mrkdwn',
				text: `:fairy-wand: <@${userId}>님이 집중을 시작했어요! 화이팅! (${formatTime(startTime)})`,
			},
		},
		{ type: 'divider' },
		{
			type: 'section',
			block_id: 'checklist_label',
			text: { type: 'mrkdwn', text: `:fairy-sprout: *오늘의 계획* (${doneCount}/${totalCount})` },
		},
	];

	for (let i = 0; i < items.length; i++) {
		blocks.push({
			type: 'section',
			block_id: `checklist_${i}`,
			text: {
				type: 'mrkdwn',
				text: checked[i] ? `:fairy-party: ~${items[i]}~` : `${items[i]}`,
			},
			accessory: checked[i]
				? {
					type: 'button',
					text: { type: 'plain_text', text: '취소' },
					action_id: `toggle_check_${i}`,
					value: `checked:${items[i]}`,
				}
				: {
					type: 'button',
					text: { type: 'plain_text', text: '완료' },
					action_id: `toggle_check_${i}`,
					value: `unchecked:${items[i]}`,
					style: 'primary',
				},
		});
	}

	if (doneCount === totalCount && totalCount > 0) {
		blocks.push({
			type: 'context',
			block_id: 'checklist_done',
			elements: [{ type: 'mrkdwn', text: ':fairy-party: 모든 계획을 완료했어요!' }],
		});
	}

	return blocks;
}
