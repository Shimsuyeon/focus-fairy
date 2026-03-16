/**
 * /start 커맨드 핸들러
 */

import { reply, replyEphemeral, postMessage, getUserName } from '../utils/slack';
import { formatTime, formatDuration } from '../utils/format';
import { getTodayKey } from '../utils/date';

export async function handleStart(env: Env, teamId: string, userId: string, channelId: string, text: string): Promise<Response> {
	const now = Date.now();
	const existing = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);

	if (existing) {
		let startTime: number;
		try {
			const parsed = JSON.parse(existing);
			startTime = typeof parsed === 'object' && parsed.time ? parsed.time : parseInt(existing);
		} catch {
			startTime = parseInt(existing);
		}
		const elapsed = formatDuration(now - startTime);
		return replyEphemeral(`이미 집중 중이에요! 요정이 지켜보고 있어요 :fairy-hourglass: (${elapsed} 경과)`);
	}

	const checkinData = text ? JSON.stringify({ time: now, label: text }) : now.toString();
	await env.STUDY_KV.put(`${teamId}:checkin:${userId}`, checkinData);

	const todayKey = getTodayKey();
	const todayList: string[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:today:${todayKey}`)) || '[]');
	if (!todayList.includes(userId)) {
		todayList.push(userId);
		await env.STUDY_KV.put(`${teamId}:today:${todayKey}`, JSON.stringify(todayList));
	}

	const userName = await getUserName(env, teamId, userId);

	let publicMessage = `:fairy-wand: <@${userId}>님이 집중을 시작했어요! 화이팅! (${formatTime(now)})`;
	if (text) {
		publicMessage += `\n:fairy-sprout: 계획: ${text}`;
	}

	const posted = await postMessage(env, teamId, channelId, publicMessage);

	if (posted) {
		return replyEphemeral(':fairy-wand: 집중 시작!');
	} else {
		return reply(publicMessage);
	}
}
