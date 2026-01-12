/**
 * 포맷팅 유틸리티
 */

/** 타임스탬프를 한국 시간 문자열로 변환 */
export function formatTime(ts: number): string {
	return new Date(ts).toLocaleString('ko-KR', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Asia/Seoul',
	});
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

