/**
 * /export 커맨드 핸들러
 * 개인 집중 기록 내보내기 (text, graph)
 */

import type { Session } from '../types';
import { replyEphemeral } from '../utils/slack';
import { formatDuration } from '../utils/format';
import { getDateRange } from '../utils/date';

/** 지원하는 형식 */
const FORMATS = ['text', 'graph', 'csv'] as const;
type ExportFormat = (typeof FORMATS)[number];

/** 지원하는 기간 키워드 */
const PERIODS = ['thisweek', 'lastweek', 'thismonth', 'lastmonth'] as const;

/** /export 핸들러 */
export async function handleExport(env: Env, teamId: string, userId: string, text: string): Promise<Response> {
	const args = text.split(' ').filter((a) => a.trim());

	// 기본값
	let format: ExportFormat = 'text';
	let periodArgs: string[] = [];

	// 첫 번째 인자가 형식인지 확인
	if (args.length > 0 && FORMATS.includes(args[0].toLowerCase() as ExportFormat)) {
		format = args[0].toLowerCase() as ExportFormat;
		periodArgs = args.slice(1);
	} else {
		periodArgs = args;
	}

	// CSV는 아직 미지원
	if (format === 'csv') {
		return replyEphemeral(':fairy-wand: CSV 형식은 곧 지원될 예정이에요!');
	}

	// 기간 파싱
	const { startDate, endDate, label } = parsePeriod(periodArgs);

	if (!startDate || !endDate) {
		return replyEphemeral(getUsageMessage());
	}

	// 세션 데이터 수집
	const sessions = await collectSessions(env, teamId, userId, startDate, endDate);

	// 세션이 없으면
	if (sessions.length === 0) {
		return replyEphemeral(`:fairy-chart: *${label}* 기간에 기록이 없어요!\n\n요정이 기다리고 있을게요 :fairy-wand:`);
	}

	// 형식에 따라 출력
	switch (format) {
		case 'text':
			return generateTextExport(sessions, label);
		case 'graph':
			return generateGraphExport(sessions, label, startDate, endDate);
		default:
			return replyEphemeral(getUsageMessage());
	}
}

/** 기간 인자 파싱 */
function parsePeriod(args: string[]): { startDate: string; endDate: string; label: string } {
	// 인자 없으면 이번 주
	if (args.length === 0) {
		return getDateRange('thisweek');
	}

	// 단일 인자: 기간 키워드
	if (args.length === 1) {
		const period = args[0].toLowerCase();
		if (PERIODS.includes(period as (typeof PERIODS)[number])) {
			return getDateRange(period);
		}
		return { startDate: '', endDate: '', label: '' };
	}

	// 두 인자: 날짜 범위 (YY-MM-DD YY-MM-DD)
	if (args.length === 2) {
		const [startInput, endInput] = args;
		if (/^\d{2}-\d{2}-\d{2}$/.test(startInput) && /^\d{2}-\d{2}-\d{2}$/.test(endInput)) {
			return {
				startDate: '20' + startInput,
				endDate: '20' + endInput,
				label: `${startInput} ~ ${endInput}`,
			};
		}
	}

	return { startDate: '', endDate: '', label: '' };
}

