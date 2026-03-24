/**
 * /pause, /resume 커맨드 핸들러
 * 집중 세션 일시정지 / 재개
 */

import { reply, replyEphemeral, postMessage } from '../utils/slack';
import { formatTime, formatDuration } from '../utils/format';
import { getUserTimezoneInfo } from './settings';

export async function handlePause(
	env: Env,
	teamId: string,
	userId: string,
	channelId: string
): Promise<Response> {
	const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);

	if (!checkIn) {
		return replyEphemeral('아직 시작 전이에요! /start로 요정을 불러주세요 :fairy-wand:');
	}

	const now = Date.now();
	let data: Record<string, unknown>;

	try {
		const parsed = JSON.parse(checkIn);
		data = typeof parsed === 'object' && parsed.time ? parsed : { time: parseInt(checkIn) };
	} catch {
		data = { time: parseInt(checkIn) };
	}

	if (data.pausedAt) {
		const pauseElapsed = formatDuration(now - (data.pausedAt as number));
		return replyEphemeral(`:fairy-moon: 이미 일시정지 중이에요! (${pauseElapsed} 경과)\n/resume으로 다시 시작해주세요!`);
	}

	data.pausedAt = now;
	await env.STUDY_KV.put(`${teamId}:checkin:${userId}`, JSON.stringify(data));

	const tzInfo = await getUserTimezoneInfo(env, teamId, userId);
	const elapsed = formatDuration(now - (data.time as number) - ((data.totalPauseDuration as number) || 0));
	const publicMessage = `:fairy-moon: <@${userId}>님이 잠시 쉬어가요! (${formatTime(now, tzInfo.timezone, tzInfo.showLabel)}, 집중 ${elapsed})`;

	const posted = await postMessage(env, teamId, channelId, publicMessage);
	if (posted) {
		return replyEphemeral(':fairy-moon: 일시정지! 쉬고 올 때 /resume 해주세요');
	} else {
		return reply(publicMessage);
	}
}

export async function handleResume(
	env: Env,
	teamId: string,
	userId: string,
	channelId: string
): Promise<Response> {
	const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);

	if (!checkIn) {
		return replyEphemeral('아직 시작 전이에요! /start로 요정을 불러주세요 :fairy-wand:');
	}

	const now = Date.now();
	let data: Record<string, unknown>;

	try {
		const parsed = JSON.parse(checkIn);
		data = typeof parsed === 'object' && parsed.time ? parsed : { time: parseInt(checkIn) };
	} catch {
		data = { time: parseInt(checkIn) };
	}

	if (!data.pausedAt) {
		return replyEphemeral(':fairy-wand: 일시정지 상태가 아니에요! 집중 중입니다 :fairy-hourglass:');
	}

	const pauseStart = data.pausedAt as number;
	const pauseDuration = now - pauseStart;
	data.totalPauseDuration = ((data.totalPauseDuration as number) || 0) + pauseDuration;
	const periods = (data.pausePeriods as Array<{ start: number; end: number }>) || [];
	periods.push({ start: pauseStart, end: now });
	data.pausePeriods = periods;
	delete data.pausedAt;
	await env.STUDY_KV.put(`${teamId}:checkin:${userId}`, JSON.stringify(data));

	const tzInfo = await getUserTimezoneInfo(env, teamId, userId);
	const publicMessage = `:fairy-wand: <@${userId}>님이 다시 집중을 시작했어요! (${formatTime(now, tzInfo.timezone, tzInfo.showLabel)}, 휴식 ${formatDuration(pauseDuration)})`;

	const posted = await postMessage(env, teamId, channelId, publicMessage);
	if (posted) {
		return replyEphemeral(`:fairy-wand: 다시 집중! (휴식 ${formatDuration(pauseDuration)})`);
	} else {
		return reply(publicMessage);
	}
}
