/**
 * 슬랙 유틸리티
 */

/** 슬랙 in_channel 응답 생성 (모두에게 보임) */
export function reply(text: string): Response {
	return new Response(JSON.stringify({ response_type: 'in_channel', text }), {
		headers: { 'Content-Type': 'application/json' },
	});
}

/** 슬랙 ephemeral 응답 생성 (명령어 입력한 사람만 보임) */
export function replyEphemeral(text: string): Response {
	return new Response(JSON.stringify({ response_type: 'ephemeral', text }), {
		headers: { 'Content-Type': 'application/json' },
	});
}

/** Team ID에 맞는 Bot Token 가져오기 */
export function getBotToken(env: Env, teamId: string): string | null {
	try {
		// JSON 형식: {"T123":"xoxb-...", "T456":"xoxb-..."}
		if (env.SLACK_BOT_TOKENS) {
			const tokens = JSON.parse(env.SLACK_BOT_TOKENS) as Record<string, string>;
			return tokens[teamId] || null;
		}
	} catch (error) {
		console.error('Failed to parse SLACK_BOT_TOKENS:', error);
	}

	return null;
}

/** 채널에 메시지 전송 (chat.postMessage API) */
export async function postMessage(env: Env, teamId: string, channel: string, text: string): Promise<boolean> {
	const token = getBotToken(env, teamId);
	if (!token) {
		console.error('No bot token for team:', teamId);
		return false;
	}

	try {
		const response = await fetch('https://slack.com/api/chat.postMessage', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ channel, text }),
		});

		const data = (await response.json()) as { ok: boolean; error?: string };
		if (!data.ok) {
			console.error('Failed to post message:', data.error);
			return false;
		}
		return true;
	} catch (error) {
		console.error('Failed to post message:', error);
		return false;
	}
}

/** 사용자 이름 캐시 (요청당 메모리 캐시) */
const userNameCache = new Map<string, string>();

/** Slack API로 사용자 display name 조회 */
export async function getUserName(env: Env, teamId: string, userId: string): Promise<string> {
	// 캐시 확인
	const cacheKey = `${teamId}:${userId}`;
	if (userNameCache.has(cacheKey)) {
		return userNameCache.get(cacheKey)!;
	}

	const token = getBotToken(env, teamId);
	if (!token) {
		return userId;
	}

	try {
		const response = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
		});

		const data = (await response.json()) as SlackUserResponse;

		if (data.ok && data.user) {
			// display_name이 있으면 사용, 없으면 real_name, 그것도 없으면 name
			const name = data.user.profile?.display_name || data.user.real_name || data.user.name || userId;
			userNameCache.set(cacheKey, name);
			return name;
		}
	} catch (error) {
		console.error('Failed to fetch user info:', error);
	}

	// 실패 시 userId 그대로 반환
	return userId;
}

/** 여러 사용자 이름을 한번에 조회 */
export async function getUserNames(env: Env, teamId: string, userIds: string[]): Promise<Map<string, string>> {
	const names = new Map<string, string>();
	await Promise.all(
		userIds.map(async (userId) => {
			const name = await getUserName(env, teamId, userId);
			names.set(userId, name);
		})
	);
	return names;
}

/** Slack users.info API 응답 타입 */
interface SlackUserResponse {
	ok: boolean;
	user?: {
		name?: string;
		real_name?: string;
		profile?: {
			display_name?: string;
		};
	};
	error?: string;
}

/** 파일 업로드 (files.upload API) */
export async function uploadFile(
	env: Env,
	teamId: string,
	channelId: string,
	content: string,
	filename: string,
	title: string
): Promise<boolean> {
	const token = getBotToken(env, teamId);
	if (!token) {
		console.error('No bot token for team:', teamId);
		return false;
	}

	try {
		// files.uploadV2를 위해 먼저 getUploadURLExternal로 URL 받기
		const getUrlResponse = await fetch(
			`https://slack.com/api/files.getUploadURLExternal?filename=${encodeURIComponent(filename)}&length=${new Blob([content]).size}`,
			{
				method: 'GET',
				headers: {
					Authorization: `Bearer ${token}`,
				},
			}
		);

		const urlData = (await getUrlResponse.json()) as { ok: boolean; upload_url?: string; file_id?: string; error?: string };
		if (!urlData.ok || !urlData.upload_url || !urlData.file_id) {
			console.error('Failed to get upload URL:', urlData.error);
			return false;
		}

		// 파일 내용 업로드
		const uploadResponse = await fetch(urlData.upload_url, {
			method: 'POST',
			body: content,
		});

		if (!uploadResponse.ok) {
			console.error('Failed to upload file content');
			return false;
		}

		// 업로드 완료 처리
		const completeResponse = await fetch('https://slack.com/api/files.completeUploadExternal', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				files: [{ id: urlData.file_id, title }],
				channel_id: channelId,
			}),
		});

		const completeData = (await completeResponse.json()) as { ok: boolean; error?: string };
		if (!completeData.ok) {
			console.error('Failed to complete upload:', completeData.error);
			return false;
		}

		return true;
	} catch (error) {
		console.error('Failed to upload file:', error);
		return false;
	}
}
