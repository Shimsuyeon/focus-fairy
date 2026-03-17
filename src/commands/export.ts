/**
 * /export 커맨드 핸들러
 * 개인 집중 기록 내보내기 (text, graph, csv)
 */

import type { Session } from '../types';
import { replyEphemeral, uploadFile } from '../utils/slack';
import { formatDuration } from '../utils/format';
import { getDateRange } from '../utils/date';
import { SESSION_TAGS } from '../constants/messages';

/** 지원하는 형식 */
const FORMATS = ['text', 'graph', 'csv'] as const;
type ExportFormat = (typeof FORMATS)[number];

/** 지원하는 기간 키워드 */
const PERIODS = ['thisweek', 'lastweek', 'thismonth', 'lastmonth'] as const;

/** /export 핸들러 */
export async function handleExport(env: Env, teamId: string, userId: string, channelId: string, text: string): Promise<Response> {
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
		case 'csv':
			return generateCsvExport(env, teamId, userId, sessions, label);
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
		`• \`graph\` - 그래프 이미지\n` +
		`• \`csv\` - CSV 형식\n\n` +
		`*기간*\n` +
		`• \`thisweek\` - 이번 주 (기본)\n` +
		`• \`lastweek\` - 지난 주\n` +
		`• \`thismonth\` - 이번 달\n` +
		`• \`26-01-01 26-01-15\` - 특정 기간\n\n` +
		`*예시*\n` +
		`• \`/export\` - 이번 주 텍스트\n` +
		`• \`/export graph\` - 이번 주 그래프\n` +
		`• \`/export csv lastweek\` - 지난 주 CSV\n` +
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
			let line = `${dateLabel} ${startTime}~${endTime} (${duration})`;
			if (session.label) line += ` — ${session.label}`;
			lines.push(line);
		}
	}

	const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);

	const message =
		`:fairy-chart: *${label} 집중 기록*\n\n` +
		`${lines.join('\n')}\n\n` +
		`총 ${sessions.length}개 세션 | :fairy-hourglass: 합계 ${formatDuration(totalDuration)}`;

	return replyEphemeral(message);
}

const TAG_COLORS: Record<string, { bg: string; border: string }> = {
	exercise: { bg: 'rgba(129, 201, 149, 0.7)', border: 'rgba(129, 201, 149, 1)' },
	reading: { bg: 'rgba(122, 175, 255, 0.7)', border: 'rgba(122, 175, 255, 1)' },
	side: { bg: 'rgba(197, 138, 249, 0.7)', border: 'rgba(197, 138, 249, 1)' },
	study: { bg: 'rgba(255, 214, 102, 0.7)', border: 'rgba(255, 214, 102, 1)' },
	etc: { bg: 'rgba(176, 190, 197, 0.7)', border: 'rgba(176, 190, 197, 1)' },
};

