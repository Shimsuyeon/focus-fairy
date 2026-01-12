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
		const elapsed = Date.now() - parseInt(checkIn);
		status = `:fairy-fire: 집중 중 (${formatDuration(elapsed)} 경과)`;
	}

	return replyEphemeral(
		`:fairy-chart: *나의 집중 통계*\n\n` +
			`${status}\n` +
			`:fairy-sun: 이번 주: ${formatDuration(weekTotal)}\n` +
			`:fairy-gold: 전체 누적: ${formatDuration(totalTime)}`
	);
}
