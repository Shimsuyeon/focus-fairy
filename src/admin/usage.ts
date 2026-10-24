/**
 * 운영자용 사용 현황 집계 — GET /admin/usage
 *
 * 따로 카운터를 쌓지 않고, 이미 저장되는 세션 기록(`${teamId}:sessions:${date}`)을 볼 때 계산한다 (KV 쓰기 없음).
 * 결과에는 합계만 담는다. 사용자 ID·이름·계획 내용은 내보내지 않는다.
 */

import type { Session } from '../types';
import { getTeamName } from '../utils/slack';

const KST_OFFSET = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
export const USAGE_DAYS = 30;
export const USAGE_WEEKS = 8;
const TEAM_NAME_TTL = 24 * 60 * 60;

const SESSIONS_KEY = /^([^:]+):sessions:(\d{4}-\d{2}-\d{2})$/;

export interface TeamUsage {
	teamId: string;
	name: string;
	installed: boolean;
	users30: number;
	users7: number;
	sessions30: number;
	focusMs30: number;
	activeDays30: number;
	focusingNow: number;
	lastActive: string | null;
}

export interface DayUsage {
	date: string;
	users: number;
	sessions: number;
	focusMs: number;
	extensionSessions: number;
}

export interface WeekUsage {
	/** 주 시작(월요일) */
	week: string;
	users: number;
	/** 앞선 주들(집계 범위 안)에 기록이 없던 사용자 */
	newUsers: number;
	/** 지난주에도 집중한 사용자 */
	retained: number;
	/** retained / 지난주 사용자 (지난주 0명이면 null) */
	retention: number | null;
}

export interface UsageReport {
	generatedAt: number;
	days: number;
	totals: { teams: number; activeTeams30: number; users30: number; users7: number; sessions30: number; focusMs30: number; focusingNow: number };
	teams: TeamUsage[];
	daily: DayUsage[];
	weekly: WeekUsage[];
	features: {
		sessions: number;
		withTag: number;
		withPlan: number;
		withPause: number;
		startedFromExtension: number;
		endedFromExtension: number;
		recordOnly: number;
		usersWithGoal: number;
		usersWithStatusSync: number;
	};
}

const kstDate = (ts: number) => new Date(ts + KST_OFFSET).toISOString().slice(0, 10);

function addDays(date: string, n: number): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** 그 날짜가 속한 주의 월요일 */
function weekOf(date: string): string {
	const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
	return addDays(date, -((dow + 6) % 7));
}

