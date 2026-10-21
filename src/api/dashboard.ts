/**
 * 익스텐션 대시보드용 API — 팀원 현황, 월 통계, 월 목표, 진행 중 세션 수정
 */

import type { ApiIdentity } from './auth';
import type { Session } from '../types';
import { getUserSessionState, type SessionState } from '../services/session';
import { getUserName } from '../utils/slack';
import { getTodayKey, getDateKey } from '../utils/date';
import { SESSION_TAGS } from '../constants/messages';

const MAX_TEAM_MEMBERS = 50;
const NAME_CACHE_TTL = 24 * 60 * 60; // 초
const MAX_GOAL_HOURS = 24 * 31;

/** 사이드 패널이 1분마다 부르므로 users.info 결과를 KV에 하루 캐시 */
async function getCachedUserName(env: Env, teamId: string, userId: string): Promise<string> {
	const key = `${teamId}:userName:${userId}`;
	const cached = await env.STUDY_KV.get(key);
	if (cached) return cached;

	const name = await getUserName(env, teamId, userId);
	if (name !== userId) {
		await env.STUDY_KV.put(key, name, { expirationTtl: NAME_CACHE_TTL });
	}
	return name;
}

async function readJson<T>(env: Env, key: string, fallback: T): Promise<T> {
	try {
		return JSON.parse((await env.STUDY_KV.get(key)) || 'null') ?? fallback;
	} catch {
		return fallback;
	}
}

export interface TeamMember {
	id: string;
	name: string;
	isMe: boolean;
	state: SessionState['state'];
	tag?: string;
	startTime?: number;
	pausedAt?: number;
	totalPauseDuration?: number;
	/** 오늘 끝낸 세션 합계 (진행 중 세션 제외) */
	todayMs: number;
}

/**
 * 오늘 집중한 사람(+ 어제 시작해서 아직 집중 중인 사람)의 현재 상태.
 * 계획 내용(label)은 개인 정보라 빼고 카테고리만 보낸다.
 */
export async function getTeamStatus(env: Env, { teamId, userId }: ApiIdentity): Promise<TeamMember[]> {
	const todayKey = getTodayKey();
	const yesterdayKey = getDateKey(Date.now() - 24 * 60 * 60 * 1000);
	const [todayList, yesterdayList, todaySessions] = await Promise.all([
		readJson<string[]>(env, `${teamId}:today:${todayKey}`, []),
		readJson<string[]>(env, `${teamId}:today:${yesterdayKey}`, []),
		readJson<Session[]>(env, `${teamId}:sessions:${todayKey}`, []),
	]);

	const ids = [...new Set([userId, ...todayList, ...yesterdayList])].slice(0, MAX_TEAM_MEMBERS);
	const members = await Promise.all(
		ids.map(async (id): Promise<TeamMember | null> => {
			const session = await getUserSessionState(env, teamId, id);
			// 어제 목록에만 있고 지금 쉬는 사람은 오늘 현황에서 뺀다
			if (id !== userId && session.state === 'idle' && !todayList.includes(id)) return null;
			return {
				id,
				name: await getCachedUserName(env, teamId, id),
				isMe: id === userId,
				state: session.state,
				tag: session.tag,
				startTime: session.startTime,
				pausedAt: session.pausedAt,
				totalPauseDuration: session.totalPauseDuration,
				todayMs: todaySessions.filter((s) => s.userId === id).reduce((sum, s) => sum + s.duration, 0),
			};
		})
	);

	const order = { focusing: 0, paused: 1, idle: 2 };
	const liveMs = (m: TeamMember) =>
		m.state !== 'idle' && m.startTime ? (m.pausedAt ?? Date.now()) - m.startTime - (m.totalPauseDuration || 0) : 0;
	return members
		.filter((m): m is TeamMember => m !== null)
		.sort((a, b) => order[a.state] - order[b.state] || b.todayMs + liveMs(b) - (a.todayMs + liveMs(a)));
}

export interface MonthStats {
	month: string;
	today: string;
	/** 1일부터 말일까지, 미래 날짜는 0 */
	days: { date: string; ms: number; count: number }[];
	totalMs: number;
	goalMs: number | null;
	byTag: Record<string, number>;
}

/** 월별 일 단위 집중 시간 (YYYY-MM, 기본 이번 달 KST) */
export async function getMonthStats(env: Env, { teamId, userId }: ApiIdentity, monthParam: string | null): Promise<MonthStats | null> {
	const today = getTodayKey();
	const month = monthParam ?? today.slice(0, 7);
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;

	const [year, mon] = month.split('-').map(Number);
	const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
	const dates = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);

	const [perDay, goal] = await Promise.all([
		Promise.all(dates.map((date) => (date > today ? Promise.resolve([]) : readJson<Session[]>(env, `${teamId}:sessions:${date}`, [])))),
		env.STUDY_KV.get(`${teamId}:goal:${userId}`),
	]);

	const byTag: Record<string, number> = {};
	const days = dates.map((date, i) => {
		const mine = perDay[i].filter((s) => s.userId === userId);
		for (const s of mine) {
			const tag = s.tag || 'none';
			byTag[tag] = (byTag[tag] || 0) + s.duration;
		}
		return { date, ms: mine.reduce((sum, s) => sum + s.duration, 0), count: mine.length };
	});

	return {
		month,
		today,
		days,
		totalMs: days.reduce((sum, d) => sum + d.ms, 0),
		goalMs: goal ? Number(goal) : null,
		byTag,
	};
}

/** 월 목표 시간 설정. 0 이나 null 이면 해제. 잘못된 값이면 false */
export async function setMonthlyGoal(env: Env, { teamId, userId }: ApiIdentity, hours: unknown): Promise<number | null | false> {
	if (hours === null || hours === 0) {
		await env.STUDY_KV.delete(`${teamId}:goal:${userId}`);
		return null;
	}
	const value = Number(hours);
	if (!Number.isFinite(value) || value <= 0 || value > MAX_GOAL_HOURS) return false;

	const goalMs = Math.round(value * 60) * 60 * 1000;
	await env.STUDY_KV.put(`${teamId}:goal:${userId}`, String(goalMs));
	return goalMs;
}

/**
 * 진행 중인 세션의 계획 / 카테고리 수정.
 * 세션이 없으면 'not_started', 잘못된 카테고리면 'invalid_tag'.
 */
export async function updateRunningSession(
	env: Env,
	{ teamId, userId }: ApiIdentity,
	body: Record<string, unknown>
): Promise<'ok' | 'not_started' | 'invalid_tag'> {
	const key = `${teamId}:checkin:${userId}`;
	const raw = await env.STUDY_KV.get(key);
	if (!raw) return 'not_started';

	let checkin: Record<string, unknown>;
	try {
		const parsed = JSON.parse(raw);
		checkin = typeof parsed === 'object' && parsed !== null ? parsed : { time: Number(raw) };
	} catch {
		checkin = { time: Number(raw) };
	}

	if (body.tag !== undefined) {
		if (body.tag === null || body.tag === '') delete checkin.tag;
		else if (SESSION_TAGS.some((t) => t.value === body.tag)) checkin.tag = body.tag;
		else return 'invalid_tag';
	}
	if (typeof body.label === 'string') {
		const label = body.label.trim().slice(0, 1000);
		if (label) checkin.label = label;
		else delete checkin.label;
	}

	await env.STUDY_KV.put(key, JSON.stringify(checkin));
	return 'ok';
}
