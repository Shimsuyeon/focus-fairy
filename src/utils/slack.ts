/**
 * 슬랙 유틸리티
 */

/** 슬랙 in_channel 응답 생성 */
export function reply(text: string): Response {
	return new Response(JSON.stringify({ response_type: 'in_channel', text }), {
		headers: { 'Content-Type': 'application/json' },
	});
}

/** 사용자 이름 캐시 (요청당 메모리 캐시) */
const userNameCache = new Map<string, string>();

/** Slack API로 사용자 display name 조회 */
export async function getUserName(env: Env, userId: string): Promise<string> {
	// 캐시 확인
	if (userNameCache.has(userId)) {
		return userNameCache.get(userId)!;
	}

	try {
		const response = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
			headers: {
				Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		const data = (await response.json()) as SlackUserResponse;

		if (data.ok && data.user) {
			// display_name이 있으면 사용, 없으면 real_name, 그것도 없으면 name
			const name = data.user.profile?.display_name || data.user.real_name || data.user.name || userId;
			userNameCache.set(userId, name);
			return name;
		}
	} catch (error) {
		console.error('Failed to fetch user info:', error);
	}

	// 실패 시 userId 그대로 반환
	return userId;
}

/** 여러 사용자 이름을 한번에 조회 */
export async function getUserNames(env: Env, userIds: string[]): Promise<Map<string, string>> {
	const names = new Map<string, string>();
	await Promise.all(
		userIds.map(async (userId) => {
			const name = await getUserName(env, userId);
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
