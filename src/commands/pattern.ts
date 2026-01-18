/**
 * /pattern 커맨드 핸들러
 * 개인 집중 패턴 분석
 */

import type { Session } from '../types';
import { replyEphemeral } from '../utils/slack';
import { formatDuration } from '../utils/format';

/** 시간대 구분 */
const TIME_SLOTS = {
	morning: { label: '오전', range: '06:00~12:00', start: 6, end: 12 },
	afternoon: { label: '오후', range: '12:00~18:00', start: 12, end: 18 },
	evening: { label: '저녁', range: '18:00~22:00', start: 18, end: 22 },
	night: { label: '밤', range: '22:00~06:00', start: 22, end: 6 },
} as const;

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/** /pattern 핸들러 */
export async function handlePattern(env: Env, teamId: string, userId: string, text: string): Promise<Response> {
	const args = text.split(' ').filter((a) => a.trim());
	const subCommand = args[0]?.toLowerCase() || '';

	// 최근 30일 세션 수집
	const sessions = await collectRecentSessions(env, teamId, userId, 30);

	if (sessions.length === 0) {
		return replyEphemeral(':fairy-chart: 아직 분석할 데이터가 없어요!\n\n`/start`로 집중을 시작해보세요 :fairy-wand:');
	}

	switch (subCommand) {
		case 'time':
			return analyzeTimeSlots(sessions);
		case 'day':
			return analyzeDays(sessions);
		default:
			return analyzeOverall(sessions);
	}
}

