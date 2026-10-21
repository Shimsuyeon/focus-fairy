import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { issueApiToken } from '../src/api/auth';

const TEAM = 'T_API';
const USER = 'U_API';

function callApi(path: string, token: string | null, body?: unknown) {
	return SELF.fetch(`https://example.com${path}`, {
		method: body === undefined ? 'GET' : 'POST',
		headers: {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

function slackStart(channelId: string, channelName: string) {
	const body = new FormData();
	body.set('command', '/start');
	body.set('user_id', USER);
	body.set('team_id', TEAM);
	body.set('channel_id', channelId);
	body.set('channel_name', channelName);
	body.set('text', '');
	return SELF.fetch('https://example.com/slack/commands', { method: 'POST', body });
}

async function getJson(res: Response) {
	return (await res.json()) as Record<string, any>;
}

describe('extension API', () => {
	let token: string;

	beforeEach(async () => {
		await env.STUDY_KV.delete(`${TEAM}:checkin:${USER}`);
		await env.STUDY_KV.delete(`${TEAM}:lastChannel:${USER}`);
		await env.STUDY_KV.delete(`${TEAM}:recentChannels:${USER}`);
		token = await issueApiToken(env, TEAM, USER);
	});

	it('토큰이 없거나 틀리면 401', async () => {
		expect((await callApi('/api/session', null)).status).toBe(401);
		expect((await callApi('/api/session', 'ff_wrong')).status).toBe(401);
	});

	it('발급 시 저장한 워크스페이스 / 사용자 이름을 돌려준다', async () => {
		const named = await issueApiToken(env, TEAM, USER, { teamName: '모각코 스터디', userName: '수연' });
		const json = await getJson(await callApi('/api/session', named));
		expect(json.workspace).toEqual({ id: TEAM, name: '모각코 스터디' });
		expect(json.user).toEqual({ id: USER, name: '수연' });
	});

	it('재발급하면 이전 토큰은 무효화된다', async () => {
		const next = await issueApiToken(env, TEAM, USER);
		expect((await callApi('/api/session', token)).status).toBe(401);
		expect((await callApi('/api/session', next)).status).toBe(200);
	});

	it('GET /api/session — 쉬는 중 상태 + 카테고리 목록', async () => {
		const json = await getJson(await callApi('/api/session', token));
		expect(json.ok).toBe(true);
		expect(json.session.state).toBe('idle');
		expect(json.workspace).toEqual({ id: TEAM, name: TEAM });
		expect(json.channels).toEqual([]);
		expect(json.defaultChannelId).toBeNull();
		expect(json.tags.length).toBeGreaterThan(0);
	});

	it('start → pause → resume 흐름이 KV checkin에 반영된다', async () => {
		const started = await getJson(await callApi('/api/session/start', token, { label: '알고리즘', tag: 'study' }));
		expect(started.session.state).toBe('focusing');

		const stored = JSON.parse((await env.STUDY_KV.get(`${TEAM}:checkin:${USER}`))!);
		expect(stored.label).toBe('알고리즘');
		expect(stored.tag).toBe('study');

		const again = await callApi('/api/session/start', token, {});
		expect(again.status).toBe(409);

		const paused = await getJson(await callApi('/api/session/pause', token, {}));
		expect(paused.session.state).toBe('paused');

		const resumed = await getJson(await callApi('/api/session/resume', token, {}));
		expect(resumed.session.state).toBe('focusing');
	});

	it('알 수 없는 카테고리는 무시한다', async () => {
		await callApi('/api/session/start', token, { tag: 'hacking' });
		const stored = JSON.parse((await env.STUDY_KV.get(`${TEAM}:checkin:${USER}`))!);
		expect(stored.tag).toBeUndefined();
	});

	it('마지막 /start 채널이 있으면 그 채널을 세션에 연결한다', async () => {
		await env.STUDY_KV.put(`${TEAM}:lastChannel:${USER}`, 'C_LAST');
		await callApi('/api/session/start', token, {});
		const stored = JSON.parse((await env.STUDY_KV.get(`${TEAM}:checkin:${USER}`))!);
		expect(stored.channelId).toBe('C_LAST');
	});

	it('/start 한 채널이 이름과 함께 최근 채널 목록에 쌓이고, 마지막 채널이 기본값이 된다', async () => {
		await slackStart('C_STUDY', 'study-room');
		await env.STUDY_KV.delete(`${TEAM}:checkin:${USER}`);
		await slackStart('C_SIDE', 'side-project');
		await env.STUDY_KV.delete(`${TEAM}:checkin:${USER}`);

		const json = await getJson(await callApi('/api/session', token));
		expect(json.channels).toEqual([
			{ id: 'C_SIDE', name: '#side-project' },
			{ id: 'C_STUDY', name: '#study-room' },
		]);
		expect(json.defaultChannelId).toBe('C_SIDE');
	});

	it('고른 채널로 시작하면 그 채널이 세션에 연결된다', async () => {
		await slackStart('C_STUDY', 'study-room');
		await slackStart('C_SIDE', 'side-project');
		await env.STUDY_KV.delete(`${TEAM}:checkin:${USER}`);

		await callApi('/api/session/start', token, { channelId: 'C_STUDY' });
		const stored = JSON.parse((await env.STUDY_KV.get(`${TEAM}:checkin:${USER}`))!);
		expect(stored.channelId).toBe('C_STUDY');
	});

	it('channelId: null 이면 채널 없이 기록만 한다', async () => {
		await slackStart('C_STUDY', 'study-room');
		await env.STUDY_KV.delete(`${TEAM}:checkin:${USER}`);

		await callApi('/api/session/start', token, { channelId: null });
		const stored = JSON.parse((await env.STUDY_KV.get(`${TEAM}:checkin:${USER}`))!);
		expect(stored.channelId).toBeUndefined();
	});

	it('/start 한 적 없는 채널은 고를 수 없다', async () => {
		const res = await callApi('/api/session/start', token, { channelId: 'C_RANDOM' });
		expect(res.status).toBe(400);
		expect(await env.STUDY_KV.get(`${TEAM}:checkin:${USER}`)).toBeNull();
	});

	it('임계값 초과 종료는 needsConfirm → confirm 시 기록', async () => {
		await env.STUDY_KV.put(`${TEAM}:checkin:${USER}`, JSON.stringify({ time: Date.now() - 7 * 60 * 60 * 1000 }));

		const first = await getJson(await callApi('/api/session/end', token, {}));
		expect(first.needsConfirm).toBe(true);
		expect(await env.STUDY_KV.get(`${TEAM}:checkin:${USER}`)).toBeTruthy();

		const confirmed = await getJson(await callApi('/api/session/end', token, { confirm: true }));
		expect(confirmed.ok).toBe(true);
		expect(confirmed.session.state).toBe('idle');
		expect(await env.STUDY_KV.get(`${TEAM}:checkin:${USER}`)).toBeNull();
	});

	it('직접 입력한 시간으로 종료 기록', async () => {
		await env.STUDY_KV.put(`${TEAM}:checkin:${USER}`, JSON.stringify({ time: Date.now() - 7 * 60 * 60 * 1000 }));

		const res = await getJson(await callApi('/api/session/end', token, { duration: 90 * 60 * 1000 }));
		expect(res.ok).toBe(true);
		expect(res.duration).toBe(90 * 60 * 1000);
	});

	it('진행 중인 세션 없이 pause/end 하면 409', async () => {
		expect((await callApi('/api/session/pause', token, {})).status).toBe(409);
		expect((await callApi('/api/session/end', token, {})).status).toBe(409);
	});

	it('익스텐션 오리진 preflight에 CORS 헤더를 준다', async () => {
		const res = await SELF.fetch('https://example.com/api/session', {
			method: 'OPTIONS',
			headers: { Origin: 'chrome-extension://abc', 'Access-Control-Request-Method': 'POST' },
		});
		expect(res.status).toBe(204);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('chrome-extension://abc');
	});
});
