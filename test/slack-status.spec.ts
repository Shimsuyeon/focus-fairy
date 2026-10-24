import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyStartStatus, applyPauseStatus, applyEndStatus, nextStatusResetAt, endedStatusText } from '../src/services/slackStatus';

const TEAM = 'T_STATUS';
const USER = 'U_STATUS';
const KST = (iso: string) => Date.parse(`${iso}+09:00`);

/** 가짜 Slack — users.profile.get / set 만 흉내 */
let profile: { status_text: string; status_emoji: string; status_expiration: number };
let setCalls: Array<typeof profile>;

function mockSlack() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		if (url.endsWith('/users.profile.get')) return Response.json({ ok: true, profile });
		if (url.endsWith('/users.profile.set')) {
			const next = JSON.parse(String(init?.body)).profile;
			profile = next;
			setCalls.push(next);
			return Response.json({ ok: true });
		}
		return Response.json({ ok: false, error: 'unexpected' });
	});
}

async function connect(scope: string) {
	await env.STUDY_KV.put(`${TEAM}:userToken:${USER}`, 'xoxp-test');
	await env.STUDY_KV.put(`${TEAM}:userTokenScope:${USER}`, scope);
}

const READ = 'users.profile:write,users.profile:read';
const WRITE_ONLY = 'users.profile:write';

describe('Slack status 동기화', () => {
	beforeEach(async () => {
		profile = { status_text: '', status_emoji: '', status_expiration: 0 };
		setCalls = [];
		for (const k of ['userToken', 'userTokenScope', 'statusOwned', 'statusSaved']) await env.STUDY_KV.delete(`${TEAM}:${k}:${USER}`);
		mockSlack();
	});
	afterEach(() => vi.restoreAllMocks());

	it('만료는 종료 후 처음 오는 오전 6시(KST)', () => {
		expect(nextStatusResetAt(KST('2026-10-24T19:00:00'))).toBe(KST('2026-10-25T06:00:00') / 1000);
		expect(nextStatusResetAt(KST('2026-10-25T01:00:00'))).toBe(KST('2026-10-25T06:00:00') / 1000);
		expect(nextStatusResetAt(KST('2026-10-25T07:00:00'))).toBe(KST('2026-10-26T06:00:00') / 1000);
		expect(nextStatusResetAt(KST('2026-10-25T06:00:00'))).toBe(KST('2026-10-26T06:00:00') / 1000);
	});

	it('종료 문구는 세션이 기록된 날 기준으로 오늘 / 어제', () => {
		expect(endedStatusText(2 * 3600e3 + 40 * 60e3, true)).toBe('오늘 2시간 40분 집중');
		expect(endedStatusText(6.5 * 3600e3, false)).toBe('어제 6시간 30분 집중');
	});

	it('연결 안 했으면 아무것도 안 한다', async () => {
		expect(await applyStartStatus(env, TEAM, USER)).toBe(false);
		expect(setCalls).toHaveLength(0);
	});

	it('빈 status → 💻 → ☕ → 💻 → 💤 (6시 만료)', async () => {
		await connect(READ);
		const now = KST('2026-10-24T19:00:00');
		await applyStartStatus(env, TEAM, USER);
		expect(profile).toMatchObject({ status_text: '집중 중', status_emoji: ':computer:', status_expiration: 0 });
		await applyPauseStatus(env, TEAM, USER, true);
		expect(profile).toMatchObject({ status_text: '잠깐 자리비움', status_emoji: ':coffee:' });
		await applyPauseStatus(env, TEAM, USER, false);
		expect(profile.status_emoji).toBe(':computer:');
		await applyEndStatus(env, TEAM, USER, { dayTotalMs: 5 * 3600e3 + 10 * 60e3, isToday: true, now });
		expect(profile).toEqual({ status_text: '오늘 5시간 10분 집중', status_emoji: ':zzz:', status_expiration: KST('2026-10-25T06:00:00') / 1000 });
	});

	it('시작 전 사용자 status는 기억했다가 종료할 때 되돌린다', async () => {
		await connect(READ);
		profile = { status_text: '재택근무', status_emoji: ':house:', status_expiration: 0 };
		await applyStartStatus(env, TEAM, USER);
		expect(profile.status_emoji).toBe(':computer:');
		await applyEndStatus(env, TEAM, USER, { dayTotalMs: 3600e3, isToday: true, now: Date.now() });
		expect(profile).toEqual({ status_text: '재택근무', status_emoji: ':house:', status_expiration: 0 });
		expect(await env.STUDY_KV.get(`${TEAM}:statusSaved:${USER}`)).toBeNull();
	});

	it('되돌릴 status가 이미 만료됐으면 💤를 찍는다', async () => {
		await connect(READ);
		const now = KST('2026-10-24T19:00:00');
		profile = { status_text: '점심', status_emoji: ':rice:', status_expiration: KST('2026-10-24T13:00:00') / 1000 };
		await applyStartStatus(env, TEAM, USER);
		await applyEndStatus(env, TEAM, USER, { dayTotalMs: 3600e3, isToday: true, now });
		expect(profile.status_emoji).toBe(':zzz:');
	});

	it('세션 중에 직접 바꾼 status는 쉬어가기·종료 때 건드리지 않는다', async () => {
		await connect(READ);
		await applyStartStatus(env, TEAM, USER);
		profile = { status_text: '회의 중', status_emoji: ':calendar:', status_expiration: 0 };
		expect(await applyPauseStatus(env, TEAM, USER, true)).toBe(false);
		await applyEndStatus(env, TEAM, USER, { dayTotalMs: 3600e3, isToday: true, now: Date.now() });
		expect(profile).toEqual({ status_text: '회의 중', status_emoji: ':calendar:', status_expiration: 0 });
		expect(setCalls).toHaveLength(1);
	});

	it('이전에 찍은 💤는 우리 것으로 보고 다음 시작 때 덮어쓴다 (저장 안 함)', async () => {
		await connect(READ);
		await applyStartStatus(env, TEAM, USER);
		await applyEndStatus(env, TEAM, USER, { dayTotalMs: 3600e3, isToday: true, now: Date.now() });
		await applyStartStatus(env, TEAM, USER);
		expect(profile.status_emoji).toBe(':computer:');
		expect(await env.STUDY_KV.get(`${TEAM}:statusSaved:${USER}`)).toBeNull();
	});

	it('이 기능 전에 찍힌 💻 집중 중도 우리 것으로 본다', async () => {
		await connect(READ);
		profile = { status_text: '집중 중', status_emoji: ':computer:', status_expiration: 0 };
		await applyEndStatus(env, TEAM, USER, { dayTotalMs: 3600e3, isToday: true, now: Date.now() });
		expect(profile.status_emoji).toBe(':zzz:');
	});

	it('읽기 권한이 없으면(예전 연결) 읽지 않고 덮어쓴다', async () => {
		await connect(WRITE_ONLY);
		profile = { status_text: '회의 중', status_emoji: ':calendar:', status_expiration: 0 };
		await applyStartStatus(env, TEAM, USER);
		expect(profile.status_emoji).toBe(':computer:');
		await applyEndStatus(env, TEAM, USER, { dayTotalMs: 6.5 * 3600e3, isToday: false, now: KST('2026-10-25T01:00:00') });
		expect(profile).toEqual({ status_text: '어제 6시간 30분 집중', status_emoji: ':zzz:', status_expiration: KST('2026-10-25T06:00:00') / 1000 });
		const urls = vi.mocked(globalThis.fetch).mock.calls.map(([u]) => String(u));
		expect(urls.some((u) => u.endsWith('/users.profile.get'))).toBe(false);
	});
});
