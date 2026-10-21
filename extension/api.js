/**
 * 집중요정 API 클라이언트 + 시간 표시 유틸 (팝업 / background 공용)
 */

export const DEFAULT_SERVER = 'https://focus-fairy.suyeonshim.workers.dev';

export class ApiError extends Error {
	constructor(status, code, message) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

/*
 * 저장 구조 (chrome.storage.local) — 워크스페이스마다 계정 하나
 *   accounts:        [{ id, serverUrl, token, teamId?, teamName?, userId?, userName? }]
 *   activeAccountId: 팝업에서 보고 있는 계정
 *   sessions:        { [accountId]: 세션 캐시 } — 배지용
 *   authErrors:      { [accountId]: true } — 토큰 무효
 *   channelChoices:  { [accountId]: channelId | NO_CHANNEL }
 */

export const NO_CHANNEL = '__none__';

/** 단일 토큰 시절 저장값(token, serverUrl, session, channelChoice)을 계정 구조로 옮긴다 */
async function migrateLegacyConfig() {
	const legacy = await chrome.storage.local.get(['token', 'serverUrl', 'session', 'channelChoice', 'accounts']);
	if (!legacy.token || legacy.accounts) return;

	const id = crypto.randomUUID();
	await chrome.storage.local.set({
		accounts: [{ id, serverUrl: legacy.serverUrl || DEFAULT_SERVER, token: legacy.token }],
		activeAccountId: id,
		sessions: legacy.session ? { [id]: legacy.session } : {},
		channelChoices: legacy.channelChoice ? { [id]: legacy.channelChoice } : {},
	});
	await chrome.storage.local.remove(['token', 'serverUrl', 'session', 'channelChoice', 'authError']);
}

export async function getAccounts() {
	await migrateLegacyConfig();
	const { accounts = [], activeAccountId } = await chrome.storage.local.get(['accounts', 'activeAccountId']);
	const active = accounts.find((a) => a.id === activeAccountId) || accounts[0] || null;
	return { accounts, active };
}

export async function getActiveAccount() {
	return (await getAccounts()).active;
}

export async function setActiveAccount(id) {
	await chrome.storage.local.set({ activeAccountId: id });
}

/** id 기준으로 추가 또는 갱신. 같은 서버·워크스페이스·사용자의 기존 계정은 지운다 (토큰 재발급 후 다시 추가한 경우) */
export async function saveAccount(account) {
	const { accounts } = await getAccounts();
	const sameUser = (a) =>
		a.id !== account.id && account.teamId && a.teamId === account.teamId && a.userId === account.userId && a.serverUrl === account.serverUrl;
	for (const old of accounts.filter(sameUser)) await removeAccount(old.id);

	const { accounts: current } = await getAccounts();
	const exists = current.some((a) => a.id === account.id);
	const next = exists ? current.map((a) => (a.id === account.id ? account : a)) : [...current, account];
	await chrome.storage.local.set({ accounts: next });
}

export async function removeAccount(id) {
	const { accounts = [], activeAccountId, sessions = {}, authErrors = {}, channelChoices = {} } = await chrome.storage.local.get([
		'accounts',
		'activeAccountId',
		'sessions',
		'authErrors',
		'channelChoices',
	]);
	delete sessions[id];
	delete authErrors[id];
	delete channelChoices[id];
	const remaining = accounts.filter((a) => a.id !== id);
	await chrome.storage.local.set({
		accounts: remaining,
		activeAccountId: activeAccountId === id ? remaining[0]?.id || null : activeAccountId,
		sessions,
		authErrors,
		channelChoices,
	});
}

export function normalizeServerUrl(url) {
	return (url || DEFAULT_SERVER).trim().replace(/\/+$/, '');
}

/** 계정별 캐시(세션, 인증 오류) 갱신 */
export async function setAccountState(id, { session, authError }) {
	const { sessions = {}, authErrors = {} } = await chrome.storage.local.get(['sessions', 'authErrors']);
	if (session !== undefined) sessions[id] = session;
	if (authError) authErrors[id] = true;
	else delete authErrors[id];
	await chrome.storage.local.set({ sessions, authErrors });
}

export async function getChannelChoice(id) {
	const { channelChoices = {} } = await chrome.storage.local.get('channelChoices');
	return channelChoices[id];
}

export async function setChannelChoice(id, value) {
	const { channelChoices = {} } = await chrome.storage.local.get('channelChoices');
	channelChoices[id] = value;
	await chrome.storage.local.set({ channelChoices });
}

/** 저장된 채널 선택 → start API의 channelId (null = 채널에 안 올림, undefined = 서버 기본값) */
export function toStartChannelId(choice) {
	if (choice === NO_CHANNEL) return null;
	return choice || undefined;
}

/**
 * 인증 포함 API 호출 (기본: 활성 계정).
 * needsConfirm 같은 ok:false 응답(200)은 그대로 반환하고, HTTP 에러만 throw
 */
export async function api(path, { method = 'GET', body, account } = {}) {
	const target = account || (await getActiveAccount());
	if (!target?.token) {
		throw new ApiError(401, 'no_token', '토큰을 먼저 입력해주세요.');
	}

	let res;
	try {
		res = await fetch(target.serverUrl + path, {
			method,
			headers: {
				Authorization: `Bearer ${target.token}`,
				...(body ? { 'Content-Type': 'application/json' } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
	} catch {
		throw new ApiError(0, 'network', '서버에 연결할 수 없어요.');
	}

	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new ApiError(res.status, data.error || 'unknown', data.message || `요청에 실패했어요. (${res.status})`);
	}
	return data;
}

/** 서버 카테고리(SESSION_TAGS) 값별 아이콘 */
export const TAG_ICONS = { study: '📚', side: '💻', reading: '📖', exercise: '🏃', etc: '✨' };

/** 휴식 시간을 뺀 순수 집중 경과 시간 (세션 / 팀원 상태 모두) */
export function focusedMs(session, now = Date.now()) {
	if (!session || session.state === 'idle' || !session.startTime) return 0;
	const end = session.state === 'paused' && session.pausedAt ? session.pausedAt : now;
	return Math.max(0, end - session.startTime - (session.totalPauseDuration || 0));
}

/** 1:05:09 */
export function formatClock(ms) {
	const total = Math.floor(ms / 1000);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 2시간 30분 */
export function formatDuration(ms) {
	const totalMin = Math.floor(ms / 60000);
	const h = Math.floor(totalMin / 60);
	const m = totalMin % 60;
	if (h === 0) return `${m}분`;
	return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 툴바 배지는 4글자까지: 25m, 1h05 */
export function badgeText(ms) {
	const totalMin = Math.floor(ms / 60000);
	if (totalMin < 60) return `${totalMin}m`;
	const h = Math.floor(totalMin / 60);
	if (h >= 10) return `${h}h`;
	return `${h}h${String(totalMin % 60).padStart(2, '0')}`;
}
