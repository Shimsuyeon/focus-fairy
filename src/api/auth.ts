/**
 * 익스텐션 API 개인 토큰 — 발급 / 검증
 * 원본 토큰은 사용자에게 한 번만 보여주고, KV에는 SHA-256 해시만 저장한다.
 * 사용자당 토큰 1개: 재발급하면 이전 토큰은 즉시 무효화된다.
 */

const TOKEN_PREFIX = 'ff_';
const CONNECT_CODE_TTL = 10 * 60; // 초

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

function randomBase64Url(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const base64 = btoa(String.fromCharCode(...bytes));
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(): string {
	return TOKEN_PREFIX + randomBase64Url();
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

/**
 * 익스텐션 연결 링크용 일회용 코드 (10분).
 * Slack 모달의 '익스텐션에 연결하기' 버튼 → 연결 페이지 → 익스텐션이 코드를 토큰으로 바꾼다.
 * 토큰 원본을 URL에 싣지 않으려고 코드를 쓴다. 코드도 해시만 저장.
 */
export async function createConnectCode(
	env: Env,
	teamId: string,
	userId: string,
	names: { teamName?: string; userName?: string } = {}
): Promise<string> {
	const code = randomBase64Url();
	await env.STUDY_KV.put(`connect:${await sha256Hex(code)}`, JSON.stringify({ teamId, userId, ...names }), {
		expirationTtl: CONNECT_CODE_TTL,
	});
	return code;
}

/** 연결 코드를 한 번만 사용해 새 토큰 발급 (이전 토큰은 폐기). 만료·사용된 코드면 null */
export async function redeemConnectCode(env: Env, code: string): Promise<{ token: string; identity: ApiIdentity } | null> {
	const key = `connect:${await sha256Hex(code)}`;
	const stored = await env.STUDY_KV.get(key);
	if (!stored) return null;
	await env.STUDY_KV.delete(key);

	try {
		const identity = JSON.parse(stored) as ApiIdentity;
		if (!identity.teamId || !identity.userId) return null;
		const token = await issueApiToken(env, identity.teamId, identity.userId, { teamName: identity.teamName, userName: identity.userName });
		return { token, identity };
	} catch {
		return null;
	}
}
