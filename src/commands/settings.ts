/**
 * /settings 커맨드 핸들러
 * 워크스페이스 설정 모달
 */

import { replyEphemeral, getBotToken } from '../utils/slack';
import { MAX_AUTO_DURATION } from '../constants/messages';

export interface WorkspaceSettings {
	maxAutoDuration: number;
}

const DEFAULT_SETTINGS: WorkspaceSettings = {
	maxAutoDuration: MAX_AUTO_DURATION,
};

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
