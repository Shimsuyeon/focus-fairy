/**
 * /start 커맨드 핸들러
 */

import { reply } from '../utils/slack';
import { formatTime, formatDuration } from '../utils/format';
import { getTodayKey } from '../utils/date';

export async function handleStart(env: Env, teamId: string, userId: string): Promise<Response> {
	const now = Date.now();
	const existing = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);

	if (existing) {
		const startTime = parseInt(existing);
		const elapsed = formatDuration(now - startTime);
		return reply(`<@${userId}> 이미 집중 중이에요! 요정이 지켜보고 있어요 :fairy-hourglass: (${elapsed} 경과)`);
	}

	await env.STUDY_KV.put(`${teamId}:checkin:${userId}`, now.toString());

	const todayKey = getTodayKey();
	const todayList: string[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:today:${todayKey}`)) || '[]');
	if (!todayList.includes(userId)) {
		todayList.push(userId);
		await env.STUDY_KV.put(`${teamId}:today:${todayKey}`, JSON.stringify(todayList));
	}

	return reply(`:fairy-wand: <@${userId}> 집중요정이 응원할게요! 화이팅! (${formatTime(now)})`);
}

