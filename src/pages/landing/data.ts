/**
 * 랜딩 페이지 데이터 수집 및 생성
 */

import type { Session } from '../../types';
import type { TeamMemberStats, FruitData, FireflyData } from './types';
import { FRUIT_COLORS, FRUIT_SIZE } from './constants';

/**
 * 이번 주 월요일부터 오늘까지의 날짜 키 생성
 */
function getWeekDateKeys(): string[] {
	const now = new Date();
	const dayOfWeek = now.getDay(); // 0(일) ~ 6(토)
	// 월요일까지 며칠 전인지 계산 (일요일이면 6일 전, 월요일이면 0일 전)
	const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

	const dateKeys: string[] = [];
	for (let i = daysFromMonday; i >= 0; i--) {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		dateKeys.push(d.toISOString().split('T')[0]);
	}
	return dateKeys;
}

/**
 * 팀 통계 수집 (병렬 처리) - 이번 주 월~오늘
 */
export async function collectTeamStats(env: Env, teamId: string): Promise<TeamMemberStats[]> {
	const statsMap = new Map<string, TeamMemberStats>();

	// 이번 주 월요일~오늘 날짜 키 생성
	const dateKeys = getWeekDateKeys();

	// 병렬로 KV 읽기
	const [sessionResults, activeData] = await Promise.all([
		Promise.all(dateKeys.map((key) => env.STUDY_KV.get(`${teamId}:sessions:${key}`))),
		env.STUDY_KV.get(`${teamId}:active`),
	]);

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

	// 현재 집중 중인 사용자 표시
	if (activeData) {
		const activeSessions: Record<string, { start: number }> = JSON.parse(activeData);
		for (const userId of Object.keys(activeSessions)) {
			const existing = statsMap.get(userId);
			if (existing) {
				existing.isActive = true;
			} else {
				statsMap.set(userId, { userId, weeklyDuration: 0, isActive: true });
			}
		}
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
