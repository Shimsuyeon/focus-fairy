/**
 * Slack Interactivity 핸들러
 * 모달 제출, 버튼 클릭 등 interactive component 이벤트 처리
 */

import { postMessage, updateMessage, getBotToken, postEphemeral } from '../utils/slack';
import { formatTime } from '../utils/format';
import { getTodayKey } from '../utils/date';
import { SESSION_TAGS, DEFAULT_TAG } from '../constants/messages';
import { completeEndSession } from '../commands/end';
import { getUserTimezoneInfo } from '../commands/settings';

interface SlackBlock {
	type: string;
	block_id?: string;
	text?: { type: string; text: string };
	accessory?: { type: string; text?: { type: string; text: string }; action_id?: string; value?: string; style?: string };
	elements?: Array<{ type: string; text?: string | { type: string; text: string }; action_id?: string; value?: string }>;
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
			values: Record<string, Record<string, {
				value?: string;
				selected_option?: { value: string };
				selected_time?: string;
			}>>;
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
		case 'view_closed':
			return handleViewClosed(payload, env);
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
		case 'edit_plan_modal':
			return handleEditPlanSubmission(user.id, user.team_id, view, env);
		case 'settings_modal':
			return handleSettingsSubmission(user.id, user.team_id, view, env);
		case 'april_fools_modal':
			return handleAprilFoolsAction(user.id, user.team_id, view, env);
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

	if (actionId === 'edit_plan_button') {
		return handleEditPlanButton(payload, env);
	}

	if (actionId?.startsWith('toggle_check_')) {
		return handleToggleCheck(payload, env);
	}

	if (actionId === 'confirm_end_duration') {
		return handleConfirmEndDuration(payload, env);
	}

	return new Response('', { status: 200 });
}

