/**
 * /settings 커맨드 핸들러
 * 워크스페이스 설정 모달
 */

import { replyEphemeral, getBotToken, getUserTimezone, getUserToken, getTeamName, getUserName } from '../utils/slack';
import { MAX_AUTO_DURATION } from '../constants/messages';
import { issueApiToken, createConnectCode } from '../api/auth';
import { canReadUserStatus } from '../services/slackStatus';

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
	userId: string,
	triggerId: string,
	text?: string,
	baseUrl?: string
): Promise<Response> {
	if (text === 'sync') {
		return handleSyncSettings(env, teamId, userId, baseUrl);
	}

	if (text === 'extension') {
		return handleExtensionSettings(env, teamId, userId, triggerId, baseUrl);
	}

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

const SYNC_STATUS_MAPPING =
	'`/start`, `/pause`, `/end` 시 Slack status가 자동으로 바뀌어요.\n\n' +
	'• `/start` · `/resume` → 💻 집중 중\n' +
	'• `/pause` → ☕ 잠깐 자리비움\n' +
	'• `/end` → 💤 오늘 2시간 40분 집중 _(다음 날 오전 6시에 사라져요)_';

async function handleSyncSettings(
	env: Env,
	teamId: string,
	userId: string,
	baseUrl?: string
): Promise<Response> {
	const hasToken = !!(await getUserToken(env, teamId, userId));
	const oauthUrl = baseUrl ? `${baseUrl}/slack/oauth/user-install` : '';

	if (hasToken) {
		// 예전에 연결한 사용자는 status 읽기 권한이 없다 — 다시 허용하면 직접 설정한 status를 지켜준다
		const needsReauth = !(await canReadUserStatus(env, teamId, userId));
		return new Response(JSON.stringify({
			response_type: 'ephemeral',
			text: '💻 Slack status 동기화: 연결됨',
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `💻 *Slack status 동기화: 연결됨* ✅\n\n${SYNC_STATUS_MAPPING}`,
					},
				},
				...(needsReauth && oauthUrl ? [{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: '🛡️ *권한을 다시 허용하면 직접 설정한 status를 지켜줘요*\n"회의 중", "재택근무"처럼 직접 설정한 status를 덮어쓰지 않고, 집중이 끝나면 원래 status로 되돌려요.',
					},
					accessory: {
						type: 'button',
						text: { type: 'plain_text', text: '🔄 권한 다시 허용하기' },
						url: oauthUrl,
						action_id: 'connect_status_sync',
					},
				}] : []),
				{
					type: 'actions',
					elements: [
						{
							type: 'button',
							text: { type: 'plain_text', text: '🔌 연결 해제' },
							action_id: 'disconnect_status_sync',
							style: 'danger',
							confirm: {
								title: { type: 'plain_text', text: '연결 해제' },
								text: { type: 'plain_text', text: 'Slack status 자동 동기화를 해제할까요?' },
								confirm: { type: 'plain_text', text: '해제' },
								deny: { type: 'plain_text', text: '취소' },
							},
						},
					],
				},
			],
		}), { headers: { 'Content-Type': 'application/json' } });
	}

	return new Response(JSON.stringify({
		response_type: 'ephemeral',
		text: '💻 Slack status 동기화: 연결 안됨',
		blocks: [
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text: `💻 *Slack status 동기화*\n\n연결하면 ${SYNC_STATUS_MAPPING}\n\n직접 설정한 status("회의 중" 등)는 덮어쓰지 않고, 집중이 끝나면 원래 status로 되돌려요.`,
				},
			},
			...(oauthUrl ? [{
				type: 'actions',
				elements: [
					{
						type: 'button',
						text: { type: 'plain_text', text: '🔗 Slack에서 권한 연결하기' },
						url: oauthUrl,
						action_id: 'connect_status_sync',
						style: 'primary',
					},
				],
			}] : []),
		],
	}), { headers: { 'Content-Type': 'application/json' } });
}

export const EXTENSION_ACTION = {
	connectLink: 'extension_connect_link',
	showToken: 'extension_show_token',
} as const;

const EXTENSION_NOTES =
	'• 여러 워크스페이스에서 쓴다면 각 워크스페이스에서 연결하세요. 익스텐션 위쪽 드롭다운으로 전환할 수 있어요.\n' +
	'• 메시지를 올릴 채널은 이 워크스페이스에서 `/start` 한 적 있는 채널 중에 고를 수 있어요.\n' +
	'• 다시 연결하거나 토큰을 새로 받으면 이전 토큰은 바로 사용할 수 없게 돼요.';

/**
 * 크롬 익스텐션 연결 모달 (/settings extension, App Home 버튼 공용).
 * 기본은 '익스텐션에 연결하기' 링크 버튼 — 일회용 코드가 담긴 연결 페이지를 열면 익스텐션이 알아서 토큰을 받는다.
 * 링크를 쓸 수 없을 때를 위해 '토큰 직접 복사하기' 버튼도 둔다 (누를 때 토큰 발급).
 */
