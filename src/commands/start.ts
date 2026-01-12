/**
 * /start 커맨드 핸들러
 */

import { replyEphemeral, postMessage, getUserName } from '../utils/slack';
import { formatTime, formatDuration } from '../utils/format';
import { getTodayKey } from '../utils/date';

export async function handleStart(env: Env, teamId: string, userId: string, channelId: string): Promise<Response> {
	const now = Date.now();
	const existing = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);

	if (existing) {
		const startTime = parseInt(existing);
		const elapsed = formatDuration(now - startTime);
		// 이미 집중 중이면 본인에게만 알림
		return replyEphemeral(`이미 집중 중이에요! 요정이 지켜보고 있어요 :fairy-hourglass: (${elapsed} 경과)`);
	}

	await env.STUDY_KV.put(`${teamId}:checkin:${userId}`, now.toString());

	const todayKey = getTodayKey();
	const todayList: string[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:today:${todayKey}`)) || '[]');
	if (!todayList.includes(userId)) {
		todayList.push(userId);
		await env.STUDY_KV.put(`${teamId}:today:${todayKey}`, JSON.stringify(todayList));
	}

	// 사용자 이름 조회
	const userName = await getUserName(env, userId);

	// 채널에 공개 메시지 전송
	await postMessage(
		env,
		channelId,
		`:fairy-wand: *${userName}*님이 집중을 시작했어요! 화이팅! (${formatTime(now)})`
	);

	// 본인에게만 확인 메시지
	return replyEphemeral(':fairy-wand: 집중 시작! 요정이 응원할게요 ✨');
}
