import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { buildUsageReport, renderUsageText, type UsageKVReader } from '../src/services/usage';
import { issueApiToken } from '../src/api/auth';
import type { Session } from '../src/types';

const KST = (iso: string) => Date.parse(`${iso}+09:00`);
const NOW = KST('2026-10-24T15:00:00'); // 토요일
const H = 3600e3;

function s(userId: string, start: string, hours: number, extra: Partial<Session> = {}): Session {
	const t = KST(start);
	return { userId, start: t, end: t + hours * H, duration: hours * H, ...extra };
}

async function seed(teamId: string, date: string, sessions: Session[]) {
	await env.STUDY_KV.put(`${teamId}:sessions:${date}`, JSON.stringify(sessions));
}

/** 테스트 KV를 로컬 스크립트와 같은 읽기 전용 인터페이스로 */
const kv: UsageKVReader = {
	async listKeys() {
		const names: string[] = [];
		let cursor: string | undefined;
		do {
			const page = await env.STUDY_KV.list({ cursor });
			names.push(...page.keys.map((k) => k.name));
			cursor = page.list_complete ? undefined : page.cursor;
		} while (cursor);
		return names;
	},
	get: (key) => env.STUDY_KV.get(key),
};

describe('사용 현황 집계 (npm run usage)', () => {
	it('워크스페이스별 · 일별 · 주별 · 기능 합계', async () => {
		await env.STUDY_KV.put('tokens:T_A', 'xoxb-a');
		await env.STUDY_KV.put('tokens:T_GONE', 'xoxb-gone');
		// T_A: 지난주(10/12 주)에 u1, u2 → 이번 주(10/19 주)에 u1, u3
		await seed('T_A', '2026-10-13', [s('u1', '2026-10-13T10:00:00', 2, { tag: 'study' }), s('u2', '2026-10-13T11:00:00', 1)]);
		await seed('T_A', '2026-10-20', [
			s('u1', '2026-10-20T10:00:00', 3, { source: 'extension', endSource: 'extension', label: '알고리즘', pauseDuration: 600e3 }),
			s('u3', '2026-10-20T13:00:00', 1, { source: 'extension', recordOnly: true }),
		]);
		await seed('T_A', '2026-10-24', [s('u1', '2026-10-24T09:00:00', 2, { tag: 'side', endSource: 'slack' })]);
		// T_GONE: 30일 밖에서만 기록 — 7월에 멈춘 워크스페이스
		await seed('T_GONE', '2026-07-02', [s('x1', '2026-07-02T09:00:00', 8)]);
		// 같은 사용자 ID라도 다른 워크스페이스면 다른 사람
		await seed('T_B', '2026-10-22', [s('u1', '2026-10-22T09:00:00', 1)]);
		await env.STUDY_KV.put('T_A:checkin:u1', JSON.stringify({ time: NOW - H }));
		await env.STUDY_KV.put('T_GONE:checkin:x1', JSON.stringify({ time: KST('2026-07-02T09:00:00') }));
		await env.STUDY_KV.put('T_A:goal:u1', String(40 * H));
		await env.STUDY_KV.put('T_A:userToken:u3', 'xoxp-u3');

		const r = await buildUsageReport(kv, { now: NOW, teamName: async (id) => (id === 'T_A' ? '모각코 스터디' : id) });

		expect(r.totals).toMatchObject({ teams: 3, activeTeams30: 2, users30: 4, users7: 3, sessions30: 6, focusMs30: 10 * H, focusingNow: 1, staleCheckins: 1 });

		const a = r.teams.find((t) => t.teamId === 'T_A')!;
		expect(a).toMatchObject({ installed: true, users30: 3, users7: 2, sessions30: 5, focusMs30: 9 * H, activeDays30: 3, focusingNow: 1, lastActive: '2026-10-24' });
		const gone = r.teams.find((t) => t.teamId === 'T_GONE')!;
		expect(gone).toMatchObject({ installed: true, users30: 0, sessions30: 0, lastActive: '2026-07-02' });
		expect(r.teams.find((t) => t.teamId === 'T_B')).toMatchObject({ installed: false, users30: 1 });
		expect(r.teams[0]).toMatchObject({ teamId: 'T_A', name: '모각코 스터디' });

		expect(r.daily).toHaveLength(30);
		expect(r.daily.at(-1)).toEqual({ date: '2026-10-24', users: 1, sessions: 1, focusMs: 2 * H, extensionSessions: 0 });
		expect(r.daily.find((d) => d.date === '2026-10-20')).toMatchObject({ users: 2, sessions: 2, extensionSessions: 2 });

		expect(r.weekly).toHaveLength(8);
		const [lastWeek, thisWeek] = r.weekly.slice(-2);
		expect(lastWeek).toMatchObject({ week: '2026-10-12', users: 2, newUsers: 2, retained: 0, retention: null });
		// 이번 주: T_A u1(유지), T_A u3(신규), T_B u1(신규)
		expect(thisWeek).toMatchObject({ week: '2026-10-19', users: 3, newUsers: 2, retained: 1, retention: 0.5 });

		expect(r.features).toEqual({
			sessions: 6,
			withTag: 2,
			withPlan: 1,
			withPause: 1,
			startedFromExtension: 2,
			endedFromExtension: 1,
			recordOnly: 1,
			usersWithGoal: 1,
			usersWithStatusSync: 1,
		});
	});

	it('결과에 사용자 ID와 계획 내용이 들어가지 않는다', async () => {
		await seed('T_P', '2026-10-24', [s('U_SECRET_ID', '2026-10-24T09:00:00', 1, { label: '비밀 계획' })]);
		const report = await buildUsageReport(kv, { now: NOW });
		for (const text of [JSON.stringify(report), renderUsageText(report)]) {
			expect(text).not.toContain('U_SECRET_ID');
			expect(text).not.toContain('비밀 계획');
		}
	});

	it('터미널 출력 — 워크스페이스 표, 주별, 일별, 기능', async () => {
		await seed('T_A', '2026-10-24', [s('u1', '2026-10-24T09:00:00', 2, { source: 'extension' })]);
		const text = renderUsageText(await buildUsageReport(kv, { now: NOW, teamName: async () => '모각코 스터디' }));
		expect(text).toContain('최근 30일 · 2026-10-24 15:00 KST');
		expect(text).toContain('모각코 스터디 (T_A)');
		expect(text).toContain('■ 주별 사용자');
		expect(text).toContain('10/24');
		expect(text).toMatch(/익스텐션에서 시작\s+100%\s+1/);
	});
});

