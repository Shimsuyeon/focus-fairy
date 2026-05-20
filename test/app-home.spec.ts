import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { buildHomeView, buildOnboardingView, HOME_ACTION } from '../src/pages/home/render';
import {
	getUserSessionState,
	getUserTodayStats,
	getUserWeeklyRank,
} from '../src/services/session';

const TEAM = 'T_HOME';
const USER = 'U_HOME';

describe('home view builders', () => {
	const baseStats = { totalMs: 0, sessionCount: 0 };
	const baseWeek = { rank: 0, totalMs: 0, teamSize: 0 };

	it('focusing 상태에선 진행 중 라벨 + 경과 시간이 본문에 들어간다', () => {
		const view = buildHomeView({
			userName: '수연',
			session: { state: 'focusing', startTime: Date.now() - 30 * 60 * 1000, elapsedMs: 30 * 60 * 1000, label: 'PR 리뷰' },
			today: { totalMs: 45 * 60 * 1000, sessionCount: 2 },
			week: { rank: 1, totalMs: 5 * 60 * 60 * 1000, teamSize: 4 },
			monthTotalMs: 20 * 60 * 60 * 1000, totalAllTimeMs: 100 * 60 * 60 * 1000,
		});

		const serialized = JSON.stringify(view);
		expect(view.type).toBe('home');
		expect(serialized).toContain('집중 중');
		expect(serialized).toContain('30분 경과');
		expect(serialized).toContain('PR 리뷰');
		expect(serialized).toContain('팀 내 1위 / 4명');
		expect(serialized).toContain('세션 2회');
	});

	it('paused 상태에선 일시정지 메시지가 노출된다', () => {
		const view = buildHomeView({
			userName: '수연',
			session: { state: 'paused', startTime: Date.now() - 60 * 60 * 1000, elapsedMs: 50 * 60 * 1000, pausedAt: Date.now() - 5 * 60 * 1000 },
			today: baseStats,
			week: baseWeek,
			monthTotalMs: 0, totalAllTimeMs: 0,
		});

		const serialized = JSON.stringify(view);
		expect(serialized).toContain('일시정지 중');
		expect(serialized).toContain('/resume');
	});

	it('idle 상태에선 시작 안내 메시지가 노출된다', () => {
		const view = buildHomeView({
			userName: '수연',
			session: { state: 'idle' },
			today: baseStats,
			week: baseWeek,
			monthTotalMs: 0, totalAllTimeMs: 0,
		});

		expect(JSON.stringify(view)).toContain('쉬는 중');
	});

	it('홈 뷰는 빠른 진입 버튼 3종을 모두 노출한다', () => {
		const view = buildHomeView({
			userName: '수연',
			session: { state: 'idle' },
			today: baseStats,
			week: baseWeek,
			monthTotalMs: 0, totalAllTimeMs: 0,
		});
		const serialized = JSON.stringify(view);

		expect(serialized).toContain(HOME_ACTION.settingsSync);
		expect(serialized).toContain(HOME_ACTION.settings);
		expect(serialized).toContain(HOME_ACTION.help);
	});

	it('온보딩 뷰는 환영 메시지 + 시작 가이드 + 도움말 버튼을 노출한다', () => {
		const view = buildOnboardingView({ userName: '수연' });
		const serialized = JSON.stringify(view);

		expect(view.type).toBe('home');
		expect(serialized).toContain('환영');
		expect(serialized).toContain('/start');
		expect(serialized).toContain('/end');
		expect(serialized).toContain(HOME_ACTION.help);
		expect(serialized).toContain(HOME_ACTION.settingsSync);
	});
});

