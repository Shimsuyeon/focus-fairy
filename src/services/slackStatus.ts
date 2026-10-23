/**
 * 세션 상태 → Slack status 동기화 (/settings sync 연결한 사용자만)
 *
 * | 동작          | status                      | 만료                     |
 * | 시작 / 재개   | 💻 집중 중                  | 없음                     |
 * | 쉬어가기      | ☕ 잠깐 자리비움            | 없음                     |
 * | 종료          | 💤 오늘 2시간 40분 집중     | 종료 후 처음 오는 06:00 KST |
 *
 * users.profile:read 권한이 있으면 사용자가 직접 설정한 status는 지킨다.
 * - 시작할 때 사용자 status가 있으면 기억해뒀다가 종료할 때 되돌린다
 * - 세션 중에 사용자가 status를 직접 바꿨으면 건드리지 않는다
 * 권한이 없는(예전에 연결한) 사용자는 그냥 덮어쓴다.
 */

import { getUserStatus, setUserStatus, type SlackStatus } from '../utils/slack';
import { formatDuration } from '../utils/format';

export const PROFILE_READ_SCOPE = 'users.profile:read';

const FOCUSING = { text: '집중 중', emoji: ':computer:' };
const PAUSED = { text: '잠깐 자리비움', emoji: ':coffee:' };
const ENDED_EMOJI = ':zzz:';

const KST_OFFSET = 9 * 60 * 60 * 1000;
const RESET_HOUR_KST = 6;

const ownedKey = (teamId: string, userId: string) => `${teamId}:statusOwned:${userId}`;
const savedKey = (teamId: string, userId: string) => `${teamId}:statusSaved:${userId}`;
const scopeKey = (teamId: string, userId: string) => `${teamId}:userTokenScope:${userId}`;

/** 종료 후 처음 오는 오전 6시(KST) — Unix 초 */
export function nextStatusResetAt(now: number): number {
	const kst = new Date(now + KST_OFFSET);
	const reset = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), RESET_HOUR_KST) - KST_OFFSET;
	return Math.floor((reset > now ? reset : reset + 24 * 60 * 60 * 1000) / 1000);
}

/** 종료 status 문구 — 세션이 기록된 날(시작일)이 오늘이면 '오늘', 아니면 '어제' */
export function endedStatusText(dayTotalMs: number, isToday: boolean): string {
	return `${isToday ? '오늘' : '어제'} ${formatDuration(dayTotalMs)} 집중`;
}

/** user OAuth 콜백에서 받은 scope 저장 — 읽기 권한 여부 판단용 */
export async function saveUserTokenScope(env: Env, teamId: string, userId: string, scope: string | undefined): Promise<void> {
	await env.STUDY_KV.put(scopeKey(teamId, userId), scope || '');
}

export async function canReadUserStatus(env: Env, teamId: string, userId: string): Promise<boolean> {
	const scope = await env.STUDY_KV.get(scopeKey(teamId, userId));
	return !!scope && scope.split(',').includes(PROFILE_READ_SCOPE);
}

function isEmpty(status: SlackStatus): boolean {
	return !status.text && !status.emoji;
}

/** 집중요정이 찍은 status인지 — 마지막으로 찍은 값, 또는 이 기능 이전에 찍던 고정 문구 */
function isOurs(status: SlackStatus, owned: { text: string; emoji: string } | null): boolean {
	if (owned && status.text === owned.text && status.emoji === owned.emoji) return true;
	return [FOCUSING, PAUSED].some((s) => s.text === status.text && s.emoji === status.emoji);
}

async function getOwned(env: Env, teamId: string, userId: string): Promise<{ text: string; emoji: string } | null> {
	const raw = await env.STUDY_KV.get(ownedKey(teamId, userId));
	return raw ? JSON.parse(raw) : null;
}

async function setOwned(env: Env, teamId: string, userId: string, text: string, emoji: string, expiration = 0): Promise<boolean> {
	const ok = await setUserStatus(env, teamId, userId, text, emoji, expiration);
	if (ok) await env.STUDY_KV.put(ownedKey(teamId, userId), JSON.stringify({ text, emoji }));
	return ok;
}

/**
 * 읽기 권한이 있으면 현재 status를 읽어 사용자 것인지 판단.
 * - 'none': 읽기 권한 없음 / 읽기 실패 → 판단 불가 (덮어쓴다)
 * - 'ours' / 'user': 읽은 결과
 */
async function inspectCurrent(env: Env, teamId: string, userId: string): Promise<{ kind: 'none' } | { kind: 'ours' } | { kind: 'user'; status: SlackStatus }> {
	if (!(await canReadUserStatus(env, teamId, userId))) return { kind: 'none' };
	const current = await getUserStatus(env, teamId, userId);
	if (!current) return { kind: 'none' };
	if (isEmpty(current) || isOurs(current, await getOwned(env, teamId, userId))) return { kind: 'ours' };
	return { kind: 'user', status: current };
}

/** 세션 시작 — 사용자 status가 있으면 기억해두고 💻로 바꾼다 */
export async function applyStartStatus(env: Env, teamId: string, userId: string): Promise<boolean> {
	const current = await inspectCurrent(env, teamId, userId);
	if (current.kind === 'user') {
		await env.STUDY_KV.put(savedKey(teamId, userId), JSON.stringify(current.status));
	} else if (current.kind === 'ours') {
		await env.STUDY_KV.delete(savedKey(teamId, userId));
	}
	return setOwned(env, teamId, userId, FOCUSING.text, FOCUSING.emoji);
}

/** 쉬어가기 / 재개 — 세션 중에 사용자가 직접 바꾼 status는 건드리지 않는다 */
export async function applyPauseStatus(env: Env, teamId: string, userId: string, paused: boolean): Promise<boolean> {
	const current = await inspectCurrent(env, teamId, userId);
	if (current.kind === 'user') return false;
	const next = paused ? PAUSED : FOCUSING;
	return setOwned(env, teamId, userId, next.text, next.emoji);
}

/**
 * 세션 종료
 * - 세션 중에 사용자가 status를 바꿨으면 그대로 둔다
 * - 시작 전 사용자 status가 있었고 아직 유효하면 되돌린다
 * - 아니면 💤 + 그날 누적 시간을 찍고 다음 오전 6시에 사라지게 한다
 */
export async function applyEndStatus(
	env: Env,
	teamId: string,
	userId: string,
	{ dayTotalMs, isToday, now }: { dayTotalMs: number; isToday: boolean; now: number }
): Promise<boolean> {
	const current = await inspectCurrent(env, teamId, userId);
	const savedRaw = current.kind === 'none' ? null : await env.STUDY_KV.get(savedKey(teamId, userId));
	if (savedRaw) await env.STUDY_KV.delete(savedKey(teamId, userId));

	if (current.kind === 'user') {
		await env.STUDY_KV.delete(ownedKey(teamId, userId));
		return false;
	}

	if (current.kind === 'ours' && savedRaw) {
		const saved = JSON.parse(savedRaw) as SlackStatus;
		if (saved.expiration === 0 || saved.expiration * 1000 > now) {
			await env.STUDY_KV.delete(ownedKey(teamId, userId));
			return setUserStatus(env, teamId, userId, saved.text, saved.emoji, saved.expiration);
		}
	}

	return setOwned(env, teamId, userId, endedStatusText(dayTotalMs, isToday), ENDED_EMOJI, nextStatusResetAt(now));
}
