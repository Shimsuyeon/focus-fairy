/**
 * API 개인 토큰 — 발급 / 검증 (크롬 익스텐션, 모바일 웹앱)
 * 원본 토큰은 사용자에게 한 번만 보여주고, KV에는 SHA-256 해시만 저장한다.
 * 클라이언트(익스텐션 / 웹앱)마다 사용자당 토큰 1개: 재발급하면 같은 클라이언트의 이전 토큰만 즉시 무효화된다.
 */

const TOKEN_PREFIX = 'ff_';
const CONNECT_CODE_TTL = 10 * 60; // 초

/** 토큰을 쓰는 곳 — 세션 출처(source)로도 기록된다 */
export type ApiClient = 'extension' | 'app';

/** 웹앱 연결 코드: 홈 화면 앱에 직접 입력할 수 있게 짧게. 헷갈리는 글자(0 O 1 I L) 제외 */
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SHORT_CODE_LENGTH = 8;

export interface ApiIdentity {
	teamId: string;
	userId: string;
	/** 발급 시점의 워크스페이스 / 사용자 이름 (워크스페이스 전환 표시용) */
	teamName?: string;
	userName?: string;
	client?: ApiClient;
}

/** 사용자 → 현재 토큰 해시. 익스텐션은 예전 키를 그대로 쓴다 */
function tokenIndexKey(teamId: string, userId: string, client: ApiClient): string {
	return client === 'app' ? `${teamId}:appToken:${userId}` : `${teamId}:apiToken:${userId}`;
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

function randomShortCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(SHORT_CODE_LENGTH));
	return [...bytes].map((b) => SHORT_CODE_ALPHABET[b % SHORT_CODE_ALPHABET.length]).join('');
}

/** 'abcd-efgh' 처럼 입력해도 같은 코드로. 긴 코드(익스텐션)는 그대로 */
function normalizeCode(code: string): string {
	const compact = code.trim().replace(/[\s-]/g, '');
	return compact.length === SHORT_CODE_LENGTH ? compact.toUpperCase() : code.trim();
}

/** ABCD-EFGH — 화면에 보여줄 때 */
export function formatShortCode(code: string): string {
	return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** 새 토큰 발급 (이전 토큰은 폐기) */
export async function issueApiToken(
	env: Env,
	teamId: string,
	userId: string,
	names: { teamName?: string; userName?: string } = {},
	client: ApiClient = 'extension'
): Promise<string> {
	await revokeApiToken(env, teamId, userId, client);

	const token = randomToken();
	const hash = await sha256Hex(token);
	await env.STUDY_KV.put(`apitoken:${hash}`, JSON.stringify({ teamId, userId, ...names, client, createdAt: Date.now() }));
	await env.STUDY_KV.put(tokenIndexKey(teamId, userId, client), hash);
	return token;
}

/** 사용자의 토큰 폐기 (해당 클라이언트만) */
export async function revokeApiToken(env: Env, teamId: string, userId: string, client: ApiClient = 'extension'): Promise<void> {
	const indexKey = tokenIndexKey(teamId, userId, client);
	const previousHash = await env.STUDY_KV.get(indexKey);
	if (previousHash) {
		await env.STUDY_KV.delete(`apitoken:${previousHash}`);
		await env.STUDY_KV.delete(indexKey);
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
		const { teamId, userId, teamName, userName, client } = JSON.parse(stored) as ApiIdentity;
		return teamId && userId ? { teamId, userId, teamName, userName, client: client === 'app' ? 'app' : 'extension' } : null;
	} catch {
		return null;
	}
}

/**
 * 연결용 일회용 코드 (10분).
 * - 익스텐션: Slack 모달의 '익스텐션에 연결하기' 버튼 → 연결 페이지 → 익스텐션이 코드를 토큰으로 바꾼다.
 * - 웹앱: '웹앱 열기' 링크(/app#code=...) 또는 홈 화면 앱에 8자리 코드를 직접 입력.
 *   (아이폰은 홈 화면 앱과 사파리가 저장소를 따로 써서, 앱 안에서 입력할 수 있어야 한다)
 * 토큰 원본을 URL에 싣지 않으려고 코드를 쓴다. 코드도 해시만 저장.
 */
export async function createConnectCode(
	env: Env,
	teamId: string,
	userId: string,
	names: { teamName?: string; userName?: string } = {},
	client: ApiClient = 'extension'
): Promise<string> {
	const code = client === 'app' ? randomShortCode() : randomBase64Url();
	await env.STUDY_KV.put(`connect:${await sha256Hex(code)}`, JSON.stringify({ teamId, userId, ...names, client }), {
		expirationTtl: CONNECT_CODE_TTL,
	});
	return code;
}

/** 연결 코드를 한 번만 사용해 새 토큰 발급 (이전 토큰은 폐기). 만료·사용된 코드면 null */
export async function redeemConnectCode(env: Env, code: string): Promise<{ token: string; identity: ApiIdentity } | null> {
	const key = `connect:${await sha256Hex(normalizeCode(code))}`;
	const stored = await env.STUDY_KV.get(key);
	if (!stored) return null;
	await env.STUDY_KV.delete(key);

	try {
		const identity = JSON.parse(stored) as ApiIdentity;
		if (!identity.teamId || !identity.userId) return null;
		const client: ApiClient = identity.client === 'app' ? 'app' : 'extension';
		const token = await issueApiToken(env, identity.teamId, identity.userId, { teamName: identity.teamName, userName: identity.userName }, client);
		return { token, identity: { ...identity, client } };
	} catch {
		return null;
	}
}
