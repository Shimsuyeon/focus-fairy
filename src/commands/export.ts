/**
 * /export 커맨드 핸들러
 * 개인 집중 기록 내보내기
 */

import type { Session } from '../types';
import { replyEphemeral } from '../utils/slack';
import { formatDuration, formatTime } from '../utils/format';
import { getDateRange } from '../utils/date';

/** /export 핸들러 */
export async function handleExport(env: Env, teamId: string, userId: string, text: string): Promise<Response> {
	// 인자 파싱
	const args = text.split(' ').filter((a) => a.trim());

	// 인자 없으면 이번 주 기본
	if (args.length === 0) {
		const { startDate, endDate, label } = getDateRange('thisweek');
		return generateExportText(env, teamId, userId, startDate, endDate, label);
	}

	// 단일 인자: 기간 키워드
	if (args.length === 1) {
		const period = args[0].toLowerCase();
		if (['thisweek', 'lastweek', 'thismonth', 'lastmonth'].includes(period)) {
			const { startDate, endDate, label } = getDateRange(period);
			return generateExportText(env, teamId, userId, startDate, endDate, label);
		}
		return replyEphemeral(getUsageMessage());
	}

	// 두 인자: 날짜 범위
	if (args.length === 2) {
		const startInput = args[0];
		const endInput = args[1];

		// YY-MM-DD 형식 체크
		if (!/^\d{2}-\d{2}-\d{2}$/.test(startInput) || !/^\d{2}-\d{2}-\d{2}$/.test(endInput)) {
			return replyEphemeral(getUsageMessage());
		}

		const startDate = '20' + startInput;
		const endDate = '20' + endInput;
		const label = `${startInput} ~ ${endInput}`;
		return generateExportText(env, teamId, userId, startDate, endDate, label);
	}

	return replyEphemeral(getUsageMessage());
}

/** 사용법 메시지 */
function getUsageMessage(): string {
	return (
		`:fairy-chart: */export 사용법*\n\n` +
		`• \`/export\` - 이번 주 (기본)\n` +
		`• \`/export thisweek\` - 이번 주\n` +
		`• \`/export lastweek\` - 지난 주\n` +
		`• \`/export thismonth\` - 이번 달\n` +
		`• \`/export 26-01-01 26-01-15\` - 특정 기간`
	);
}

/** 텍스트 형식으로 기록 출력 */
async function generateExportText(
	env: Env,
	teamId: string,
	userId: string,
	startDate: string,
	endDate: string,
	label: string
): Promise<Response> {
	// 해당 기간의 세션 수집
	const sessions: Array<Session & { date: string }> = [];

	let current = new Date(startDate + 'T00:00:00Z');
	const end = new Date(endDate + 'T00:00:00Z');

	while (current <= end) {
		const dateKey = current.toISOString().split('T')[0];
		const daySessions: Session[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:sessions:${dateKey}`)) || '[]');

		// 본인 세션만 필터링
		const mySessions = daySessions.filter((s) => s.userId === userId);
		for (const session of mySessions) {
			sessions.push({ ...session, date: dateKey });
		}

		current.setUTCDate(current.getUTCDate() + 1);
	}

	// 세션이 없으면
	if (sessions.length === 0) {
		return replyEphemeral(`:fairy-chart: *${label}* 기간에 기록이 없어요!\n\n요정이 기다리고 있을게요 :fairy-wand:`);
	}

	// 시간순 정렬
	sessions.sort((a, b) => a.start - b.start);

	// 날짜별로 그룹핑
	const byDate: Record<string, Array<Session & { date: string }>> = {};
	for (const session of sessions) {
		if (!byDate[session.date]) {
			byDate[session.date] = [];
		}
		byDate[session.date].push(session);
	}

	// 텍스트 생성
	const lines: string[] = [];
	const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

	for (const [date, daySessions] of Object.entries(byDate)) {
		const d = new Date(date + 'T00:00:00Z');
		const dayName = dayNames[d.getUTCDay()];
		const dateLabel = `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${dayName})`;

		for (const session of daySessions) {
			const startTime = formatTimeShort(session.start);
			const endTime = formatTimeShort(session.end);
			const duration = formatDuration(session.duration);
			lines.push(`${dateLabel} ${startTime}~${endTime} (${duration})`);
		}
	}

	// 총계
	const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);

	const message =
		`:fairy-chart: *${label} 집중 기록*\n\n` +
		`${lines.join('\n')}\n\n` +
		`총 ${sessions.length}개 세션 | :fairy-hourglass: 합계 ${formatDuration(totalDuration)}`;

	return replyEphemeral(message);
}

/** 시간만 짧게 포맷 (HH:MM) */
function formatTimeShort(ts: number): string {
	const d = new Date(ts + 9 * 60 * 60 * 1000); // KST
	const h = d.getUTCHours().toString().padStart(2, '0');
	const m = d.getUTCMinutes().toString().padStart(2, '0');
	return `${h}:${m}`;
}