/** 세션 데이터 수집 */
async function collectSessions(
	env: Env,
	teamId: string,
	userId: string,
	startDate: string,
	endDate: string
): Promise<Array<Session & { date: string }>> {
	const sessions: Array<Session & { date: string }> = [];

	let current = new Date(startDate + 'T00:00:00Z');
	const end = new Date(endDate + 'T00:00:00Z');

	while (current <= end) {
		const dateKey = current.toISOString().split('T')[0];
		const daySessions: Session[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:sessions:${dateKey}`)) || '[]');

		const mySessions = daySessions.filter((s) => s.userId === userId);
		for (const session of mySessions) {
			sessions.push({ ...session, date: dateKey });
		}

		current.setUTCDate(current.getUTCDate() + 1);
	}

	// 시간순 정렬
	sessions.sort((a, b) => a.start - b.start);

	return sessions;
}

/** 사용법 메시지 */
function getUsageMessage(): string {
	return (
		`:fairy-chart: */export 사용법*\n\n` +
		`*형식*\n` +
		`• \`text\` - 텍스트 목록 (기본)\n` +
		`• \`graph\` - 그래프 이미지\n\n` +
		`*기간*\n` +
		`• \`thisweek\` - 이번 주 (기본)\n` +
		`• \`lastweek\` - 지난 주\n` +
		`• \`thismonth\` - 이번 달\n` +
		`• \`26-01-01 26-01-15\` - 특정 기간\n\n` +
		`*예시*\n` +
		`• \`/export\` - 이번 주 텍스트\n` +
		`• \`/export graph\` - 이번 주 그래프\n` +
		`• \`/export text lastweek\` - 지난 주 텍스트\n` +
		`• \`/export graph 26-01-01 26-01-15\` - 특정 기간 그래프`
	);
}

/** 텍스트 형식 출력 */
function generateTextExport(sessions: Array<Session & { date: string }>, label: string): Response {
	const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
	const byDate: Record<string, Array<Session & { date: string }>> = {};

	for (const session of sessions) {
		if (!byDate[session.date]) {
			byDate[session.date] = [];
		}
		byDate[session.date].push(session);
	}

	const lines: string[] = [];
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

	const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);

	const message =
		`:fairy-chart: *${label} 집중 기록*\n\n` +
		`${lines.join('\n')}\n\n` +
		`총 ${sessions.length}개 세션 | :fairy-hourglass: 합계 ${formatDuration(totalDuration)}`;

	return replyEphemeral(message);
}

/** 그래프 형식 출력 (QuickChart.io) */
function generateGraphExport(
	sessions: Array<Session & { date: string }>,
	label: string,
	startDate: string,
	endDate: string
): Response {
	const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

	// 날짜별 집계 (시간 단위)
	const dailyHours: Record<string, number> = {};

	// 기간 내 모든 날짜 초기화
	let current = new Date(startDate + 'T00:00:00Z');
	const end = new Date(endDate + 'T00:00:00Z');

	while (current <= end) {
		const dateKey = current.toISOString().split('T')[0];
		dailyHours[dateKey] = 0;
		current.setUTCDate(current.getUTCDate() + 1);
	}

	// 세션 집계
	for (const session of sessions) {
		const hours = session.duration / (1000 * 60 * 60);
		dailyHours[session.date] = (dailyHours[session.date] || 0) + hours;
	}

	// 차트 데이터 준비
	const sortedDates = Object.keys(dailyHours).sort();
	const labels = sortedDates.map((date) => {
		const d = new Date(date + 'T00:00:00Z');
		return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${dayNames[d.getUTCDay()]})`;
	});
	const data = sortedDates.map((date) => Math.round(dailyHours[date] * 10) / 10);

	// QuickChart URL 생성
	const chartConfig = {
		type: 'bar',
		data: {
			labels: labels,
			datasets: [
				{
					label: '집중 시간 (h)',
					data: data,
					backgroundColor: 'rgba(147, 112, 219, 0.7)',
					borderColor: 'rgba(147, 112, 219, 1)',
					borderWidth: 1,
				},
			],
		},
		options: {
			scales: {
				y: {
					beginAtZero: true,
					title: { display: true, text: '시간 (h)' },
				},
			},
			plugins: {
				title: {
					display: true,
					text: `${label} 집중 기록`,
				},
			},
		},
	};

	const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=600&h=300`;

	// 총계 계산
	const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
	const totalHours = Math.round((totalDuration / (1000 * 60 * 60)) * 10) / 10;

	// 슬랙 블록 형태로 응답
	const blocks = [
		{
			type: 'section',
			text: {
				type: 'mrkdwn',
				text: `:fairy-chart: *${label} 집중 기록*`,
			},
		},
		{
			type: 'image',
			image_url: chartUrl,
			alt_text: `${label} 집중 기록 그래프`,
		},
		{
			type: 'context',
			elements: [
				{
					type: 'mrkdwn',
					text: `총 ${sessions.length}개 세션 | :fairy-hourglass: 합계 ${totalHours}시간`,
				},
			],
		},
	];

	return new Response(
		JSON.stringify({
			response_type: 'ephemeral',
			blocks: blocks,
		}),
		{ headers: { 'Content-Type': 'application/json' } }
	);
}

/** 시간만 짧게 포맷 (HH:MM) */
function formatTimeShort(ts: number): string {
	const d = new Date(ts + 9 * 60 * 60 * 1000); // KST
	const h = d.getUTCHours().toString().padStart(2, '0');
	const m = d.getUTCMinutes().toString().padStart(2, '0');
	return `${h}:${m}`;
}