describe('session 서비스 helper', () => {
	beforeEach(async () => {
		await env.STUDY_KV.delete(`${TEAM}:checkin:${USER}`);
		const todayKey = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
		await env.STUDY_KV.delete(`${TEAM}:sessions:${todayKey}`);
	});

	it('checkin 없으면 idle 상태', async () => {
		const state = await getUserSessionState(env, TEAM, USER);
		expect(state.state).toBe('idle');
	});

	it('checkin이 JSON이면 focusing 상태 + 경과 계산', async () => {
		const start = Date.now() - 20 * 60 * 1000;
		await env.STUDY_KV.put(`${TEAM}:checkin:${USER}`, JSON.stringify({ time: start, label: '작업' }));

		const state = await getUserSessionState(env, TEAM, USER);
		expect(state.state).toBe('focusing');
		expect(state.startTime).toBe(start);
		expect(state.label).toBe('작업');
		expect(state.elapsedMs!).toBeGreaterThan(19 * 60 * 1000);
	});

	it('pausedAt이 있으면 paused 상태로 인식되고 elapsed에서 휴식 시간 제외', async () => {
		const start = Date.now() - 60 * 60 * 1000;
		const pausedAt = Date.now() - 10 * 60 * 1000;
		await env.STUDY_KV.put(
			`${TEAM}:checkin:${USER}`,
			JSON.stringify({ time: start, pausedAt, totalPauseDuration: 0 }),
		);

		const state = await getUserSessionState(env, TEAM, USER);
		expect(state.state).toBe('paused');
		expect(state.pausedAt).toBe(pausedAt);
		// 50분 (60 - 10) 이상이어야 함
		expect(state.elapsedMs!).toBeGreaterThan(49 * 60 * 1000);
		expect(state.elapsedMs!).toBeLessThan(51 * 60 * 1000);
	});

	it('오늘 세션 통계 — 본인 세션만 카운트', async () => {
		const todayKey = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
		await env.STUDY_KV.put(
			`${TEAM}:sessions:${todayKey}`,
			JSON.stringify([
				{ userId: USER, start: 0, end: 0, duration: 25 * 60 * 1000 },
				{ userId: USER, start: 0, end: 0, duration: 15 * 60 * 1000 },
				{ userId: 'U_OTHER', start: 0, end: 0, duration: 50 * 60 * 1000 },
			]),
		);

		const stats = await getUserTodayStats(env, TEAM, USER);
		expect(stats.sessionCount).toBe(2);
		expect(stats.totalMs).toBe(40 * 60 * 1000);
	});

	it('이번 주 팀 랭킹 — 본인이 2위면 rank=2, teamSize=참여 인원', async () => {
		const todayKey = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
		await env.STUDY_KV.put(
			`${TEAM}:sessions:${todayKey}`,
			JSON.stringify([
				{ userId: USER, start: 0, end: 0, duration: 30 * 60 * 1000 },
				{ userId: 'U_OTHER', start: 0, end: 0, duration: 60 * 60 * 1000 },
				{ userId: 'U_THIRD', start: 0, end: 0, duration: 10 * 60 * 1000 },
			]),
		);

		const rank = await getUserWeeklyRank(env, TEAM, USER);
		expect(rank.rank).toBe(2);
		expect(rank.totalMs).toBe(30 * 60 * 1000);
		expect(rank.teamSize).toBe(3);
	});

	it('이번 주 미참여 사용자는 rank=0', async () => {
		const rank = await getUserWeeklyRank(env, TEAM, USER);
		expect(rank.rank).toBe(0);
		expect(rank.totalMs).toBe(0);
		expect(rank.teamSize).toBe(0);
	});
});

describe('/slack/events 라우트', () => {
	it('url_verification 챌린지를 그대로 응답한다', async () => {
		const res = await SELF.fetch('https://example.com/slack/events', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'url_verification', challenge: 'abc123' }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { challenge: string };
		expect(body.challenge).toBe('abc123');
	});

	it('알 수 없는 이벤트 타입은 200으로 통과', async () => {
		const res = await SELF.fetch('https://example.com/slack/events', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type: 'event_callback',
				team_id: TEAM,
				event: { type: 'message' },
			}),
		});

		expect(res.status).toBe(200);
	});

	it('app_home_opened 이벤트는 200으로 응답 (token 없으면 publish는 no-op)', async () => {
		const res = await SELF.fetch('https://example.com/slack/events', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type: 'event_callback',
				team_id: TEAM,
				event: { type: 'app_home_opened', user: USER, tab: 'home' },
			}),
		});

		expect(res.status).toBe(200);
	});

	it('messages 탭 이벤트는 무시됨', async () => {
		const res = await SELF.fetch('https://example.com/slack/events', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type: 'event_callback',
				team_id: TEAM,
				event: { type: 'app_home_opened', user: USER, tab: 'messages' },
			}),
		});

		expect(res.status).toBe(200);
	});
});
