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