describe('세션 출처 기록', () => {
	it('익스텐션에서 시작·종료하면 source / endSource = extension, 채널 없이 시작하면 recordOnly', async () => {
		const token = await issueApiToken(env, 'T_SRC', 'U_SRC');
		const call = (path: string, body: unknown) =>
			SELF.fetch(`https://example.com${path}`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});

		expect((await call('/api/session/start', { channelId: null })).status).toBe(200);
		expect((await call('/api/session/end', { duration: 60e3 })).status).toBe(200);

		const { keys } = await env.STUDY_KV.list({ prefix: 'T_SRC:sessions:' });
		const sessions = JSON.parse((await env.STUDY_KV.get(keys[0].name))!) as Session[];
		expect(sessions[0]).toMatchObject({ source: 'extension', endSource: 'extension', recordOnly: true });
	});

	it('Slack에서 시작·종료하면 source / endSource = slack', async () => {
		const command = (cmd: string, text = '') => {
			const body = new FormData();
			body.set('command', cmd);
			body.set('user_id', 'U_SLK');
			body.set('team_id', 'T_SLK');
			body.set('channel_id', 'C_SLK');
			body.set('channel_name', 'general');
			body.set('text', text);
			return SELF.fetch('https://example.com/slack/commands', { method: 'POST', body });
		};
		await command('/start');
		await command('/end');

		const { keys } = await env.STUDY_KV.list({ prefix: 'T_SLK:sessions:' });
		const sessions = JSON.parse((await env.STUDY_KV.get(keys[0].name))!) as Session[];
		expect(sessions[0]).toMatchObject({ source: 'slack', endSource: 'slack' });
		expect(sessions[0].recordOnly).toBeUndefined();
	});
});
