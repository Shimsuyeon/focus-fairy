import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { issueApiToken, createConnectCode } from '../src/api/auth';
import { handleSettings } from '../src/commands/settings';
import type { Session } from '../src/types';

const TEAM = 'T_APP';

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

async function connect(code: string) {
	return (await (await callApi('/api/connect', null, { code })).json()) as Record<string, any>;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('모바일 웹앱 연결', () => {
	it('웹앱 코드는 8자리 — 소문자·하이픈을 섞어 입력해도 연결되고, 한 번만 쓸 수 있다', async () => {
		const code = await createConnectCode(env, TEAM, 'U_CODE', { teamName: '모각코 스터디' }, 'app');
		expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/);

		const typed = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
		const connected = await connect(` ${typed} `);
		expect(connected.ok).toBe(true);
		expect(connected.workspace).toEqual({ id: TEAM, name: '모각코 스터디' });
		expect((await callApi('/api/session', connected.token)).status).toBe(200);

		expect((await callApi('/api/connect', null, { code })).status).toBe(400);
	});

	it('웹앱을 연결해도 익스텐션 토큰은 그대로, 웹앱을 다시 연결하면 이전 웹앱 토큰만 끊긴다', async () => {
		const user = 'U_BOTH';
		const extensionToken = await issueApiToken(env, TEAM, user);
		const firstApp = await connect(await createConnectCode(env, TEAM, user, {}, 'app'));
		const secondApp = await connect(await createConnectCode(env, TEAM, user, {}, 'app'));

		expect((await callApi('/api/session', extensionToken)).status).toBe(200);
		expect((await callApi('/api/session', firstApp.token)).status).toBe(401);
		expect((await callApi('/api/session', secondApp.token)).status).toBe(200);

		// 익스텐션을 다시 연결해도 웹앱은 그대로
		const extensionAgain = await connect(await createConnectCode(env, TEAM, user));
		expect((await callApi('/api/session', extensionToken)).status).toBe(401);
		expect((await callApi('/api/session', extensionAgain.token)).status).toBe(200);
		expect((await callApi('/api/session', secondApp.token)).status).toBe(200);
	});

	it('웹앱에서 시작·종료하면 source / endSource = app, 채널 없이 시작하면 recordOnly', async () => {
		const { token } = await connect(await createConnectCode(env, TEAM, 'U_SRC_APP', {}, 'app'));
		expect((await callApi('/api/session/start', token, { channelId: null })).status).toBe(200);
		expect((await callApi('/api/session/end', token, { duration: 60e3 })).status).toBe(200);

		const { keys } = await env.STUDY_KV.list({ prefix: `${TEAM}:sessions:` });
		const sessions = JSON.parse((await env.STUDY_KV.get(keys[0].name))!) as Session[];
		expect(sessions.find((s) => s.userId === 'U_SRC_APP')).toMatchObject({ source: 'app', endSource: 'app', recordOnly: true });
	});

	it('/settings app — 웹앱 링크와 같은 8자리 코드를 모달로 보여준다', async () => {
		await env.STUDY_KV.put(`tokens:${TEAM}`, 'xoxb-test');
		let view: any;
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const url = String(input);
			if (url.endsWith('/views.open')) view = JSON.parse(String(init?.body)).view;
			if (url.endsWith('/team.info')) return Response.json({ ok: true, team: { name: '모각코 스터디' } });
			if (url.endsWith('/users.info')) return Response.json({ ok: true, user: { real_name: '수연', profile: {} } });
			return Response.json({ ok: true });
		});

		const res = await handleSettings(env, TEAM, 'U_MODAL', 'trigger', 'app', 'https://fairy.example');
		expect(res.status).toBe(200);

		const blocks = JSON.stringify(view.blocks);
		const link = /https:\/\/fairy\.example\/app\/#code=([A-Z2-9]{8})/.exec(blocks);
		expect(link).not.toBeNull();
		const code = link![1];
		expect(blocks).toContain(`${code.slice(0, 4)}-${code.slice(4)}`);

		vi.restoreAllMocks();
		expect((await connect(code)).ok).toBe(true);
	});
});

describe('웹앱 정적 파일', () => {
	it('GET /app/ — 익스텐션 팝업을 웹앱용으로 바꾼 index.html', async () => {
		const res = await SELF.fetch('https://example.com/app/');
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('<link rel="manifest" href="manifest.webmanifest" />');
		expect(html).toContain('<script src="shim.js"></script>');
		expect(html).toContain('<script type="module" src="app.js"></script>');
		expect(html).not.toContain('src="panel.js"');
		expect(res.headers.get('Content-Security-Policy')).toContain("connect-src 'self'");
	});

	it('GET /app → /app/ 로 보낸다, manifest·공용 스크립트도 서빙', async () => {
		const redirect = await SELF.fetch('https://example.com/app', { redirect: 'manual' });
		expect(redirect.status).toBeGreaterThanOrEqual(301);
		expect(redirect.headers.get('Location')).toMatch(/\/app\/$/);

		const manifest = (await (await SELF.fetch('https://example.com/app/manifest.webmanifest')).json()) as Record<string, any>;
		expect(manifest).toMatchObject({ start_url: '/app/', display: 'standalone' });
		expect((await SELF.fetch('https://example.com/app/panel.js')).status).toBe(200);
	});

	it('다른 경로는 그대로 Worker가 처리한다', async () => {
		const res = await SELF.fetch('https://example.com/extension/connect');
		expect(await res.text()).toContain('ff-connect-status');
	});
});