/** "계획 추가" 버튼 클릭 → 모달 오픈 */
async function handleAddPlanButton(payload: SlackInteractionPayload, env: Env): Promise<Response> {
	const { trigger_id, user, channel, message } = payload;
	if (!trigger_id || !channel || !message) {
		return new Response('', { status: 200 });
	}

	const ownerMatch = message.text?.match(/<@([A-Z0-9]+)>/);
	if (ownerMatch && ownerMatch[1] !== user.id) {
		await postEphemeral(env, user.team_id, channel.id, user.id, ':fairy-zzz: 본인의 세션만 수정할 수 있어요!');
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
	const tag = view.state.values['tag_block']?.['tag_select']?.selected_option?.value || DEFAULT_TAG;
	const tagLabel = SESSION_TAGS.find(t => t.value === tag)?.label || '기타';
	const rawPlan = view.state.values['plan_block']?.['plan_input']?.value?.trim();
	const planText = rawPlan || tagLabel;
	const channelId = view.private_metadata;

	if (!channelId) {
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

	const checkinData = JSON.stringify({ time: now, label: planText, tag });
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

	const tzInfo = await getUserTimezoneInfo(env, teamId, userId);
	const publicMessage =
		`:fairy-wand: <@${userId}>님이 집중을 시작했어요! 화이팅! (${formatTime(now, tzInfo.timezone, tzInfo.showLabel)})` +
		`\n:fairy-sprout: 계획:${planDisplay}` +
		`\n:fairy-fire: 카테고리: ${tagLabel}`;

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
	const tag = view.state.values['tag_block']?.['tag_select']?.selected_option?.value || DEFAULT_TAG;
	const tagLabel = SESSION_TAGS.find(t => t.value === tag)?.label || '기타';
	const rawPlan = view.state.values['plan_block']?.['plan_input']?.value?.trim();
	const planText = rawPlan || tagLabel;

	let channelId: string;
	let messageTs: string;
	try {
		const meta = JSON.parse(view.private_metadata);
		channelId = meta.channelId;
		messageTs = meta.messageTs;
	} catch {
		return new Response('', { status: 200 });
	}

	if (!channelId || !messageTs) {
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
		const checkinData = JSON.stringify({ time: startTime, label: planText, checked: initialChecked, tag, messageTs, channelId });
		await env.STUDY_KV.put(`${teamId}:checkin:${userId}`, checkinData);
		const tzInfo = await getUserTimezoneInfo(env, teamId, userId);
		const blocks = buildChecklistBlocks(userId, startTime, items, new Array(items.length).fill(false), tagLabel, tzInfo);
		const fallbackText = `:fairy-wand: <@${userId}>님이 집중을 시작했어요! 화이팅! (${formatTime(startTime, tzInfo.timezone, tzInfo.showLabel)})\n:fairy-sprout: 계획: ${items.join(', ')}`;

		await updateMessage(env, teamId, channelId, messageTs, fallbackText, blocks);
	}

	return new Response('', { status: 200 });
}

/** "계획 수정" 버튼 클릭 → 기존 계획이 채워진 모달 오픈 */
async function handleEditPlanButton(payload: SlackInteractionPayload, env: Env): Promise<Response> {
	const { trigger_id, user, channel, message } = payload;
	if (!trigger_id || !channel || !message) {
		return new Response('', { status: 200 });
	}

	const token = await getBotToken(env, user.team_id);
	if (!token) return new Response('', { status: 200 });

	const headerBlock = message.blocks?.find((b: SlackBlock) => b.block_id === 'checklist_header');
	const headerText = headerBlock?.text?.text || '';
	const userIdMatch = headerText.match(/<@([^>]+)>/);
	const userId = userIdMatch ? userIdMatch[1] : user.id;

	if (userId !== user.id) {
		await postEphemeral(env, user.team_id, channel.id, user.id, ':fairy-zzz: 본인의 세션만 수정할 수 있어요!');
		return new Response('', { status: 200 });
	}

	const checkIn = await env.STUDY_KV.get(`${user.team_id}:checkin:${userId}`);
	if (!checkIn) {
		return new Response('', { status: 200 });
	}

	let currentLabel = '';
	let currentTag = DEFAULT_TAG;
	try {
		const parsed = JSON.parse(checkIn);
		if (typeof parsed === 'object' && parsed.time) {
			currentLabel = parsed.label || '';
			currentTag = parsed.tag || DEFAULT_TAG;
		}
	} catch {}

	const metadata = JSON.stringify({ channelId: channel.id, messageTs: message.ts });

	const modal = {
		trigger_id,
		view: {
			type: 'modal',
			callback_id: 'edit_plan_modal',
			private_metadata: metadata,
			title: { type: 'plain_text', text: '계획 수정' },
			submit: { type: 'plain_text', text: '수정!' },
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
						initial_value: currentLabel,
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
							text: { type: 'plain_text', text: SESSION_TAGS.find(t => t.value === currentTag)?.label || '기타' },
							value: currentTag,
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

/** 계획 수정 모달 제출 → KV 업데이트 + 체크리스트 메시지 업데이트 */
async function handleEditPlanSubmission(
	userId: string,
	teamId: string,
	view: NonNullable<SlackInteractionPayload['view']>,
	env: Env
): Promise<Response> {
	const tag = view.state.values['tag_block']?.['tag_select']?.selected_option?.value || DEFAULT_TAG;
	const tagLabel = SESSION_TAGS.find(t => t.value === tag)?.label || '기타';
	const rawPlan = view.state.values['plan_block']?.['plan_input']?.value?.trim();
	const planText = rawPlan || tagLabel;

	let channelId: string;
	let messageTs: string;
	try {
		const meta = JSON.parse(view.private_metadata);
		channelId = meta.channelId;
		messageTs = meta.messageTs;
	} catch {
		return new Response('', { status: 200 });
	}

	if (!channelId || !messageTs) {
		return new Response('', { status: 200 });
	}

	const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);
	if (!checkIn) {
		return new Response('', { status: 200 });
	}

	let startTime = Date.now();
	try {
		const parsed = JSON.parse(checkIn);
		if (typeof parsed === 'object' && parsed.time) {
			startTime = parsed.time;
		} else {
			startTime = parseInt(checkIn);
		}
	} catch {
		startTime = parseInt(checkIn);
	}

	const items = planText.split('\n').filter((l: string) => l.trim()).map((l: string) => l.trim());
	const initialChecked = new Array(items.length).fill(false);
	const checkinData = JSON.stringify({ time: startTime, label: planText, checked: initialChecked, tag, messageTs, channelId });
	await env.STUDY_KV.put(`${teamId}:checkin:${userId}`, checkinData);

	const tzInfo = await getUserTimezoneInfo(env, teamId, userId);
	const blocks = buildChecklistBlocks(userId, startTime, items, initialChecked, tagLabel, tzInfo);
	const fallbackText = `:fairy-wand: <@${userId}>님이 집중을 시작했어요! 화이팅! (${formatTime(startTime, tzInfo.timezone, tzInfo.showLabel)})\n:fairy-sprout: 계획: ${items.join(', ')}`;

	await updateMessage(env, teamId, channelId, messageTs, fallbackText, blocks);

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

	const headerBlock = blocks.find((b) => b.block_id === 'checklist_header');
	const headerText = headerBlock?.text?.text || '';
	const userIdMatch = headerText.match(/<@([^>]+)>/);
	const userId = userIdMatch ? userIdMatch[1] : user.id;

	if (userId !== user.id) {
		if (channel) {
			await postEphemeral(env, user.team_id, channel.id, user.id, ':fairy-zzz: 본인의 세션만 수정할 수 있어요!');
		}
		return new Response('', { status: 200 });
	}

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
	if (!checkIn) {
		return new Response('', { status: 200 });
	}

	let startTime = Date.now();
	let tag: string | undefined;
	let storedMessageTs: string | undefined;
	let storedChannelId: string | undefined;
	try {
		const parsed = JSON.parse(checkIn);
		if (typeof parsed === 'object' && parsed.time) {
			startTime = parsed.time;
			tag = parsed.tag;
			storedMessageTs = parsed.messageTs;
			storedChannelId = parsed.channelId;
		} else {
			startTime = parseInt(checkIn);
		}
	} catch {
		startTime = parseInt(checkIn);
	}

	const label = items.join('\n');
	const checkinData = JSON.stringify({
		time: startTime, label, checked,
		...(tag && { tag }),
		...(storedMessageTs && { messageTs: storedMessageTs }),
		...(storedChannelId && { channelId: storedChannelId }),
	});
	await env.STUDY_KV.put(`${user.team_id}:checkin:${userId}`, checkinData);

	const tagLabel = tag ? (SESSION_TAGS.find(t => t.value === tag)?.label || '기타') : undefined;
	const tzInfo = await getUserTimezoneInfo(env, user.team_id, userId);
	const updatedBlocks = buildChecklistBlocks(userId, startTime, items, checked, tagLabel, tzInfo);
	await updateMessage(env, user.team_id, channel.id, message.ts, message.text, updatedBlocks);

	return new Response('', { status: 200 });
}

/** 모달 닫기 핸들러 (X 버튼 / close 버튼) */
async function handleViewClosed(payload: SlackInteractionPayload, env: Env): Promise<Response> {
	const { view, user } = payload;
	if (!view) return new Response('', { status: 200 });

	if (view.callback_id === 'april_fools_modal') {
		return handleAprilFoolsAction(user.id, user.team_id, view, env);
	}

	return new Response('', { status: 200 });
}

/** 만우절 모달 → 세션 시작 */
async function handleAprilFoolsAction(
	userId: string,
	teamId: string,
	view: NonNullable<SlackInteractionPayload['view']>,
	env: Env
): Promise<Response> {
	let channelId: string;
	let text: string;
	try {
		const meta = JSON.parse(view.private_metadata);
		channelId = meta.channelId;
		text = meta.text || '';
	} catch {
		return new Response('', { status: 200 });
	}

	if (!channelId) return new Response('', { status: 200 });

	// 이미 집중 중이면 무시
	const existing = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);
	if (existing) return new Response('', { status: 200 });

	// 세션 시작
	const now = Date.now();
	const label = text && text !== 'plan' ? text : '';
	const checkinData = label ? JSON.stringify({ time: now, label }) : now.toString();
	await env.STUDY_KV.put(`${teamId}:checkin:${userId}`, checkinData);

	const todayKey = getTodayKey();
	const todayList: string[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:today:${todayKey}`)) || '[]');
	if (!todayList.includes(userId)) {
		todayList.push(userId);
		await env.STUDY_KV.put(`${teamId}:today:${todayKey}`, JSON.stringify(todayList));
	}

	const tzInfo = await getUserTimezoneInfo(env, teamId, userId);
	let publicMessage = `:fairy-party: 만우절이에요! 오늘도 집중 화이팅! :fairy-party:\n:fairy-wand: <@${userId}>님이 집중을 시작했어요! (${formatTime(now, tzInfo.timezone, tzInfo.showLabel)})`;
	if (label) {
		publicMessage += `\n:fairy-sprout: 계획: ${label}`;
	}

	await postMessage(env, teamId, channelId, publicMessage);

	return new Response('', { status: 200 });
}

/** 설정 모달 제출 핸들러 */
async function handleSettingsSubmission(
	userId: string,
	teamId: string,
	view: NonNullable<SlackInteractionPayload['view']>,
	env: Env
): Promise<Response> {
	const hoursStr = view.state.values['max_duration_block']?.['max_duration_input']?.value?.trim();
	const hours = parseFloat(hoursStr || '');

	if (isNaN(hours) || hours < 1 || hours > 24) {
		return new Response(JSON.stringify({
			response_action: 'errors',
			errors: { max_duration_block: '1~24 사이의 숫자를 입력해주세요' },
		}), { headers: { 'Content-Type': 'application/json' } });
	}

	const maxAutoDuration = Math.round(hours * 60 * 60 * 1000);
	const defaultTimezone = view.state.values['timezone_block']?.['timezone_select']?.selected_option?.value || 'Asia/Seoul';
	const timezoneLabelMode = view.state.values['tz_label_block']?.['tz_label_select']?.selected_option?.value || 'auto';
	const lunchToggle = view.state.values['lunch_toggle_block']?.['lunch_toggle']?.selected_option?.value || 'off';
	const lunchStart = view.state.values['lunch_start_block']?.['lunch_start_input']?.selected_time || '12:00';
	const lunchEnd = view.state.values['lunch_end_block']?.['lunch_end_input']?.selected_time || '13:00';

	if (lunchToggle === 'on' && lunchStart >= lunchEnd) {
		return new Response(JSON.stringify({
			response_action: 'errors',
			errors: {
				lunch_start_block: '시작 시간이 종료 시간보다 빨라야 합니다',
				lunch_end_block: '종료 시간이 시작 시간보다 늦어야 합니다',
			},
		}), { headers: { 'Content-Type': 'application/json' } });
	}

	const settingsKey = `${teamId}:settings`;
	let settings: Record<string, unknown> = {};
	try {
		const raw = await env.STUDY_KV.get(settingsKey);
		if (raw) settings = JSON.parse(raw);
	} catch {}

	settings.maxAutoDuration = maxAutoDuration;
	settings.defaultTimezone = defaultTimezone;
	settings.timezoneLabelMode = timezoneLabelMode;
	settings.lunchDeduction = lunchToggle === 'on';
	settings.lunchStart = lunchStart;
	settings.lunchEnd = lunchEnd;
	await env.STUDY_KV.put(settingsKey, JSON.stringify(settings));

	return new Response('', { status: 200 });
}

/** "그대로 기록하기" 버튼 클릭 → 세션 종료 처리 */
async function handleConfirmEndDuration(payload: SlackInteractionPayload, env: Env): Promise<Response> {
	const { user, actions } = payload;
	if (!actions?.[0]?.value) {
		return new Response('', { status: 200 });
	}

	const buttonData = JSON.parse(actions[0].value);
	const { channelId, duration, lunchDeducted } = buttonData;
	const teamId = user.team_id;
	const userId = user.id;

	const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);
	if (!checkIn) {
		await postEphemeral(env, teamId, channelId, userId, ':fairy-zzz: 이미 종료된 세션이에요!');
		return new Response('', { status: 200 });
	}

	const now = Date.now();
	let checkinData: Record<string, unknown>;
	try {
		const parsed = JSON.parse(checkIn);
		checkinData = typeof parsed === 'object' && parsed.time ? parsed : { time: parseInt(checkIn) };
	} catch {
		checkinData = { time: parseInt(checkIn) };
	}

	let totalPauseDuration = (checkinData.totalPauseDuration as number) || 0;
	if (checkinData.pausedAt) {
		totalPauseDuration += now - (checkinData.pausedAt as number);
	}

	let pausePeriods: Array<{ start: number; end: number }> = [];
	if (Array.isArray(checkinData.pausePeriods)) {
		pausePeriods = checkinData.pausePeriods as Array<{ start: number; end: number }>;
	}
	if (checkinData.pausedAt) {
		pausePeriods = [...pausePeriods, { start: checkinData.pausedAt as number, end: now }];
	}

	const checkin = {
		startTime: checkinData.time as number,
		label: checkinData.label as string | undefined,
		checked: checkinData.checked as boolean[] | undefined,
		tag: checkinData.tag as string | undefined,
		messageTs: checkinData.messageTs as string | undefined,
		msgChannelId: checkinData.channelId as string | undefined,
		totalPauseDuration,
		pausePeriods,
	};

	const tzInfo = await getUserTimezoneInfo(env, teamId, userId);
	const durationLabel = await completeEndSession(env, teamId, userId, channelId, duration, checkin, tzInfo, lunchDeducted || 0);
	await postEphemeral(env, teamId, channelId, userId, `:fairy-party: ${durationLabel} 기록 완료!`);

	return new Response('', { status: 200 });
}

/** 체크리스트 블록 생성 */
function buildChecklistBlocks(userId: string, startTime: number, items: string[], checked: boolean[], tagLabel?: string, tzInfo?: { timezone: string; showLabel: boolean }): SlackBlock[] {
	const doneCount = checked.filter(Boolean).length;
	const totalCount = items.length;

	const headerText = `:fairy-wand: <@${userId}>님이 집중을 시작했어요! 화이팅! (${formatTime(startTime, tzInfo?.timezone, tzInfo?.showLabel)})` +
		(tagLabel ? `\n:fairy-fire: 카테고리: ${tagLabel}` : '');

	const blocks: SlackBlock[] = [
		{
			type: 'section',
			block_id: 'checklist_header',
			text: {
				type: 'mrkdwn',
				text: headerText,
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

	blocks.push({
		type: 'actions',
		block_id: 'checklist_actions',
		elements: [{
			type: 'button',
			text: { type: 'plain_text', text: '계획 수정' },
			action_id: 'edit_plan_button',
			value: 'edit',
		}],
	});

	return blocks;
}

/** 종료된 체크리스트 블록 (버튼 없는 최종 상태) */
export function buildFinalChecklistBlocks(userId: string, startTime: number, items: string[], checked: boolean[], tagLabel?: string, tzInfo?: { timezone: string; showLabel: boolean }): SlackBlock[] {
	const doneCount = checked.filter(Boolean).length;
	const totalCount = items.length;

	const headerText = `:fairy-wand: <@${userId}>님이 집중을 시작했어요! (${formatTime(startTime, tzInfo?.timezone, tzInfo?.showLabel)})` +
		(tagLabel ? `\n:fairy-fire: 카테고리: ${tagLabel}` : '');

	const blocks: SlackBlock[] = [
		{
			type: 'section',
			block_id: 'checklist_header',
			text: { type: 'mrkdwn', text: headerText },
		},
		{ type: 'divider' },
		{
			type: 'section',
			block_id: 'checklist_label',
			text: { type: 'mrkdwn', text: `:fairy-sprout: *계획 결과* (${doneCount}/${totalCount} 완료)` },
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
		});
	}

	blocks.push({
		type: 'context',
		block_id: 'checklist_ended',
		elements: [{ type: 'mrkdwn', text: ':fairy-zzz: 세션이 종료되었습니다' }],
	});

	return blocks;
}