/** 그래프 형식 출력 (QuickChart.io, 카테고리별 색상) */
function generateGraphExport(sessions: Array<Session & { date: string }>, label: string, startDate: string, endDate: string): Response {
	const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

	// 기간 내 모든 날짜 초기화
	const sortedDates: string[] = [];
	let current = new Date(startDate + 'T00:00:00Z');
	const end = new Date(endDate + 'T00:00:00Z');
	while (current <= end) {
		sortedDates.push(current.toISOString().split('T')[0]);
		current.setUTCDate(current.getUTCDate() + 1);
	}

	// 날짜별 + 카테고리별 집계
	const dailyByTag: Record<string, Record<string, number>> = {};
	for (const date of sortedDates) {
		dailyByTag[date] = {};
	}

	const usedTags = new Set<string>();
	for (const session of sessions) {
		const tag = session.tag || 'etc';
		const hours = session.duration / (1000 * 60 * 60);
		dailyByTag[session.date][tag] = (dailyByTag[session.date][tag] || 0) + hours;
		usedTags.add(tag);
	}

	// 사용된 태그만 데이터셋 생성 (SESSION_TAGS 순서 유지)
	const tagOrder = SESSION_TAGS.map(t => t.value).filter(v => usedTags.has(v));

	const labels = sortedDates.map((date) => {
		const d = new Date(date + 'T00:00:00Z');
		return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${dayNames[d.getUTCDay()]})`;
	});

	const hasMultipleTags = tagOrder.length > 1;

	const datasets = tagOrder.map((tagValue) => {
		const tagInfo = SESSION_TAGS.find(t => t.value === tagValue);
		const colors = TAG_COLORS[tagValue] || TAG_COLORS.etc;
		return {
			label: tagInfo?.label || '기타',
			data: sortedDates.map((date) => Math.round((dailyByTag[date][tagValue] || 0) * 10) / 10),
			backgroundColor: colors.bg,
			borderColor: colors.border,
			borderWidth: 1,
		};
	});

	const chartConfig = {
		type: 'bar',
		data: { labels, datasets },
		options: {
			scales: {
				xAxes: [{ stacked: hasMultipleTags }],
				yAxes: [{
					stacked: hasMultipleTags,
					ticks: { beginAtZero: true },
					scaleLabel: { display: true, labelString: '시간 (h)' },
				}],
			},
			title: { display: true, text: `${label} 집중 기록` },
			legend: { display: hasMultipleTags },
		},
	};

	const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=600&h=300`;

	const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
	const totalHours = Math.round((totalDuration / (1000 * 60 * 60)) * 10) / 10;

	// 카테고리별 합계 텍스트
	let categoryBreakdown = '';
	if (hasMultipleTags) {
		const parts = tagOrder.map((tagValue) => {
			const tagLabel = SESSION_TAGS.find(t => t.value === tagValue)?.label || '기타';
			const tagHours = sessions
				.filter(s => (s.tag || 'etc') === tagValue)
				.reduce((sum, s) => sum + s.duration, 0);
			return `${tagLabel} ${Math.round((tagHours / (1000 * 60 * 60)) * 10) / 10}h`;
		});
		categoryBreakdown = ` | ${parts.join(' · ')}`;
	}

	const blocks = [
		{
			type: 'section',
			text: { type: 'mrkdwn', text: `:fairy-chart: *${label} 집중 기록*` },
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
					text: `총 ${sessions.length}개 세션 | :fairy-hourglass: 합계 ${totalHours}시간${categoryBreakdown}`,
				},
			],
		},
	];

	return new Response(
		JSON.stringify({ response_type: 'ephemeral', blocks }),
		{ headers: { 'Content-Type': 'application/json' } }
	);
}

/** CSV 형식 출력 (DM으로 파일 업로드) */
async function generateCsvExport(
	env: Env,
	teamId: string,
	userId: string,
	sessions: Array<Session & { date: string }>,
	label: string
): Promise<Response> {
	const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

	const header = '날짜,요일,시작,종료,소요시간(분),계획';

	const rows = sessions.map((session) => {
		const d = new Date(session.date + 'T00:00:00Z');
		const dayName = dayNames[d.getUTCDay()];
		const startTime = formatTimeShort(session.start);
		const endTime = formatTimeShort(session.end);
		const durationMinutes = Math.round(session.duration / 60000);
		const labelField = session.label ? `"${session.label.replace(/"/g, '""')}"` : '';

		return `${session.date},${dayName},${startTime},${endTime},${durationMinutes},${labelField}`;
	});

	const csvContent = [header, ...rows].join('\n');
	const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);

	// 파일명 생성 (예: focus-record-2026-01-12-2026-01-18.csv)
	const today = new Date().toISOString().split('T')[0];
	const filename = `focus-record-${today}.csv`;
	const title = `${label} 집중 기록`;

	// 파일 업로드 시도 (DM으로 전송)
	const uploaded = await uploadFile(env, teamId, userId, csvContent, filename, title);

	if (uploaded) {
		return replyEphemeral(
			`:fairy-chart: *${label} 집중 기록*\n\n` +
				`CSV 파일을 DM으로 보내드렸어요! :fairy-wand:\n` +
				`총 ${sessions.length}개 세션 | :fairy-hourglass: 합계 ${formatDuration(totalDuration)}`
		);
	} else {
		// 업로드 실패 시 텍스트로 폴백
		const message =
			`:fairy-chart: *${label} 집중 기록 (CSV)*\n\n` +
			'```\n' +
			csvContent +
			'\n```\n\n' +
			`총 ${sessions.length}개 세션 | :fairy-hourglass: 합계 ${formatDuration(totalDuration)}`;

		return replyEphemeral(message);
	}
}

/** 시간만 짧게 포맷 (HH:MM) */
function formatTimeShort(ts: number): string {
	const d = new Date(ts + 9 * 60 * 60 * 1000); // KST
	const h = d.getUTCHours().toString().padStart(2, '0');
	const m = d.getUTCMinutes().toString().padStart(2, '0');
	return `${h}:${m}`;
}
