/**
 * 세션 관련 비즈니스 로직
 */

import type { Session } from '../types';
import { formatDuration } from '../utils/format';
import { getUserNames } from '../utils/slack';
import { getWeekRangeForDate, getTodayKey } from '../utils/date';
import { MEDALS } from '../constants/messages';

/** 현재 세션 상태 (App Home, /mystats 등에서 공통으로 쓰는 표현) */
export interface SessionState {
	state: 'focusing' | 'paused' | 'idle';
	startTime?: number;
	label?: string;
	tag?: string;
	elapsedMs?: number;
	pausedAt?: number;
	totalPauseDuration?: number;
}

/** 사용자의 현재 진행 중인 세션 상태를 조회 (KV checkin 파싱) */
export async function getUserSessionState(env: Env, teamId: string, userId: string): Promise<SessionState> {
	const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);
	if (!checkIn) {
		return { state: 'idle' };
	}

	const now = Date.now();
	let startTime: number;
	let label: string | undefined;
	let tag: string | undefined;
	let pausedAt: number | undefined;
	let totalPauseDuration = 0;

	try {
		const parsed = JSON.parse(checkIn);
		if (typeof parsed === 'object' && parsed.time) {
			startTime = parsed.time;
			label = parsed.label;
			tag = parsed.tag;
			pausedAt = parsed.pausedAt;
			totalPauseDuration = parsed.totalPauseDuration || 0;
		} else {
			startTime = parseInt(checkIn);
		}
	} catch {
		startTime = parseInt(checkIn);
	}

	const ongoingPause = pausedAt ? now - pausedAt : 0;
	const elapsedMs = now - startTime - totalPauseDuration - ongoingPause;

	return {
		state: pausedAt ? 'paused' : 'focusing',
		startTime,
		label,
		tag,
		elapsedMs,
		pausedAt,
		totalPauseDuration,
	};
}

/** 사용자의 오늘 집중 통계 — 누적 시간, 세션 개수 */
export interface TodayStats {
	totalMs: number;
	sessionCount: number;
}

export async function getUserTodayStats(env: Env, teamId: string, userId: string): Promise<TodayStats> {
	const todayKey = getTodayKey();
	const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:sessions:${todayKey}`)) || '[]');
	const mine = sessions.filter((s) => s.userId === userId);
	return {
		totalMs: mine.reduce((sum, s) => sum + s.duration, 0),
		sessionCount: mine.length,
	};
}

/** 사용자의 이번 달 누적 집중 시간 */
export async function getUserMonthTotal(env: Env, teamId: string, userId: string): Promise<number> {
	const today = new Date(Date.now() + 9 * 60 * 60 * 1000);
	const year = today.getUTCFullYear();
	const month = today.getUTCMonth();
	const firstDay = new Date(Date.UTC(year, month, 1));
	const lastDay = new Date(Date.UTC(year, month + 1, 0));

	let total = 0;
	const current = new Date(firstDay);
	while (current <= lastDay) {
		const dateKey = current.toISOString().split('T')[0];
		const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:sessions:${dateKey}`)) || '[]');
		total += sessions.filter((s) => s.userId === userId).reduce((sum, s) => sum + s.duration, 0);
		current.setUTCDate(current.getUTCDate() + 1);
	}
	return total;
}

/** 사용자의 이번 주 팀 내 랭킹 (1-indexed). 참여자 없으면 rank=0. */
export interface WeeklyRank {
	rank: number;
	totalMs: number;
	teamSize: number;
}

export async function getUserWeeklyRank(env: Env, teamId: string, userId: string): Promise<WeeklyRank> {
	const today = new Date(Date.now() + 9 * 60 * 60 * 1000);
	const dayOfWeek = today.getUTCDay();
	const monday = new Date(today);
	monday.setUTCDate(today.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

	const totals: Record<string, number> = {};
	for (let i = 0; i < 7; i++) {
		const d = new Date(monday);
		d.setUTCDate(monday.getUTCDate() + i);
		const dateKey = d.toISOString().split('T')[0];
		const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:sessions:${dateKey}`)) || '[]');
		for (const s of sessions) {
			totals[s.userId] = (totals[s.userId] || 0) + s.duration;
		}
	}

	const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
	const idx = sorted.findIndex(([uid]) => uid === userId);

	return {
		rank: idx >= 0 ? idx + 1 : 0,
		totalMs: idx >= 0 ? sorted[idx][1] : 0,
		teamSize: sorted.length,
	};
}

/** 이번 주 누적 시간 계산 */
export async function getWeekTotal(env: Env, teamId: string, userId: string): Promise<number> {
	const today = new Date(Date.now() + 9 * 60 * 60 * 1000);
	const dayOfWeek = today.getUTCDay();
	const monday = new Date(today);
	monday.setUTCDate(today.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

	let total = 0;
	for (let i = 0; i < 7; i++) {
		const d = new Date(monday);
		d.setUTCDate(monday.getUTCDate() + i);
		const dateKey = d.toISOString().split('T')[0];
		const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:sessions:${dateKey}`)) || '[]');
		total += sessions.filter((s) => s.userId === userId).reduce((sum, s) => sum + s.duration, 0);
	}
	return total;
}

/** 특정 타임스탬프가 속한 주의 누적 시간 계산 */
export async function getWeekTotalForDate(env: Env, teamId: string, userId: string, ts: number): Promise<number> {
	const { startDate, endDate } = getWeekRangeForDate(ts);

	let total = 0;
	let current = new Date(startDate + 'T00:00:00Z');
	const end = new Date(endDate + 'T00:00:00Z');

	while (current <= end) {
		const dateKey = current.toISOString().split('T')[0];
		const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:sessions:${dateKey}`)) || '[]');
		total += sessions.filter((s) => s.userId === userId).reduce((sum, s) => sum + s.duration, 0);
		current.setUTCDate(current.getUTCDate() + 1);
	}
	return total;
}

/** 기간별 리포트 텍스트 생성 */
export async function generateReportText(
	env: Env,
	teamId: string,
	startDate: string,
	endDate: string,
	label: string
): Promise<string | null> {
	const stats: Record<string, number> = {};

	let current = new Date(startDate + 'T00:00:00Z');
	const end = new Date(endDate + 'T00:00:00Z');

	while (current <= end) {
		const dateKey = current.toISOString().split('T')[0];
		const sessions: Session[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:sessions:${dateKey}`)) || '[]');

		for (const session of sessions) {
			stats[session.userId] = (stats[session.userId] || 0) + session.duration;
		}

		current.setUTCDate(current.getUTCDate() + 1);
	}

	const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]);

	if (entries.length === 0) {
		return null;
	}

	// 사용자 이름들 한번에 조회
	const userIds = entries.map(([uid]) => uid);
	const userNames = await getUserNames(env, teamId, userIds);

	const lines = entries.map(([uid, ms], i) => {
		const medal = MEDALS[i] || `${i + 1}.`;
		const name = userNames.get(uid) || uid;
		return `${medal} ${name} - ${formatDuration(ms)}`;
	});

	const total = entries.reduce((sum, [, ms]) => sum + ms, 0);

	return (
		`:fairy-chart: *${label} 집중 시간 리포트*\n\n` +
		`${lines.join('\n')}\n\n` +
		`총 ${entries.length}명 | :fairy-hourglass: 합계 ${formatDuration(total)}`
	);
}
