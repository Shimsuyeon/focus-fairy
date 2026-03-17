/**
 * /end 커맨드 핸들러
 */

import type { Session } from '../types';
import { reply, replyEphemeral, postMessage, getUserName } from '../utils/slack';
import { formatTime, formatDuration, parseDuration } from '../utils/format';
import { getDateKey, isCurrentWeek } from '../utils/date';
import { getWeekTotalForDate } from '../services/session';
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

	let startTime: number;
	let label: string | undefined;
	let checked: boolean[] | undefined;
	try {
		const parsed = JSON.parse(checkIn);
		if (typeof parsed === 'object' && parsed.time) {
			startTime = parsed.time;
			label = parsed.label;
			checked = parsed.checked;
		} else {
			startTime = parseInt(checkIn);
		}
	} catch {
		startTime = parseInt(checkIn);
	}

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

	// 개별 세션 저장 (시작 시간 기준으로 저장)
	const sessionDate = getDateKey(startTime);
	const sessionsKey = `${teamId}:sessions:${sessionDate}`;
	const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(sessionsKey)) || '[]');
	const session: Session = { userId, start: startTime, end: now, duration };
	if (label) session.label = label;
	if (checked) session.checked = checked;
	sessions.push(session);
	await env.STUDY_KV.put(sessionsKey, JSON.stringify(sessions));

	// 전체 누적도 유지
	const totalRecords: Record<string, number> = JSON.parse((await env.STUDY_KV.get(`${teamId}:total`)) || '{}');
	totalRecords[userId] = (totalRecords[userId] || 0) + duration;
	await env.STUDY_KV.put(`${teamId}:total`, JSON.stringify(totalRecords));

	await env.STUDY_KV.delete(`${teamId}:checkin:${userId}`);

	// 세션이 저장된 주의 누적 계산
	const weekTotal = await getWeekTotalForDate(env, teamId, userId, startTime);

	// 이번 주인지 지난 주인지 판단
	const weekLabel = isCurrentWeek(startTime) ? '이번 주' : '지난 주';

	// 사용자 이름 조회
	const userName = await getUserName(env, teamId, userId);

	const randomMsg = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];

	let publicMessage =
		`:fairy-party: <@${userId}>님 수고했어요! (${formatTime(now)})\n` +
		`:fairy-hourglass: 이번 세션: ${formatDuration(duration)}\n` +
		`:fairy-chart: ${weekLabel} 누적: ${formatDuration(weekTotal)}`;
	if (label && checked) {
		const items = label.split('\n').filter((l: string) => l.trim());
		const doneCount = checked.filter(Boolean).length;
		const checklistDisplay = items
			.map((item: string, i: number) => checked[i] ? `  :fairy-party: ~${item.trim()}~` : `  ${item.trim()}`)
			.join('\n');
		publicMessage += `\n:fairy-sprout: 계획 (${doneCount}/${items.length} 완료)\n${checklistDisplay}`;
	} else if (label) {
		publicMessage += `\n:fairy-sprout: 계획: ${label}`;
	}
	publicMessage += `\n\n${randomMsg}`;

	// 채널에 공개 메시지 전송 시도
	const posted = await postMessage(env, teamId, channelId, publicMessage);

	if (posted) {
		// postMessage 성공: 본인에게만 짧은 확인 메시지
		return replyEphemeral(`:fairy-party: ${formatDuration(duration)} 기록 완료!`);
	} else {
		// postMessage 실패: 기존 방식으로 fallback (in_channel)
		return reply(publicMessage);
	}
}
