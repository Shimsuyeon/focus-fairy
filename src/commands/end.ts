/**
 * /end 커맨드 핸들러
 */

import type { Session } from '../types';
import { reply, replyEphemeral, postMessage, updateMessage, getUserName } from '../utils/slack';
import { formatTime, formatDuration, parseDuration } from '../utils/format';
import { getDateKey, isCurrentWeek } from '../utils/date';
import { getWeekTotalForDate } from '../services/session';
import { ENCOURAGEMENTS, SESSION_TAGS } from '../constants/messages';
import { buildFinalChecklistBlocks } from '../interactions';
import { getWorkspaceSettings, getUserTimezoneInfo } from './settings';

interface CheckinData {
	startTime: number;
	label?: string;
	checked?: boolean[];
	tag?: string;
	messageTs?: string;
	msgChannelId?: string;
	totalPauseDuration: number;
}

function parseCheckinData(checkIn: string, now: number): CheckinData {
	let startTime: number;
	let label: string | undefined;
	let checked: boolean[] | undefined;
	let tag: string | undefined;
	let messageTs: string | undefined;
	let msgChannelId: string | undefined;
	let totalPauseDuration = 0;

	try {
		const parsed = JSON.parse(checkIn);
		if (typeof parsed === 'object' && parsed.time) {
			startTime = parsed.time;
			label = parsed.label;
			checked = parsed.checked;
			tag = parsed.tag;
			messageTs = parsed.messageTs;
			msgChannelId = parsed.channelId;
			totalPauseDuration = parsed.totalPauseDuration || 0;
			if (parsed.pausedAt) {
				totalPauseDuration += now - parsed.pausedAt;
			}
		} else {
			startTime = parseInt(checkIn);
		}
	} catch {
		startTime = parseInt(checkIn);
	}

	return { startTime, label, checked, tag, messageTs, msgChannelId, totalPauseDuration };
}

/** 세션 종료 핵심 로직 — /end 커맨드와 "그대로 기록하기" 버튼 공용 */
export async function completeEndSession(
	env: Env,
	teamId: string,
	userId: string,
	channelId: string,
	duration: number,
	checkin: CheckinData,
	tzInfo?: { timezone: string; showLabel: boolean }
): Promise<string> {
	const now = Date.now();
	const { startTime, label, checked, tag, messageTs, msgChannelId, totalPauseDuration } = checkin;
	const tz = tzInfo?.timezone;
	const showLabel = tzInfo?.showLabel;

	const sessionDate = getDateKey(startTime);
	const sessionsKey = `${teamId}:sessions:${sessionDate}`;
	const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(sessionsKey)) || '[]');
	const session: Session = { userId, start: startTime, end: now, duration };
	if (label) session.label = label;
	if (checked) session.checked = checked;
	if (tag) session.tag = tag;
	if (totalPauseDuration > 0) session.pauseDuration = totalPauseDuration;
	sessions.push(session);
	await env.STUDY_KV.put(sessionsKey, JSON.stringify(sessions));

	const totalRecords: Record<string, number> = JSON.parse((await env.STUDY_KV.get(`${teamId}:total`)) || '{}');
	totalRecords[userId] = (totalRecords[userId] || 0) + duration;
	await env.STUDY_KV.put(`${teamId}:total`, JSON.stringify(totalRecords));

	await env.STUDY_KV.delete(`${teamId}:checkin:${userId}`);

	if (messageTs && msgChannelId && label && checked) {
		const tagLabel = tag ? (SESSION_TAGS.find(t => t.value === tag)?.label || '기타') : undefined;
		const items = label.split('\n').filter((l: string) => l.trim()).map((l: string) => l.trim());
		const finalBlocks = buildFinalChecklistBlocks(userId, startTime, items, checked, tagLabel, { timezone: tz || 'Asia/Seoul', showLabel: showLabel || false });
		await updateMessage(env, teamId, msgChannelId, messageTs, '', finalBlocks);
	}

	const weekTotal = await getWeekTotalForDate(env, teamId, userId, startTime);
	const weekLabel = isCurrentWeek(startTime) ? '이번 주' : '지난 주';
	const randomMsg = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];

	const tagLabel = tag ? (SESSION_TAGS.find(t => t.value === tag)?.label || '기타') : undefined;
	let publicMessage =
		`:fairy-party: <@${userId}>님 수고했어요! (${formatTime(now, tz, showLabel)})\n` +
		`:fairy-hourglass: 이번 세션: ${formatDuration(duration)}` +
		(totalPauseDuration > 0 ? ` (휴식 ${formatDuration(totalPauseDuration)} 제외)` : '') +
		`\n:fairy-chart: ${weekLabel} 누적: ${formatDuration(weekTotal)}`;
	if (tagLabel) {
		publicMessage += `\n:fairy-fire: 카테고리: ${tagLabel}`;
	}
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

	await postMessage(env, teamId, channelId, publicMessage);
	return formatDuration(duration);
}

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
	const checkin = parseCheckinData(checkIn, now);
	let duration = now - checkin.startTime - checkin.totalPauseDuration;

	const settings = await getWorkspaceSettings(env, teamId);
	const tzInfo = await getUserTimezoneInfo(env, teamId, userId);

	// 임계값 초과 + 시간 입력 없으면 경고 + 확인 버튼 (본인에게만)
	if (duration > settings.maxAutoDuration && !text) {
		let warningMsg = `:fairy-zzz: ${formatDuration(duration)} 기록 예정!`;
		if (checkin.totalPauseDuration > 0) {
			warningMsg += ` (중간 휴식 ${formatDuration(checkin.totalPauseDuration)}을 제외했어요!)`;
		}
		warningMsg += `\n실제 집중 시간과 다르다면 요정이 고쳐드릴게요`;

		const buttonValue = JSON.stringify({ channelId, duration });

		return new Response(JSON.stringify({
			response_type: 'ephemeral',
			text: warningMsg,
			blocks: [
				{
					type: 'section',
					text: { type: 'mrkdwn', text: warningMsg },
				},
				{
					type: 'actions',
					elements: [
						{
							type: 'button',
							text: { type: 'plain_text', text: `✅ ${formatDuration(duration)} 그대로 기록하기` },
							action_id: 'confirm_end_duration',
							value: buttonValue,
							style: 'primary',
						},
					],
				},
				{
					type: 'context',
					elements: [{ type: 'mrkdwn', text: '👉 다르다면: `/end 2시간 30분`' }],
				},
			],
		}), { headers: { 'Content-Type': 'application/json' } });
	}

	// 시간 직접 입력한 경우
	if (text) {
		const parsed = parseDuration(text);
		if (parsed === null) {
			return replyEphemeral('시간 형식을 확인해주세요! 예: /end 2시간 30분');
		}
		duration = parsed;
	}

	const durationLabel = await completeEndSession(env, teamId, userId, channelId, duration, checkin, tzInfo);
	return replyEphemeral(`:fairy-party: ${durationLabel} 기록 완료!`);
}
