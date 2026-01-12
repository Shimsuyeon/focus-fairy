/**
 * 세션 관련 비즈니스 로직
 */

import type { Session } from '../types';
import { formatDuration } from '../utils/format';
import { reply, getUserNames } from '../utils/slack';
import { getWeekRangeForDate } from '../utils/date';
import { MEDALS } from '../constants/messages';

/** 이번 주 누적 시간 계산 */
export async function getWeekTotal(env: Env, teamId: string, userId: string): Promise<number> {
	const today = new Date(Date.now() + 9 * 60 * 60 * 1000);
	const dayOfWeek = today.getUTCDay();
	const monday = new Date(today);
	monday.setUTCDate(today.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

	let total = 0;
	for (let i = 0; i < 7; i++) {
		const d = new Date(monday);
		d.setUTCDate(monday.getUTCDate() + i);
		const dateKey = d.toISOString().split('T')[0];
		const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:sessions:${dateKey}`)) || '[]');
		total += sessions.filter((s) => s.userId === userId).reduce((sum, s) => sum + s.duration, 0);
	}
	return total;
}

/** 특정 타임스탬프가 속한 주의 누적 시간 계산 */
export async function getWeekTotalForDate(env: Env, teamId: string, userId: string, ts: number): Promise<number> {
	const { startDate, endDate } = getWeekRangeForDate(ts);

	let total = 0;
	let current = new Date(startDate + 'T00:00:00Z');
	const end = new Date(endDate + 'T00:00:00Z');

	while (current <= end) {
		const dateKey = current.toISOString().split('T')[0];
		const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:sessions:${dateKey}`)) || '[]');
		total += sessions.filter((s) => s.userId === userId).reduce((sum, s) => sum + s.duration, 0);
		current.setUTCDate(current.getUTCDate() + 1);
	}
	return total;
}

/** 기간별 리포트 생성 */
export async function generateReport(
	env: Env,
	teamId: string,
	startDate: string,
	endDate: string,
	label: string
): Promise<Response> {
	const stats: Record<string, number> = {};

	let current = new Date(startDate + 'T00:00:00Z');
	const end = new Date(endDate + 'T00:00:00Z');

	while (current <= end) {
		const dateKey = current.toISOString().split('T')[0];
		const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:sessions:${dateKey}`)) || '[]');

		for (const session of sessions) {
			stats[session.userId] = (stats[session.userId] || 0) + session.duration;
		}

		current.setUTCDate(current.getUTCDate() + 1);
	}

	const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]);

	if (entries.length === 0) {
		return reply(':fairy-chart: 해당 기간에는 아직 기록이 없어요! 요정이 기다리고 있을게요 :fairy-wand:');
	}

	// 사용자 이름들 한번에 조회
	const userIds = entries.map(([uid]) => uid);
	const userNames = await getUserNames(env, teamId, userIds);

	const lines = entries.map(([uid, ms], i) => {
		const medal = MEDALS[i] || `${i + 1}.`;
		const name = userNames.get(uid) || uid;
		return `${medal} ${name} - ${formatDuration(ms)}`;
	});

	const total = entries.reduce((sum, [, ms]) => sum + ms, 0);

	return reply(
		`:fairy-chart: *${label} 집중 시간 리포트*\n\n` +
			`${lines.join('\n')}\n\n` +
			`총 ${entries.length}명 | :fairy-hourglass: 합계 ${formatDuration(total)}`
	);
}
