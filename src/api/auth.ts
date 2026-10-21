/**
 * 익스텐션 API 개인 토큰 — 발급 / 검증
 * 원본 토큰은 사용자에게 한 번만 보여주고, KV에는 SHA-256 해시만 저장한다.
 * 사용자당 토큰 1개: 재발급하면 이전 토큰은 즉시 무효화된다.
 */

const TOKEN_PREFIX = 'ff_';

export interface ApiIdentity {
	teamId: string;
	userId: string;
	/** 발급 시점의 워크스페이스 / 사용자 이름 (익스텐션 워크스페이스 전환 표시용) */
	teamName?: string;
	userName?: string;
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const base64 = btoa(String.fromCharCode(...bytes));
	return TOKEN_PREFIX + base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 새 토큰 발급 (이전 토큰은 폐기) */
export async function issueApiToken(
	env: Env,
	teamId: string,
	userId: string,
	names: { teamName?: string; userName?: string } = {}
): Promise<string> {
	await revokeApiToken(env, teamId, userId);

	const token = randomToken();
	const hash = await sha256Hex(token);
	await env.STUDY_KV.put(`apitoken:${hash}`, JSON.stringify({ teamId, userId, ...names, createdAt: Date.now() }));
	await env.STUDY_KV.put(`${teamId}:apiToken:${userId}`, hash);
	return token;
}

/** 사용자의 토큰 폐기 */
export async function revokeApiToken(env: Env, teamId: string, userId: string): Promise<void> {
	const previousHash = await env.STUDY_KV.get(`${teamId}:apiToken:${userId}`);
	if (previousHash) {
		await env.STUDY_KV.delete(`apitoken:${previousHash}`);
		await env.STUDY_KV.delete(`${teamId}:apiToken:${userId}`);
	}
}

/** Authorization: Bearer 헤더에서 사용자 식별. 유효하지 않으면 null */
export async function authenticateRequest(request: Request, env: Env): Promise<ApiIdentity | null> {
	const header = request.headers.get('Authorization') || '';
	const match = header.match(/^Bearer\s+(\S+)$/);
	if (!match || !match[1].startsWith(TOKEN_PREFIX)) {
		return null;
	}

	const hash = await sha256Hex(match[1]);
	const stored = await env.STUDY_KV.get(`apitoken:${hash}`);
	if (!stored) {
		return null;
	}

	try {
		const { teamId, userId, teamName, userName } = JSON.parse(stored) as ApiIdentity;
		return teamId && userId ? { teamId, userId, teamName, userName } : null;
	} catch {
		return null;
	}
}
