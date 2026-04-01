/**
 * /mystats 커맨드 핸들러
 */

import { replyEphemeral } from '../utils/slack';
import { formatDuration } from '../utils/format';
import { getWeekTotal } from '../services/session';

export async function handleMyStats(env: Env, teamId: string, userId: string): Promise<Response> {
	const totalRecords: Record<string, number> = JSON.parse((await env.STUDY_KV.get(`${teamId}:total`)) || '{}');
	const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);

	const weekTotal = await getWeekTotal(env, teamId, userId);
	const totalTime = totalRecords[userId] || 0;

	let status = ':fairy-coffee: 현재 쉬는 중';
	if (checkIn) {
		const now = Date.now();
		let startTime: number;
		let totalPauseDuration = 0;
		let isPaused = false;

		try {
			const parsed = JSON.parse(checkIn);
			if (typeof parsed === 'object' && parsed.time) {
				startTime = parsed.time;
				totalPauseDuration = parsed.totalPauseDuration || 0;
				isPaused = !!parsed.pausedAt;
				if (isPaused) {
					totalPauseDuration += now - parsed.pausedAt;
				}
			} else {
				startTime = parseInt(checkIn);
			}
		} catch {
			startTime = parseInt(checkIn);
		}

		const elapsed = now - startTime - totalPauseDuration;
		if (isPaused) {
			status = `:fairy-moon: 일시정지 중 (집중 ${formatDuration(elapsed)})`;
		} else {
			status = `:fairy-fire: 집중 중 (${formatDuration(elapsed)} 경과)`;
		}
	}

	return replyEphemeral(
		`:fairy-chart: *나의 집중 통계*\n\n` +
			`${status}\n` +
			`:fairy-sun: 이번 주: ${formatDuration(weekTotal)}\n` +
			`:fairy-gold: 전체 누적: ${formatDuration(totalTime)}`
	);
}
