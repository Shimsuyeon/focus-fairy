/**
 * /settings 커맨드 핸들러
 * 워크스페이스 설정 모달
 */

import { replyEphemeral, getBotToken, getUserTimezone } from '../utils/slack';
import { MAX_AUTO_DURATION } from '../constants/messages';

export type TimezoneLabelMode = 'auto' | 'always' | 'never';

export interface WorkspaceSettings {
	maxAutoDuration: number;
	defaultTimezone: string;
	timezoneLabelMode: TimezoneLabelMode;
	mixedTimezones: boolean;
	lunchDeduction: boolean;
	lunchStart: string;
	lunchEnd: string;
}

const DEFAULT_SETTINGS: WorkspaceSettings = {
	maxAutoDuration: MAX_AUTO_DURATION,
	defaultTimezone: 'Asia/Seoul',
	timezoneLabelMode: 'auto',
	mixedTimezones: false,
	lunchDeduction: false,
	lunchStart: '12:00',
	lunchEnd: '13:00',
};

const COMMON_TIMEZONES = [
	{ value: 'Asia/Seoul', label: 'Asia/Seoul (KST)' },
	{ value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
	{ value: 'Asia/Shanghai', label: 'Asia/Shanghai (CST)' },
	{ value: 'America/New_York', label: 'America/New_York (EST)' },
	{ value: 'America/Chicago', label: 'America/Chicago (CST)' },
	{ value: 'America/Denver', label: 'America/Denver (MST)' },
	{ value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)' },
	{ value: 'Europe/London', label: 'Europe/London (GMT)' },
	{ value: 'Europe/Berlin', label: 'Europe/Berlin (CET)' },
	{ value: 'Pacific/Auckland', label: 'Pacific/Auckland (NZST)' },
];

const LABEL_MODE_OPTIONS = [
	{ value: 'auto', label: '자동 — 다른 시간대 유저 감지 시 표시' },
	{ value: 'always', label: '항상 표시' },
	{ value: 'never', label: '표시 안 함' },
];

/** 타임존 라벨을 표시할지 판단 */
export function shouldShowTimezoneLabel(settings: WorkspaceSettings): boolean {
	switch (settings.timezoneLabelMode) {
		case 'always': return true;
		case 'never': return false;
		case 'auto': return settings.mixedTimezones;
		default: return false;
	}
}

/** 유저의 타임존 + 라벨 표시 여부를 한번에 조회 */
export async function getUserTimezoneInfo(
	env: Env,
	teamId: string,
	userId: string
): Promise<{ timezone: string; showLabel: boolean }> {
	const [userTz, settings] = await Promise.all([
		getUserTimezone(env, teamId, userId),
		getWorkspaceSettings(env, teamId),
	]);
	await checkAndUpdateMixedTimezones(env, teamId, userTz);
	return { timezone: userTz, showLabel: shouldShowTimezoneLabel(settings) };
}

/** 유저 타임존이 워크스페이스 기본과 다르면 mixedTimezones 플래그 설정 */
export async function checkAndUpdateMixedTimezones(
	env: Env,
	teamId: string,
	userTimezone: string
): Promise<void> {
	const settings = await getWorkspaceSettings(env, teamId);
	if (settings.mixedTimezones) return;
	if (userTimezone !== settings.defaultTimezone) {
		const settingsKey = `${teamId}:settings`;
		let raw: Record<string, unknown> = {};
		try {
			const existing = await env.STUDY_KV.get(settingsKey);
			if (existing) raw = JSON.parse(existing);
		} catch {}
		raw.mixedTimezones = true;
		await env.STUDY_KV.put(settingsKey, JSON.stringify(raw));
	}
}

/** KV에서 워크스페이스 설정 조회 */
export async function getWorkspaceSettings(env: Env, teamId: string): Promise<WorkspaceSettings> {
	try {
		const raw = await env.STUDY_KV.get(`${teamId}:settings`);
		if (raw) {
			return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
		}
	} catch {}
	return { ...DEFAULT_SETTINGS };
}

export async function handleSettings(
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

	const settings = await getWorkspaceSettings(env, teamId);
	const currentHours = String(settings.maxAutoDuration / (60 * 60 * 1000));
	const currentTz = settings.defaultTimezone;
	const currentLabelMode = settings.timezoneLabelMode;
	const lunchEnabled = settings.lunchDeduction;
	const lunchStart = settings.lunchStart;
	const lunchEnd = settings.lunchEnd;

	const modal = {
		trigger_id: triggerId,
		view: {
			type: 'modal',
			callback_id: 'settings_modal',
			title: { type: 'plain_text', text: '⚙️ 워크스페이스 설정' },
			submit: { type: 'plain_text', text: '저장!' },
			close: { type: 'plain_text', text: '취소' },
			blocks: [
				{
					type: 'input',
					block_id: 'max_duration_block',
					label: { type: 'plain_text', text: ':fairy-hourglass: 자동 기록 임계값 (시간)' },
					element: {
						type: 'plain_text_input',
						action_id: 'max_duration_input',
						initial_value: currentHours,
						placeholder: { type: 'plain_text', text: '6' },
					},
					hint: { type: 'plain_text', text: '이 시간을 초과하면 /end 시 확인 버튼이 표시됩니다 (1~24시간)' },
				},
				{
					type: 'input',
					block_id: 'timezone_block',
					label: { type: 'plain_text', text: '🌏 기본 시간대' },
					element: {
						type: 'static_select',
						action_id: 'timezone_select',
						initial_option: {
							text: { type: 'plain_text', text: COMMON_TIMEZONES.find(t => t.value === currentTz)?.label || currentTz },
							value: currentTz,
						},
						options: COMMON_TIMEZONES.map(tz => ({
							text: { type: 'plain_text', text: tz.label },
							value: tz.value,
						})),
					},
					hint: { type: 'plain_text', text: '팀 집계(/today, /weekly)에 사용되는 기준 시간대' },
				},
				{ type: 'divider' },
				{
					type: 'section',
					block_id: 'lunch_header',
					text: { type: 'mrkdwn', text: '🍽️ *점심시간 자동 차감*' },
				},
				{
					type: 'input',
					block_id: 'lunch_toggle_block',
					label: { type: 'plain_text', text: '점심시간 자동 차감' },
					element: {
						type: 'static_select',
						action_id: 'lunch_toggle',
						initial_option: lunchEnabled
							? { text: { type: 'plain_text', text: 'ON — 점심시간 자동 차감' }, value: 'on' }
							: { text: { type: 'plain_text', text: 'OFF — 사용 안 함' }, value: 'off' },
						options: [
							{ text: { type: 'plain_text', text: 'ON — 점심시간 자동 차감' }, value: 'on' },
							{ text: { type: 'plain_text', text: 'OFF — 사용 안 함' }, value: 'off' },
						],
					},
					hint: { type: 'plain_text', text: '세션이 점심시간을 걸치면 자동으로 차감합니다' },
				},
				{
					type: 'input',
					block_id: 'lunch_start_block',
					label: { type: 'plain_text', text: '점심 시작' },
					element: {
						type: 'timepicker',
						action_id: 'lunch_start_input',
						initial_time: lunchStart,
						placeholder: { type: 'plain_text', text: '12:00' },
					},
				},
				{
					type: 'input',
					block_id: 'lunch_end_block',
					label: { type: 'plain_text', text: '점심 끝' },
					element: {
						type: 'timepicker',
						action_id: 'lunch_end_input',
						initial_time: lunchEnd,
						placeholder: { type: 'plain_text', text: '13:00' },
					},
				},
				{ type: 'divider' },
				{
					type: 'input',
					block_id: 'tz_label_block',
					label: { type: 'plain_text', text: '🏷️ 시간대 라벨 표시' },
					element: {
						type: 'static_select',
						action_id: 'tz_label_select',
						initial_option: {
							text: { type: 'plain_text', text: LABEL_MODE_OPTIONS.find(o => o.value === currentLabelMode)?.label || '자동' },
							value: currentLabelMode,
						},
						options: LABEL_MODE_OPTIONS.map(opt => ({
							text: { type: 'plain_text', text: opt.label },
							value: opt.value,
						})),
					},
					hint: { type: 'plain_text', text: '메시지에 시간대(KST, EST 등)를 표시할지 설정' },
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
		console.error('Failed to open settings modal:', data.error);
		return replyEphemeral('모달을 열 수 없어요. 다시 시도해주세요!');
	}

	return new Response('', { status: 200 });
}
