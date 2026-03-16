import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Session } from '../src/types';

function slackCommand(command: string, text = '', userId = 'U_TEST', teamId = 'T_TEST', channelId = 'C_TEST') {
	const body = new FormData();
	body.set('command', command);
	body.set('user_id', userId);
	body.set('team_id', teamId);
	body.set('channel_id', channelId);
	body.set('text', text);
	return SELF.fetch('https://example.com/slack/commands', { method: 'POST', body });
}

async function getJson(res: Response) {
	return (await res.json()) as { response_type: string; text: string };
}

describe('/start 할 일 라벨링', () => {
	beforeEach(async () => {
		await env.STUDY_KV.delete('T_TEST:checkin:U_TEST');
		await env.STUDY_KV.delete('T_TEST:today:' + new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]);
	});

	it('텍스트 없이 /start → 기존 timestamp 형식으로 저장', async () => {
		const res = await slackCommand('/start');
		const json = await getJson(res);

		expect(json.text).toContain('집중을 시작했어요');
		expect(json.text).not.toContain('할 일');

		const stored = await env.STUDY_KV.get('T_TEST:checkin:U_TEST');
		expect(stored).toBeTruthy();
		expect(Number(stored)).toBeGreaterThan(0);
	});

	it('텍스트와 함께 /start → JSON 형식으로 저장 + 메시지에 할 일 표시', async () => {
		const res = await slackCommand('/start', '기획서 작성, 코드리뷰');
		const json = await getJson(res);

		expect(json.text).toContain('집중을 시작했어요');
		expect(json.text).toContain('할 일: 기획서 작성, 코드리뷰');

		const stored = await env.STUDY_KV.get('T_TEST:checkin:U_TEST');
		const parsed = JSON.parse(stored!);
		expect(parsed.time).toBeGreaterThan(0);
		expect(parsed.label).toBe('기획서 작성, 코드리뷰');
	});

	it('이미 집중 중일 때 /start → 경과 시간 정상 표시 (JSON 형식)', async () => {
		const pastTime = Date.now() - 30 * 60 * 1000; // 30분 전
		await env.STUDY_KV.put('T_TEST:checkin:U_TEST', JSON.stringify({ time: pastTime, label: '테스트' }));

		const res = await slackCommand('/start');
		const json = await getJson(res);

		expect(json.response_type).toBe('ephemeral');
		expect(json.text).toContain('이미 집중 중이에요');
		expect(json.text).toContain('경과');
	});

	it('이미 집중 중일 때 /start → 경과 시간 정상 표시 (기존 timestamp 형식)', async () => {
		const pastTime = Date.now() - 60 * 60 * 1000; // 1시간 전
		await env.STUDY_KV.put('T_TEST:checkin:U_TEST', pastTime.toString());

		const res = await slackCommand('/start');
		const json = await getJson(res);

		expect(json.response_type).toBe('ephemeral');
		expect(json.text).toContain('이미 집중 중이에요');
		expect(json.text).toContain('1시간');
	});
});

describe('/end 라벨 포함 종료', () => {
	it('라벨이 있는 세션 종료 → 메시지에 할 일 표시 + 세션에 라벨 저장', async () => {
		const startTime = Date.now() - 45 * 60 * 1000; // 45분 전
		await env.STUDY_KV.put('T_TEST:checkin:U_TEST', JSON.stringify({ time: startTime, label: '기획서 작성' }));

		const res = await slackCommand('/end');
		const json = await getJson(res);

		expect(json.text).toContain('수고했어요');
		expect(json.text).toContain('할 일: 기획서 작성');

		// 체크인 삭제 확인
		const checkIn = await env.STUDY_KV.get('T_TEST:checkin:U_TEST');
		expect(checkIn).toBeNull();

		// 세션에 라벨 저장 확인
		const dateKey = new Date(startTime + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
		const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(`T_TEST:sessions:${dateKey}`))!);
		expect(sessions).toHaveLength(1);
		expect(sessions[0].label).toBe('기획서 작성');
		expect(sessions[0].duration).toBeGreaterThan(0);
	});

	it('라벨 없는 기존 형식 세션 종료 → 하위호환 (label 없음)', async () => {
		const startTime = Date.now() - 30 * 60 * 1000;
		await env.STUDY_KV.put('T_TEST:checkin:U_TEST', startTime.toString());

		const res = await slackCommand('/end');
		const json = await getJson(res);

		expect(json.text).toContain('수고했어요');
		expect(json.text).not.toContain('할 일');

		const dateKey = new Date(startTime + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
		const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(`T_TEST:sessions:${dateKey}`))!);
		expect(sessions).toHaveLength(1);
		expect(sessions[0].label).toBeUndefined();
	});
});

describe('/start → /end 전체 플로우', () => {
	beforeEach(async () => {
		await env.STUDY_KV.delete('T_TEST:checkin:U_TEST');
	});

	it('할 일 입력 후 종료까지 라벨이 유지됨', async () => {
		// 1. 할 일과 함께 시작
		const startRes = await slackCommand('/start', 'PR 리뷰, 버그 수정');
		const startJson = await getJson(startRes);
		expect(startJson.text).toContain('할 일: PR 리뷰, 버그 수정');

		// 2. 종료
		const endRes = await slackCommand('/end');
		const endJson = await getJson(endRes);
		expect(endJson.text).toContain('할 일: PR 리뷰, 버그 수정');
	});

	it('할 일 없이 시작 → 종료 시에도 할 일 미표시', async () => {
		const startRes = await slackCommand('/start');
		const startJson = await getJson(startRes);
		expect(startJson.text).not.toContain('할 일');

		const endRes = await slackCommand('/end');
		const endJson = await getJson(endRes);
		expect(endJson.text).not.toContain('할 일');
	});
});