async function listAllKeys(env: Env): Promise<string[]> {
	const names: string[] = [];
	let cursor: string | undefined;
	do {
		const page = await env.STUDY_KV.list({ cursor });
		names.push(...page.keys.map((k) => k.name));
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return names;
}

async function getCachedTeamName(env: Env, teamId: string): Promise<string> {
	const cached = await env.STUDY_KV.get(`${teamId}:teamName`);
	if (cached) return cached;
	const name = await getTeamName(env, teamId);
	if (name !== teamId) await env.STUDY_KV.put(`${teamId}:teamName`, name, { expirationTtl: TEAM_NAME_TTL });
	return name;
}

export async function buildUsageReport(env: Env, now = Date.now()): Promise<UsageReport> {
	const today = kstDate(now);
	const since30 = addDays(today, -(USAGE_DAYS - 1));
	const since7 = addDays(today, -6);
	const thisWeek = weekOf(today);
	// 첫 주의 신규 / 유지를 계산하려고 한 주 더 앞에서부터 읽는다
	const sinceWeeks = addDays(thisWeek, -7 * USAGE_WEEKS);
	const readFrom = since30 < sinceWeeks ? since30 : sinceWeeks;

	const keys = await listAllKeys(env);
	const sessionKeys: Array<{ key: string; teamId: string; date: string }> = [];
	const teamIds = new Set<string>();
	const installed = new Set<string>();
	const focusingNow = new Map<string, number>();
	const goalUsers = new Set<string>();
	const syncUsers = new Set<string>();
	const lastActive = new Map<string, string>();

	for (const name of keys) {
		const m = SESSIONS_KEY.exec(name);
		if (m) {
			const [, teamId, date] = m;
			teamIds.add(teamId);
			if (date > (lastActive.get(teamId) || '')) lastActive.set(teamId, date);
			if (date >= readFrom && date <= today) sessionKeys.push({ key: name, teamId, date });
			continue;
		}
		if (name.startsWith('tokens:')) {
			const teamId = name.slice('tokens:'.length);
			installed.add(teamId);
			teamIds.add(teamId);
			continue;
		}
		const [teamId, kind] = name.split(':');
		if (kind === 'checkin') focusingNow.set(teamId, (focusingNow.get(teamId) || 0) + 1);
		else if (kind === 'goal') goalUsers.add(name);
		else if (kind === 'userToken') syncUsers.add(name);
	}

	const loaded = await Promise.all(
		sessionKeys.map(async ({ key, teamId, date }) => {
			let sessions: Session[] = [];
			try {
				const parsed = JSON.parse((await env.STUDY_KV.get(key)) || '[]');
				if (Array.isArray(parsed)) sessions = parsed;
			} catch {
				// 깨진 기록은 건너뛴다
			}
			return { teamId, date, sessions };
		})
	);

	// 사용자는 팀:사용자 로 구분하고, 결과에는 개수만 남긴다
	const daily = new Map<string, { users: Set<string>; sessions: number; focusMs: number; ext: number }>();
	const weekly = new Map<string, Set<string>>();
	const team = new Map<string, { users30: Set<string>; users7: Set<string>; sessions30: number; focusMs30: number; days: Set<string> }>();
	const users30 = new Set<string>();
	const users7 = new Set<string>();
	const features = { sessions: 0, withTag: 0, withPlan: 0, withPause: 0, startedFromExtension: 0, endedFromExtension: 0, recordOnly: 0 };

	for (const { teamId, date, sessions } of loaded) {
		for (const s of sessions) {
			if (!s || typeof s.userId !== 'string') continue;
			const who = `${teamId}:${s.userId}`;
			const week = weekOf(date);
			if (week >= sinceWeeks) {
				if (!weekly.has(week)) weekly.set(week, new Set());
				weekly.get(week)!.add(who);
			}
			if (date < since30) continue;

			const day = daily.get(date) || { users: new Set<string>(), sessions: 0, focusMs: 0, ext: 0 };
			day.users.add(who);
			day.sessions++;
			day.focusMs += s.duration || 0;
			if (s.source === 'extension') day.ext++;
			daily.set(date, day);

			const t = team.get(teamId) || { users30: new Set<string>(), users7: new Set<string>(), sessions30: 0, focusMs30: 0, days: new Set<string>() };
			t.users30.add(who);
			t.sessions30++;
			t.focusMs30 += s.duration || 0;
			t.days.add(date);
			if (date >= since7) {
				t.users7.add(who);
				users7.add(who);
			}
			team.set(teamId, t);
			users30.add(who);

			features.sessions++;
			if (s.tag) features.withTag++;
			if (s.label) features.withPlan++;
			if (s.pauseDuration) features.withPause++;
			if (s.source === 'extension') features.startedFromExtension++;
			if (s.endSource === 'extension') features.endedFromExtension++;
			if (s.recordOnly) features.recordOnly++;
		}
	}

	const names = new Map(await Promise.all([...teamIds].map(async (id) => [id, await getCachedTeamName(env, id)] as const)));

	const teams: TeamUsage[] = [...teamIds]
		.map((teamId) => {
			const t = team.get(teamId);
			return {
				teamId,
				name: names.get(teamId) || teamId,
				installed: installed.has(teamId),
				users30: t?.users30.size || 0,
				users7: t?.users7.size || 0,
				sessions30: t?.sessions30 || 0,
				focusMs30: t?.focusMs30 || 0,
				activeDays30: t?.days.size || 0,
				focusingNow: focusingNow.get(teamId) || 0,
				lastActive: lastActive.get(teamId) || null,
			};
		})
		.sort((a, b) => b.focusMs30 - a.focusMs30 || (b.lastActive || '').localeCompare(a.lastActive || ''));

	const dailyRows: DayUsage[] = [];
	for (let i = 0; i < USAGE_DAYS; i++) {
		const date = addDays(since30, i);
		const d = daily.get(date);
		dailyRows.push({ date, users: d?.users.size || 0, sessions: d?.sessions || 0, focusMs: d?.focusMs || 0, extensionSessions: d?.ext || 0 });
	}

	const weeklyRows: WeekUsage[] = [];
	const seen = new Set<string>(weekly.get(sinceWeeks) || []);
	for (let i = 1; i <= USAGE_WEEKS; i++) {
		const week = addDays(sinceWeeks, 7 * i);
		const prev = weekly.get(addDays(week, -7)) || new Set<string>();
		const cur = weekly.get(week) || new Set<string>();
		let newUsers = 0;
		let retained = 0;
		for (const who of cur) {
			if (!seen.has(who)) newUsers++;
			if (prev.has(who)) retained++;
		}
		cur.forEach((who) => seen.add(who));
		weeklyRows.push({ week, users: cur.size, newUsers, retained, retention: prev.size ? retained / prev.size : null });
	}

	return {
		generatedAt: now,
		days: USAGE_DAYS,
		totals: {
			teams: teamIds.size,
			activeTeams30: teams.filter((t) => t.sessions30 > 0).length,
			users30: users30.size,
			users7: users7.size,
			sessions30: features.sessions,
			focusMs30: teams.reduce((sum, t) => sum + t.focusMs30, 0),
			focusingNow: [...focusingNow.values()].reduce((a, b) => a + b, 0),
		},
		teams,
		daily: dailyRows,
		weekly: weeklyRows,
		features: { ...features, usersWithGoal: goalUsers.size, usersWithStatusSync: syncUsers.size },
	};
}
