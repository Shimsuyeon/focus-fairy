/**
 * 운영자용 사용 현황 집계 — 로컬에서 `npm run usage` 로 실행 (scripts/usage.ts)
 *
 * 따로 카운터를 쌓지 않고, 이미 저장되는 세션 기록(`${teamId}:sessions:${date}`)을 읽어서 계산한다 (KV 쓰기 없음).
 * 결과에는 합계만 담는다. 사용자 ID·이름·계획 내용은 내보내지 않는다.
 * Worker 밖(Node)에서도 돌도록 런타임 import 없이 KV 읽기 함수만 받는다.
 */

import type { Session } from '../types';

/** 읽기만 하는 KV — Worker의 KVNamespace, 로컬 스크립트의 Cloudflare API 어느 쪽이든 */
export interface UsageKVReader {
	listKeys(): Promise<string[]>;
	get(key: string): Promise<string | null>;
}

const KST_OFFSET = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
/** 이보다 오래 켜져 있는 세션은 끄는 걸 잊은 것으로 보고 '지금 집중 중'에서 뺀다 */
const STALE_CHECKIN = DAY;
export const USAGE_DAYS = 30;
export const USAGE_WEEKS = 8;

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
	totals: { teams: number; activeTeams30: number; users30: number; users7: number; sessions30: number; focusMs30: number; focusingNow: number; staleCheckins: number };
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

export async function buildUsageReport(
	kv: UsageKVReader,
	{ now = Date.now(), teamName = async (teamId: string) => teamId }: { now?: number; teamName?: (teamId: string) => Promise<string> } = {}
): Promise<UsageReport> {
	const today = kstDate(now);
	const since30 = addDays(today, -(USAGE_DAYS - 1));
	const since7 = addDays(today, -6);
	const thisWeek = weekOf(today);
	// 첫 주의 신규 / 유지를 계산하려고 한 주 더 앞에서부터 읽는다
	const sinceWeeks = addDays(thisWeek, -7 * USAGE_WEEKS);
	const readFrom = since30 < sinceWeeks ? since30 : sinceWeeks;

	const keys = await kv.listKeys();
	const sessionKeys: Array<{ key: string; teamId: string; date: string }> = [];
	const teamIds = new Set<string>();
	const installed = new Set<string>();
	const focusingNow = new Map<string, number>();
	const checkinKeys: Array<{ key: string; teamId: string }> = [];
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
		if (kind === 'checkin') checkinKeys.push({ key: name, teamId });
		else if (kind === 'goal') goalUsers.add(name);
		else if (kind === 'userToken') syncUsers.add(name);
	}

	// 진행 중 세션은 시작 시각만 본다 (계획 내용은 쓰지 않음)
	let staleCheckins = 0;
	await Promise.all(
		checkinKeys.map(async ({ key, teamId }) => {
			const raw = await kv.get(key);
			let start = NaN;
			try {
				const parsed = JSON.parse(raw || '');
				start = typeof parsed === 'object' && parsed ? Number(parsed.time) : Number(parsed);
			} catch {
				start = Number(raw);
			}
			if (Number.isFinite(start) && now - start < STALE_CHECKIN) focusingNow.set(teamId, (focusingNow.get(teamId) || 0) + 1);
			else staleCheckins++;
		})
	);

	const loaded = await Promise.all(
		sessionKeys.map(async ({ key, teamId, date }) => {
			let sessions: Session[] = [];
			try {
				const parsed = JSON.parse((await kv.get(key)) || '[]');
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

	const names = new Map(await Promise.all([...teamIds].map(async (id) => [id, await teamName(id)] as const)));

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
			staleCheckins,
		},
		teams,
		daily: dailyRows,
		weekly: weeklyRows,
		features: { ...features, usersWithGoal: goalUsers.size, usersWithStatusSync: syncUsers.size },
	};
}

// ── 터미널 출력 ─────────────────────────────────────────────

/** 한글·이모지는 터미널에서 2칸 */
function displayWidth(text: string): number {
	let width = 0;
	for (const ch of text) {
		const code = ch.codePointAt(0)!;
		width += code >= 0x1100 && (code <= 0x115f || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60) || (code >= 0x1f300 && code <= 0x1faff)) ? 2 : 1;
	}
	return width;
}

const pad = (text: string, width: number, right = false) => {
	const space = ' '.repeat(Math.max(0, width - displayWidth(text)));
	return right ? space + text : text + space;
};

