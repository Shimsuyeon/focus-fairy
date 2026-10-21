/**
 * 집중요정 API 클라이언트 + 시간 표시 유틸 (popup / background 공용)
 */

export const DEFAULT_SERVER = 'https://focus-fairy.suyeonshim.workers.dev';

export class ApiError extends Error {
	constructor(status, code, message) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

export async function getConfig() {
	const { serverUrl, token } = await chrome.storage.local.get(['serverUrl', 'token']);
	return { serverUrl: serverUrl || DEFAULT_SERVER, token: token || '' };
}

export async function saveConfig({ serverUrl, token }) {
	await chrome.storage.local.set({ serverUrl: (serverUrl || DEFAULT_SERVER).replace(/\/+$/, ''), token });
}

export async function clearConfig() {
	await chrome.storage.local.remove(['token', 'session', 'channelChoice']);
}

export const NO_CHANNEL = '__none__';

/** 팝업에서 고른 채널 → start API의 channelId (null = 채널에 안 올림, undefined = 서버 기본값) */
export async function getChannelChoice() {
	const { channelChoice } = await chrome.storage.local.get('channelChoice');
	if (channelChoice === NO_CHANNEL) return null;
	return channelChoice || undefined;
}

/** 인증 포함 API 호출. needsConfirm 같은 ok:false 응답(200)은 그대로 반환하고, HTTP 에러만 throw */
export async function api(path, { method = 'GET', body } = {}) {
	const { serverUrl, token } = await getConfig();
	if (!token) {
		throw new ApiError(401, 'no_token', '토큰을 먼저 입력해주세요.');
	}

	let res;
	try {
		res = await fetch(serverUrl + path, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
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

/** 휴식 시간을 뺀 순수 집중 경과 시간 */
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
