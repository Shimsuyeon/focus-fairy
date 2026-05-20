import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { buildSessionPanelBlocks, PANEL_ACTION } from '../src/utils/sessionPanel';

function slackCommand(command: string, text = '', userId = 'U_ALIAS', teamId = 'T_ALIAS', channelId = 'C_ALIAS') {
	const body = new FormData();
	body.set('command', command);
	body.set('user_id', userId);
	body.set('team_id', teamId);
	body.set('channel_id', channelId);
	body.set('text', text);
	return SELF.fetch('https://example.com/slack/commands', { method: 'POST', body });
}

async function getJson(res: Response) {
	return (await res.json()) as { response_type: string; text: string; blocks?: unknown[] };
}

describe('/f* command aliases route to existing handlers', () => {
	beforeEach(async () => {
		await env.STUDY_KV.delete('T_ALIAS:checkin:U_ALIAS');
		const todayKey = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
		await env.STUDY_KV.delete(`T_ALIAS:today:${todayKey}`);
	});

	it('/fstart starts a session like /start (KV checkin created)', async () => {
		const res = await slackCommand('/fstart');
		const json = await getJson(res);

		expect(json.text).toContain('집중을 시작');

		const stored = await env.STUDY_KV.get('T_ALIAS:checkin:U_ALIAS');
		expect(stored).toBeTruthy();
	});

	it('/fpause pauses an active session like /pause (KV pausedAt set)', async () => {
		const startTime = Date.now() - 10 * 60 * 1000;
		await env.STUDY_KV.put('T_ALIAS:checkin:U_ALIAS', JSON.stringify({ time: startTime }));

		await slackCommand('/fpause');

		const stored = await env.STUDY_KV.get('T_ALIAS:checkin:U_ALIAS');
		const parsed = JSON.parse(stored!);
		expect(parsed.pausedAt).toBeGreaterThan(0);
	});

	it('/fresume clears pause state like /resume (pausedAt removed, pausePeriods recorded)', async () => {
		const startTime = Date.now() - 30 * 60 * 1000;
		const pausedAt = Date.now() - 5 * 60 * 1000;
		await env.STUDY_KV.put('T_ALIAS:checkin:U_ALIAS', JSON.stringify({ time: startTime, pausedAt }));

		await slackCommand('/fresume');

		const stored = await env.STUDY_KV.get('T_ALIAS:checkin:U_ALIAS');
		const parsed = JSON.parse(stored!);
		expect(parsed.pausedAt).toBeUndefined();
		expect(parsed.pausePeriods).toBeDefined();
		expect(parsed.pausePeriods.length).toBe(1);
	});

	it('/fend ends the session like /end (KV checkin cleared)', async () => {
		const startTime = Date.now() - 20 * 60 * 1000;
		await env.STUDY_KV.put('T_ALIAS:checkin:U_ALIAS', JSON.stringify({ time: startTime }));

		await slackCommand('/fend');

		const stored = await env.STUDY_KV.get('T_ALIAS:checkin:U_ALIAS');
		expect(stored).toBeNull();
	});

	it('/fpause on an idle user behaves like /pause (no checkin exists)', async () => {
		const res = await slackCommand('/fpause');
		const json = await getJson(res);

		expect(json.text).toContain('아직 시작 전');
	});
});

describe('buildSessionPanelBlocks', () => {
	const startTime = Date.now() - 25 * 60 * 1000;

	it('renders pause/end/stats buttons in the focusing state', () => {
		const blocks = buildSessionPanelBlocks({ state: 'focusing', startTime });
		const serialized = JSON.stringify(blocks);

		expect(serialized).toContain(PANEL_ACTION.pause);
		expect(serialized).toContain(PANEL_ACTION.end);
		expect(serialized).toContain(PANEL_ACTION.stats);
		expect(serialized).not.toContain(PANEL_ACTION.resume);
		expect(serialized).toContain('집중 중');
	});

	it('renders resume/end/stats buttons in the paused state', () => {
		const blocks = buildSessionPanelBlocks({
			state: 'paused',
			startTime,
			pausedAt: Date.now() - 2 * 60 * 1000,
		});
		const serialized = JSON.stringify(blocks);

		expect(serialized).toContain(PANEL_ACTION.resume);
		expect(serialized).toContain(PANEL_ACTION.end);
		expect(serialized).toContain(PANEL_ACTION.stats);
		expect(serialized).not.toContain(PANEL_ACTION.pause);
		expect(serialized).toContain('일시정지');
	});

	it('shows no buttons in the ended state', () => {
		const blocks = buildSessionPanelBlocks({ state: 'ended' });
		const serialized = JSON.stringify(blocks);

		expect(serialized).not.toContain(PANEL_ACTION.pause);
		expect(serialized).not.toContain(PANEL_ACTION.resume);
		expect(serialized).not.toContain(PANEL_ACTION.end);
		expect(serialized).not.toContain(PANEL_ACTION.stats);
		expect(serialized).toContain('세션이 종료');
	});
});