/** 최근 N일 세션 수집 */
async function collectRecentSessions(env: Env, teamId: string, userId: string, days: number): Promise<Session[]> {
	const sessions: Session[] = [];
	const now = new Date();

	for (let i = 0; i < days; i++) {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		const dateKey = d.toISOString().split('T')[0];

		const daySessions: Session[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:sessions:${dateKey}`)) || '[]');
		sessions.push(...daySessions.filter((s) => s.userId === userId));
	}

	return sessions;
}

/** 전체 패턴 분석 */
function analyzeOverall(sessions: Session[]): Response {
	// 시간대별 집계
	const timeSlotStats = getTimeSlotStats(sessions);
	const topTimeSlot = Object.entries(timeSlotStats).sort((a, b) => b[1] - a[1])[0];

	// 요일별 집계
	const dayStats = getDayStats(sessions);
	const topDay = Object.entries(dayStats).sort((a, b) => b[1] - a[1])[0];

	// 평균 세션 길이
	const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
	const avgSessionLength = totalDuration / sessions.length;

	// 최장 세션
	const longestSession = Math.max(...sessions.map((s) => s.duration));

	// 주간 평균 (최근 4주 기준)
	const weeklyAvg = totalDuration / 4;

	const timeSlotInfo = TIME_SLOTS[topTimeSlot[0] as keyof typeof TIME_SLOTS];
	const timeSlotPercent = Math.round((topTimeSlot[1] / totalDuration) * 100);

	const message =
		`:fairy-chart: *나의 집중 패턴* (최근 30일)\n\n` +
		`:fairy-sun: 가장 집중 잘 되는 시간: *${timeSlotInfo.label}* (${timeSlotInfo.range}) - ${timeSlotPercent}%\n` +
		`:fairy-confetti: 가장 많이 집중한 요일: *${DAY_NAMES[parseInt(topDay[0])]}요일* - ${formatDuration(topDay[1])}\n` +
		`:fairy-hourglass: 평균 세션 길이: *${formatDuration(avgSessionLength)}*\n` +
		`:fairy-fire: 최장 세션: *${formatDuration(longestSession)}*\n` +
		`:fairy-sprout: 주간 평균: *${formatDuration(weeklyAvg)}*\n\n` +
		`_더 자세히 보려면:_\n` +
		`• \`/pattern time\` - 시간대별 분석\n` +
		`• \`/pattern day\` - 요일별 분석`;

	return replyEphemeral(message);
}

/** 시간대별 분석 (가로 막대 그래프) */
function analyzeTimeSlots(sessions: Session[]): Response {
	const stats = getTimeSlotStats(sessions);
	const total = Object.values(stats).reduce((sum, v) => sum + v, 0);

	// 차트 데이터 준비
	const labels = Object.values(TIME_SLOTS).map((slot) => `${slot.label} (${slot.range})`);
	const data = Object.keys(TIME_SLOTS).map((key) => {
		const hours = (stats[key] || 0) / (1000 * 60 * 60);
		return Math.round(hours * 10) / 10;
	});

	// QuickChart 가로 막대 그래프
	const chartConfig = {
		type: 'horizontalBar',
		data: {
			labels: labels,
			datasets: [
				{
					label: '집중 시간 (h)',
					data: data,
					backgroundColor: ['rgba(255, 206, 86, 0.7)', 'rgba(255, 159, 64, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(75, 192, 192, 0.7)'],
					borderWidth: 1,
				},
			],
		},
		options: {
			scales: {
				xAxes: [{ ticks: { beginAtZero: true } }],
			},
			plugins: {
				title: { display: true, text: '시간대별 집중 패턴 (최근 30일)' },
			},
		},
	};

	const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=500&h=250`;

	// 텍스트 요약
	const summaryLines = Object.entries(TIME_SLOTS).map(([key, slot]) => {
		const duration = stats[key] || 0;
		const percent = total > 0 ? Math.round((duration / total) * 100) : 0;
		return `${slot.label}: ${percent}% (${formatDuration(duration)})`;
	});

	const blocks = [
		{
			type: 'section',
			text: { type: 'mrkdwn', text: `:fairy-chart: *시간대별 집중 패턴* (최근 30일)` },
		},
		{
			type: 'image',
			image_url: chartUrl,
			alt_text: '시간대별 집중 패턴 그래프',
		},
		{
			type: 'context',
			elements: [{ type: 'mrkdwn', text: summaryLines.join(' | ') }],
		},
	];

	return new Response(JSON.stringify({ response_type: 'ephemeral', blocks }), {
		headers: { 'Content-Type': 'application/json' },
	});
}

/** 요일별 분석 (가로 막대 그래프) */
function analyzeDays(sessions: Session[]): Response {
	const stats = getDayStats(sessions);
	const total = Object.values(stats).reduce((sum, v) => sum + v, 0);

	// 차트 데이터 준비
	const labels = DAY_NAMES.map((d) => `${d}요일`);
	const data = DAY_NAMES.map((_, idx) => {
		const hours = (stats[idx] || 0) / (1000 * 60 * 60);
		return Math.round(hours * 10) / 10;
	});

	// 요일별 색상 (주말은 다른 색)
	const colors = DAY_NAMES.map((_, idx) =>
		idx === 0 || idx === 6 ? 'rgba(255, 99, 132, 0.7)' : 'rgba(147, 112, 219, 0.7)'
	);

	// QuickChart 가로 막대 그래프
	const chartConfig = {
		type: 'horizontalBar',
		data: {
			labels: labels,
			datasets: [
				{
					label: '집중 시간 (h)',
					data: data,
					backgroundColor: colors,
					borderWidth: 1,
				},
			],
		},
		options: {
			scales: {
				xAxes: [{ ticks: { beginAtZero: true } }],
			},
			plugins: {
				title: { display: true, text: '요일별 집중 패턴 (최근 30일)' },
			},
		},
	};

	const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=500&h=300`;

	// 텍스트 요약
	const summaryLines = DAY_NAMES.map((dayName, idx) => {
		const duration = stats[idx] || 0;
		const percent = total > 0 ? Math.round((duration / total) * 100) : 0;
		return `${dayName}: ${percent}%`;
	});

	const blocks = [
		{
			type: 'section',
			text: { type: 'mrkdwn', text: `:fairy-chart: *요일별 집중 패턴* (최근 30일)` },
		},
		{
			type: 'image',
			image_url: chartUrl,
			alt_text: '요일별 집중 패턴 그래프',
		},
		{
			type: 'context',
			elements: [{ type: 'mrkdwn', text: summaryLines.join(' | ') }],
		},
	];

	return new Response(JSON.stringify({ response_type: 'ephemeral', blocks }), {
		headers: { 'Content-Type': 'application/json' },
	});
}

/** 시간대별 통계 계산 */
function getTimeSlotStats(sessions: Session[]): Record<string, number> {
	const stats: Record<string, number> = {
		morning: 0,
		afternoon: 0,
		evening: 0,
		night: 0,
	};

	for (const session of sessions) {
		const hour = new Date(session.start + 9 * 60 * 60 * 1000).getUTCHours(); // KST

		if (hour >= 6 && hour < 12) {
			stats.morning += session.duration;
		} else if (hour >= 12 && hour < 18) {
			stats.afternoon += session.duration;
		} else if (hour >= 18 && hour < 22) {
			stats.evening += session.duration;
		} else {
			stats.night += session.duration;
		}
	}

	return stats;
}

/** 요일별 통계 계산 */
function getDayStats(sessions: Session[]): Record<number, number> {
	const stats: Record<number, number> = {};

	for (const session of sessions) {
		const day = new Date(session.start + 9 * 60 * 60 * 1000).getUTCDay(); // KST
		stats[day] = (stats[day] || 0) + session.duration;
	}

	return stats;
}