export async function handleExtensionSettings(
	env: Env,
	teamId: string,
	userId: string,
	triggerId: string,
	baseUrl?: string
): Promise<Response> {
	if (!triggerId) {
		return replyEphemeral('모달을 열 수 없어요. 다시 시도해주세요!');
	}

	const botToken = await getBotToken(env, teamId);
	if (!botToken) {
		return replyEphemeral('봇 토큰을 찾을 수 없어요.');
	}

	const [teamName, userName] = await Promise.all([getTeamName(env, teamId), getUserName(env, teamId, userId)]);
	const code = baseUrl ? await createConnectCode(env, teamId, userId, { teamName, userName }) : null;

	const modal = {
		trigger_id: triggerId,
		view: {
			type: 'modal',
			callback_id: 'extension_token_modal',
			private_metadata: JSON.stringify({ baseUrl: baseUrl || '' }),
			title: { type: 'plain_text', text: '크롬 익스텐션 연결' },
			close: { type: 'plain_text', text: '닫기' },
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `:fairy-wand: *${teamName}* 워크스페이스를 집중요정 크롬 익스텐션에 연결해요.`,
					},
				},
				{
					type: 'actions',
					elements: [
						...(code
							? [
									{
										type: 'button',
										action_id: EXTENSION_ACTION.connectLink,
										style: 'primary',
										text: { type: 'plain_text', text: '🧩 익스텐션에 연결하기' },
										url: `${baseUrl}/extension/connect#code=${code}`,
									},
							  ]
							: []),
						{
							type: 'button',
							action_id: EXTENSION_ACTION.showToken,
							text: { type: 'plain_text', text: '토큰 직접 복사하기' },
						},
					],
				},
				{
					type: 'context',
					elements: [
						{
							type: 'mrkdwn',
							text: code
								? '버튼을 누르면 브라우저에 연결 페이지가 열리고 익스텐션이 *자동으로 연결*돼요. 링크는 10분 동안 한 번만 쓸 수 있어요.'
								: '토큰을 복사해서 익스텐션 팝업에 붙여넣어 주세요.',
						},
					],
				},
				{ type: 'divider' },
				{ type: 'context', elements: [{ type: 'mrkdwn', text: EXTENSION_NOTES }] },
			],
		},
	};

	const res = await fetch('https://slack.com/api/views.open', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${botToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(modal),
	});

	const data = (await res.json()) as { ok: boolean; error?: string };
	if (!data.ok) {
		console.error('Failed to open extension token modal:', data.error);
		return replyEphemeral('모달을 열 수 없어요. 다시 시도해주세요!');
	}

	return new Response('', { status: 200 });
}

/** '토큰 직접 복사하기' — 토큰을 발급해 같은 모달을 토큰 화면으로 바꾼다 */
export async function handleExtensionShowToken(
	env: Env,
	teamId: string,
	userId: string,
	view: { id?: string; hash?: string; private_metadata?: string }
): Promise<Response> {
	const botToken = await getBotToken(env, teamId);
	if (!botToken || !view.id) {
		return new Response('', { status: 200 });
	}

	let baseUrl = '';
	try {
		baseUrl = JSON.parse(view.private_metadata || '{}').baseUrl || '';
	} catch {
		// 무시
	}

	const [teamName, userName] = await Promise.all([getTeamName(env, teamId), getUserName(env, teamId, userId)]);
	const apiToken = await issueApiToken(env, teamId, userId, { teamName, userName });

	const res = await fetch('https://slack.com/api/views.update', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${botToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			view_id: view.id,
			hash: view.hash,
			view: {
				type: 'modal',
				callback_id: 'extension_token_modal',
				title: { type: 'plain_text', text: '크롬 익스텐션 연결' },
				close: { type: 'plain_text', text: '닫기' },
				blocks: [
					{
						type: 'section',
						text: {
							type: 'mrkdwn',
							text: `:fairy-wand: *${teamName}* 워크스페이스용 토큰이에요. 익스텐션 팝업의 *＋ 워크스페이스 추가*에 붙여넣어 주세요.\n이 토큰은 *지금 한 번만* 보여요. 비밀번호처럼 다른 사람과 공유하지 마세요.`,
						},
					},
					{ type: 'section', text: { type: 'mrkdwn', text: '```' + apiToken + '```' } },
					...(baseUrl
						? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `서버 주소: \`${baseUrl}\` (기본값이라 그대로 두면 돼요)` }] }]
						: []),
					{ type: 'divider' },
					{ type: 'context', elements: [{ type: 'mrkdwn', text: EXTENSION_NOTES }] },
				],
			},
		}),
	});

	const data = (await res.json()) as { ok: boolean; error?: string };
	if (!data.ok) {
		console.error('Failed to update extension token modal:', data.error);
	}
	return new Response('', { status: 200 });
}
