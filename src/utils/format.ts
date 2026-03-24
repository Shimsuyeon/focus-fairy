/**
 * 포맷팅 유틸리티
 */

const TZ_LABELS: Record<string, string> = {
	'Asia/Seoul': 'KST',
	'Asia/Tokyo': 'JST',
	'Asia/Shanghai': 'CST',
	'America/New_York': 'ET',
	'America/Chicago': 'CT',
	'America/Denver': 'MT',
	'America/Los_Angeles': 'PT',
	'Europe/London': 'GMT',
	'Europe/Berlin': 'CET',
	'Pacific/Auckland': 'NZST',
};

/** 타임스탬프를 유저 타임존 기준 문자열로 변환 */
export function formatTime(ts: number, timezone?: string, showLabel?: boolean): string {
	const tz = timezone || 'Asia/Seoul';
	const timeStr = new Date(ts).toLocaleString('ko-KR', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: tz,
	});
	if (!showLabel) return timeStr;
	const tzLabel = TZ_LABELS[tz] || tz.split('/').pop()?.replace('_', ' ') || tz;
	return `${timeStr} (${tzLabel})`;
}

/** 밀리초를 "X시간 Y분" 형식으로 변환 */
export function formatDuration(ms: number): string {
	const h = Math.floor(ms / 3600000);
	const m = Math.floor((ms % 3600000) / 60000);
	if (h > 0) return `${h}시간 ${m}분`;
	return `${m}분`;
}

interface PausePeriod {
	start: number;
	end: number;
}

/**
 * 점심시간 자동 차감량 계산
 * 세션이 점심 윈도우와 겹치는 시간에서 pause와 겹치는 시간을 빼고 반환
 */
export function calcLunchDeduction(
	sessionStart: number,
	sessionEnd: number,
	timezone: string,
	lunchStartStr: string,
	lunchEndStr: string,
	pausePeriods: PausePeriod[]
): number {
	const [lunchStartH, lunchStartM] = lunchStartStr.split(':').map(Number);
	const [lunchEndH, lunchEndM] = lunchEndStr.split(':').map(Number);

	const startDate = new Date(sessionStart);
	const endDate = new Date(sessionEnd);

	const getLocalDate = (ts: number): string =>
		new Date(ts).toLocaleDateString('en-CA', { timeZone: timezone });

	const startDateStr = getLocalDate(sessionStart);
	const endDateStr = getLocalDate(sessionEnd);

	const dates: string[] = [];
	const cur = new Date(startDateStr + 'T00:00:00');
	const last = new Date(endDateStr + 'T00:00:00');
	while (cur <= last) {
		dates.push(cur.toISOString().slice(0, 10));
		cur.setDate(cur.getDate() + 1);
	}

	let totalDeduction = 0;

	for (const dateStr of dates) {
		const lunchStartLocal = new Date(`${dateStr}T${pad(lunchStartH)}:${pad(lunchStartM)}:00`);
		const lunchEndLocal = new Date(`${dateStr}T${pad(lunchEndH)}:${pad(lunchEndM)}:00`);

		const lunchStartUtc = localToUtc(lunchStartLocal, timezone, sessionStart);

		if (sessionStart >= lunchStartUtc) continue;
		const lunchEndUtc = localToUtc(lunchEndLocal, timezone, sessionStart);

		const overlapStart = Math.max(sessionStart, lunchStartUtc);
		const overlapEnd = Math.min(sessionEnd, lunchEndUtc);
		if (overlapStart >= overlapEnd) continue;

		let lunchOverlap = overlapEnd - overlapStart;

		for (const pause of pausePeriods) {
			const pauseOverlapStart = Math.max(overlapStart, pause.start);
			const pauseOverlapEnd = Math.min(overlapEnd, pause.end);
			if (pauseOverlapStart < pauseOverlapEnd) {
				lunchOverlap -= (pauseOverlapEnd - pauseOverlapStart);
			}
		}

		totalDeduction += Math.max(0, lunchOverlap);
	}

	return totalDeduction;
}

function pad(n: number): string {
	return n.toString().padStart(2, '0');
}

/**
 * 유저 로컬 시간을 UTC timestamp로 변환
 * referenceTs를 사용해 UTC 오프셋을 계산
 */
function localToUtc(localDate: Date, timezone: string, referenceTs: number): number {
	const refDate = new Date(referenceTs);
	const refLocal = new Date(refDate.toLocaleString('en-US', { timeZone: timezone }));
	const offset = refLocal.getTime() - refDate.getTime();
	return localDate.getTime() - offset;
}

/** "X시간 Y분" 형식의 문자열을 밀리초로 파싱 */
export function parseDuration(text: string): number | null {
	let total = 0;
	const hourMatch = text.match(/(\d+)\s*시간/);
	const minMatch = text.match(/(\d+)\s*분/);

	if (!hourMatch && !minMatch) return null;

	if (hourMatch) total += parseInt(hourMatch[1]) * 60 * 60 * 1000;
	if (minMatch) total += parseInt(minMatch[1]) * 60 * 1000;

	return total;
}

