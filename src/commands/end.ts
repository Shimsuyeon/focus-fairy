/**
 * /end 커맨드 핸들러
 */

import type { Session } from '../types';
import { replyEphemeral, postMessage, getUserName } from '../utils/slack';
import { formatTime, formatDuration, parseDuration } from '../utils/format';
import { getDateKey } from '../utils/date';
import { getWeekTotal } from '../services/session';
import { ENCOURAGEMENTS, MAX_AUTO_DURATION } from '../constants/messages';

export async function handleEnd(
	env: Env,
	teamId: string,
	userId: string,
	channelId: string,
	text: string
): Promise<Response> {
	const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);

	if (!checkIn) {
		return replyEphemeral('아직 시작 전이에요! /start로 요정을 불러주세요 :fairy-wand:');
	}

	const now = Date.now();
	const startTime = parseInt(checkIn);
	let duration = now - startTime;

	// 6시간 초과 + 시간 입력 없으면 경고 (본인에게만)
	if (duration > MAX_AUTO_DURATION && !text) {
		return replyEphemeral(
			`:fairy-zzz: ${formatDuration(duration)} 기록 예정!\n` +
				`실제 집중 시간과 다르다면 요정이 고쳐드릴게요\n\n` +
				`👉 이렇게 입력해보세요: /end 2시간 30분`
		);
	}

	// 시간 직접 입력한 경우
	if (text) {
		const parsed = parseDuration(text);
		if (parsed === null) {
			return replyEphemeral('시간 형식을 확인해주세요! 예: /end 2시간 30분');
		}
		duration = parsed;
	}

	// 개별 세션 저장 (날짜별로 조회 가능하도록)
	const sessionDate = getDateKey(startTime);
	const sessionsKey = `${teamId}:sessions:${sessionDate}`;
	const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(sessionsKey)) || '[]');
	sessions.push({
		userId,
		start: startTime,
		end: now,
		duration,
	});
	await env.STUDY_KV.put(sessionsKey, JSON.stringify(sessions));

	// 전체 누적도 유지
	const totalRecords: Record<string, number> = JSON.parse((await env.STUDY_KV.get(`${teamId}:total`)) || '{}');
	totalRecords[userId] = (totalRecords[userId] || 0) + duration;
	await env.STUDY_KV.put(`${teamId}:total`, JSON.stringify(totalRecords));

	await env.STUDY_KV.delete(`${teamId}:checkin:${userId}`);

	// 이번 주 누적 계산
	const weekTotal = await getWeekTotal(env, teamId, userId);

	// 사용자 이름 조회
	const userName = await getUserName(env, userId);

	const randomMsg = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];

	// 채널에 공개 메시지 전송
	await postMessage(
		env,
		channelId,
		`:fairy-party: *${userName}*님 수고했어요! (${formatTime(now)})\n` +
			`:fairy-hourglass: 이번 세션: ${formatDuration(duration)}\n` +
			`:fairy-chart: 이번 주 누적: ${formatDuration(weekTotal)}\n\n` +
			`${randomMsg}`
	);

	// 본인에게만 확인 메시지
	return replyEphemeral(`:fairy-party: 집중 종료! ${formatDuration(duration)} 기록됐어요 ✨`);
}