function table(header: string[], rows: string[][], rightFrom = 1, rightTo = header.length): string {
	const widths = header.map((h, i) => Math.max(displayWidth(h), ...rows.map((r) => displayWidth(r[i]))));
	const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i], i >= rightFrom && i < rightTo)).join('  ');
	return [line(header), widths.map((w) => '─'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
}

function hoursText(ms: number): string {
	if (!ms) return '–';
	const h = Math.floor(ms / 3600000);
	const m = Math.floor((ms % 3600000) / 60000);
	return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

const pctText = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '–');
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const bar = (n: number, max: number, width = 20) => '█'.repeat(max ? Math.round((n / max) * width) : 0) || (n ? '▏' : '');

export function renderUsageText(r: UsageReport): string {
	const t = r.totals;
	const f = r.features;
	const generated = new Date(r.generatedAt + KST_OFFSET).toISOString().slice(0, 16).replace('T', ' ');
	const out: string[] = [];

	out.push(`🧚 집중요정 사용 현황 — 최근 ${r.days}일 · ${generated} KST`);
	out.push(
		`지금 집중 중 ${t.focusingNow}명 · 7일 사용자 ${t.users7}명 · 30일 사용자 ${t.users30}명 · ` +
			`활성 워크스페이스 ${t.activeTeams30}/${t.teams} · 30일 세션 ${t.sessions30} · 집중 ${hoursText(t.focusMs30)}`
	);

	out.push('', '■ 워크스페이스');
	out.push(
		table(
			['워크스페이스', '7일', '30일', '활동일', '세션', '집중 시간', '지금', '마지막 기록'],
			r.teams.map((x) => [
				x.name === x.teamId ? x.teamId : `${x.name} (${x.teamId})`,
				String(x.users7),
				String(x.users30),
				String(x.activeDays30),
				String(x.sessions30),
				hoursText(x.focusMs30),
				x.focusingNow ? String(x.focusingNow) : '',
				x.lastActive ? x.lastActive : '–',
			])
		)
	);

	const maxWeek = Math.max(1, ...r.weekly.map((w) => w.users));
	out.push('', '■ 주별 사용자 (월요일 기준)');
	out.push(
		table(
			['주', '사용자', '신규', '지난주에도', '유지율', ''],
			r.weekly.map((w) => [
				md(w.week),
				String(w.users),
				String(w.newUsers),
				String(w.retained),
				w.retention === null ? '–' : `${Math.round(w.retention * 100)}%`,
				bar(w.users, maxWeek),
			]),
			1,
			5
		).replace(/ +$/gm, '')
	);

	const maxDay = Math.max(1, ...r.daily.map((d) => d.users));
	out.push('', `■ 일별 사용자 (최근 ${r.days}일)`);
	out.push(
		r.daily
			.map((d) => `${pad(md(d.date), 5, true)} ${pad(String(d.users), 3, true)}명 ${bar(d.users, maxDay)}${d.extensionSessions ? `  (익스텐션 ${d.extensionSessions})` : ''}`)
			.join('\n')
	);

	out.push('', `■ 기능 사용 (최근 ${r.days}일 세션 ${f.sessions}개 기준)`);
	out.push(
		table(
			['기능', '비율', '세션'],
			[
				['익스텐션에서 시작', pctText(f.startedFromExtension, f.sessions), String(f.startedFromExtension)],
				['익스텐션에서 종료', pctText(f.endedFromExtension, f.sessions), String(f.endedFromExtension)],
				['기록만 (채널 메시지 없음)', pctText(f.recordOnly, f.sessions), String(f.recordOnly)],
				['카테고리 지정', pctText(f.withTag, f.sessions), String(f.withTag)],
				['계획 작성', pctText(f.withPlan, f.sessions), String(f.withPlan)],
				['쉬어가기 사용', pctText(f.withPause, f.sessions), String(f.withPause)],
			]
		)
	);
	out.push(`월 목표 설정 ${f.usersWithGoal}명 · Slack status 동기화 연결 ${f.usersWithStatusSync}명`);
	if (t.staleCheckins) out.push(`⚠️ 24시간 넘게 켜져 있는 세션 ${t.staleCheckins}개 (끄는 걸 잊은 것으로 보고 '지금 집중 중'에서 뺐어요)`);
	out.push('', '※ 합계만 표시해요 (사용자·계획 내용 없음). 출처(Slack/익스텐션)는 이 기능 배포 이후 세션부터 기록돼요.');
	return out.join('\n');
}
