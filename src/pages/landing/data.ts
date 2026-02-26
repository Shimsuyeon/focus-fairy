/**
 * 랜딩 페이지 데이터 수집 및 생성
 */

import type { Session } from '../../types';
import type { TeamMemberStats, FruitData, FireflyData, WeekInfo } from './types';
import { FRUIT_COLORS, FRUIT_SIZE, MAX_HISTORY_WEEKS } from './constants';

/**
 * 현재 주의 월요일 날짜를 구한다 (YYYY-MM-DD)
 */
function getCurrentMonday(): string {
	const now = new Date();
	const dayOfWeek = now.getDay();
	const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
	const monday = new Date(now);
	monday.setDate(monday.getDate() - daysFromMonday);
	return monday.toISOString().split('T')[0];
}

/**
 * 주어진 월요일부터 해당 주의 날짜 키 생성
 * - 이번 주: 월~오늘
 * - 과거 주: 월~일 (7일)
 */
function getWeekDateKeys(mondayStr: string, isCurrentWeek: boolean): string[] {
	const monday = new Date(mondayStr + 'T00:00:00');
	const endDay = isCurrentWeek ? new Date() : (() => { const d = new Date(monday); d.setDate(d.getDate() + 6); return d; })();

	const dateKeys: string[] = [];
	const d = new Date(monday);
	while (d <= endDay) {
		dateKeys.push(d.toISOString().split('T')[0]);
		d.setDate(d.getDate() + 1);
	}
	return dateKeys;
}

/**
 * weekStart 파라미터를 파싱하여 WeekInfo 생성
 */
export function resolveWeekInfo(weekParam?: string | null): WeekInfo {
	const currentMonday = getCurrentMonday();

	// 요청된 월요일 결정
	let monday = currentMonday;
	if (weekParam) {
		const parsed = new Date(weekParam + 'T00:00:00');
		if (!isNaN(parsed.getTime())) {
			// 해당 날짜가 속한 주의 월요일로 보정
			const dow = parsed.getDay();
			const diff = dow === 0 ? 6 : dow - 1;
			parsed.setDate(parsed.getDate() - diff);
			monday = parsed.toISOString().split('T')[0];
		}
	}

	// 미래 주 방지
	if (monday > currentMonday) monday = currentMonday;

	// 최대 히스토리 제한
	const oldestMonday = new Date(currentMonday + 'T00:00:00');
	oldestMonday.setDate(oldestMonday.getDate() - (MAX_HISTORY_WEEKS - 1) * 7);
	const oldestStr = oldestMonday.toISOString().split('T')[0];
	if (monday < oldestStr) monday = oldestStr;

	const isCurrentWeek = monday === currentMonday;

	// 해당 주 일요일
	const sundayDate = new Date(monday + 'T00:00:00');
	sundayDate.setDate(sundayDate.getDate() + 6);
	const sunday = sundayDate.toISOString().split('T')[0];

	// 이전 주 월요일
	const prevDate = new Date(monday + 'T00:00:00');
	prevDate.setDate(prevDate.getDate() - 7);
	const prevMonday = prevDate >= oldestMonday ? prevDate.toISOString().split('T')[0] : monday;

	// 다음 주 월요일
	let nextMonday: string | null = null;
	if (!isCurrentWeek) {
		const nextDate = new Date(monday + 'T00:00:00');
		nextDate.setDate(nextDate.getDate() + 7);
		nextMonday = nextDate.toISOString().split('T')[0];
		if (nextMonday > currentMonday) nextMonday = currentMonday;
	}

	// 라벨 생성 (예: "2월 1주")
	const mondayDate = new Date(monday + 'T00:00:00');
	const month = mondayDate.getMonth() + 1;
	const weekOfMonth = Math.ceil(mondayDate.getDate() / 7);
	const label = isCurrentWeek ? '이번 주' : `${month}월 ${weekOfMonth}주차`;

	// 날짜 범위 (예: "02.03 ~ 02.09")
	const fmt = (d: string) => d.slice(5).replace('-', '.');
	const dateRange = `${fmt(monday)} ~ ${fmt(sunday)}`;

	return { monday, sunday, isCurrentWeek, prevMonday, nextMonday, label, dateRange };
}

/**
 * 팀 통계 수집 (병렬 처리) - 지정 주차
 */
export async function collectTeamStats(env: Env, teamId: string, weekInfo: WeekInfo): Promise<TeamMemberStats[]> {
	const statsMap = new Map<string, TeamMemberStats>();

	const dateKeys = getWeekDateKeys(weekInfo.monday, weekInfo.isCurrentWeek);

	// 세션 데이터 수집
	const sessionResults = await Promise.all(
		dateKeys.map((key) => env.STUDY_KV.get(`${teamId}:sessions:${key}`))
	);

	// 세션 데이터 집계
	for (const result of sessionResults) {
		const sessions: Session[] = JSON.parse(result || '[]');
		for (const session of sessions) {
			const existing = statsMap.get(session.userId);
			if (existing) {
				existing.weeklyDuration += session.duration;
			} else {
				statsMap.set(session.userId, {
					userId: session.userId,
					weeklyDuration: session.duration,
					isActive: false,
				});
			}
		}
	}

	// 현재 주일 때만 활성 사용자 확인 (checkin 키 목록으로 전체 탐색)
	if (weekInfo.isCurrentWeek) {
		const checkinList = await env.STUDY_KV.list({ prefix: `${teamId}:checkin:` });
		const checkinValues = await Promise.all(
			checkinList.keys.map((key) => env.STUDY_KV.get(key.name))
		);
		checkinList.keys.forEach((key, idx) => {
			const userId = key.name.replace(`${teamId}:checkin:`, '');
			const startTime = parseInt(checkinValues[idx] || '0');
			const currentSessionDuration = startTime > 0 ? Date.now() - startTime : 0;

			const existing = statsMap.get(userId);
			if (existing) {
				existing.isActive = true;
				existing.weeklyDuration += currentSessionDuration;
			} else {
				statsMap.set(userId, {
					userId,
					weeklyDuration: currentSessionDuration,
					isActive: true,
				});
			}
		});
	}

	return Array.from(statsMap.values());
}

/**
 * 열매 렌더링 데이터 생성
 */
export function generateFruitData(stats: TeamMemberStats[]): FruitData[] {
	const maxDuration = Math.max(...stats.map((s) => s.weeklyDuration), 1);

	return stats.map((stat, idx) => {
		const normalized = Math.max(0.3, stat.weeklyDuration / maxDuration);
		const size = FRUIT_SIZE.min + normalized * (FRUIT_SIZE.max - FRUIT_SIZE.min);
		const glowIntensity = normalized * 20;
		const color = FRUIT_COLORS[idx % FRUIT_COLORS.length];

		// 원형 배치
		const angle = (idx / stats.length) * Math.PI * 2 - Math.PI / 2;
		const radius = 80 + Math.random() * 40;

		return {
			...stat,
			size,
			glowIntensity,
			color,
			x: 50 + Math.cos(angle) * (radius / 3),
			y: 45 + Math.sin(angle) * (radius / 5),
		};
	});
}

/**
 * 반딧불이 렌더링 데이터 생성
 */
export function generateFireflyData(count: number): FireflyData[] {
	return Array.from({ length: count }, (_, id) => ({
		id,
		x: Math.random() * 100,
		y: Math.random() * 100,
		delay: Math.random() * 5,
		duration: 3 + Math.random() * 4,
	}));
}
