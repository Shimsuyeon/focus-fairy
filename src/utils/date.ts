/**
 * 날짜 유틸리티 (KST 기준)
 */

import type { DateRange } from '../types';

/** KST 오프셋 (밀리초) */
const KST_OFFSET = 9 * 60 * 60 * 1000;

/** 오늘 날짜 키 반환 (YYYY-MM-DD) */
export function getTodayKey(): string {
	const d = new Date(Date.now() + KST_OFFSET);
	return d.toISOString().split('T')[0];
}

/** 타임스탬프를 날짜 키로 변환 (YYYY-MM-DD) */
export function getDateKey(ts: number): string {
	const d = new Date(ts + KST_OFFSET);
	return d.toISOString().split('T')[0];
}

/** 기간 문자열을 시작/종료 날짜로 변환 */
export function getDateRange(period: string): DateRange {
	const today = new Date(Date.now() + KST_OFFSET);
	const year = today.getUTCFullYear();
	const month = today.getUTCMonth();
	const date = today.getUTCDate();
	const dayOfWeek = today.getUTCDay();

	switch (period) {
		case 'week':
		case 'thisweek': {
			const monday = new Date(Date.UTC(year, month, date - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)));
			const sunday = new Date(monday);
			sunday.setUTCDate(monday.getUTCDate() + 6);
			return {
				startDate: monday.toISOString().split('T')[0],
				endDate: sunday.toISOString().split('T')[0],
				label: '이번 주',
			};
		}
		case 'lastweek': {
			const lastMonday = new Date(Date.UTC(year, month, date - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7));
			const lastSunday = new Date(lastMonday);
			lastSunday.setUTCDate(lastMonday.getUTCDate() + 6);
			return {
				startDate: lastMonday.toISOString().split('T')[0],
				endDate: lastSunday.toISOString().split('T')[0],
				label: '지난 주',
			};
		}
		case 'thismonth': {
			const firstDay = new Date(Date.UTC(year, month, 1));
			const lastDay = new Date(Date.UTC(year, month + 1, 0));
			return {
				startDate: firstDay.toISOString().split('T')[0],
				endDate: lastDay.toISOString().split('T')[0],
				label: `${month + 1}월`,
			};
		}
		case 'lastmonth': {
			const firstDay = new Date(Date.UTC(year, month - 1, 1));
			const lastDay = new Date(Date.UTC(year, month, 0));
			return {
				startDate: firstDay.toISOString().split('T')[0],
				endDate: lastDay.toISOString().split('T')[0],
				label: `${month}월`,
			};
		}
		default:
			return { startDate: '', endDate: '', label: '' };
	}
}

