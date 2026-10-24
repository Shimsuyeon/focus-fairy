/**
 * 운영자 전용 페이지 — GET /admin/usage (?format=json)
 * HTTP Basic 인증, 비밀번호는 Worker secret ADMIN_TOKEN (사용자 이름은 아무거나).
 * ADMIN_TOKEN이 설정되지 않았으면 페이지 자체가 없는 것처럼 404.
 */

import { buildUsageReport, type UsageReport } from './usage';
import { formatDuration } from '../utils/format';

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

async function sha256(text: string): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** 길이와 관계없이 같은 시간에 비교하려고 해시끼리 비교 */
async function safeEqual(a: string, b: string): Promise<boolean> {
	const [x, y] = await Promise.all([sha256(a), sha256(b)]);
	let diff = 0;
	for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
	return diff === 0;
}

async function isAuthorized(request: Request, adminToken: string): Promise<boolean> {
	const header = request.headers.get('Authorization') || '';
	if (!header.startsWith('Basic ')) return false;
	let decoded: string;
	try {
		decoded = atob(header.slice(6));
	} catch {
		return false;
	}
	const password = decoded.slice(decoded.indexOf(':') + 1);
	return safeEqual(password, adminToken);
}

export async function handleAdmin(request: Request, env: Env, url: URL): Promise<Response> {
	if (!env.ADMIN_TOKEN || url.pathname !== '/admin/usage') {
		return new Response('Not Found', { status: 404 });
	}
	if (!(await isAuthorized(request, env.ADMIN_TOKEN))) {
		return new Response('Unauthorized', {
			status: 401,
			headers: { ...NO_STORE, 'WWW-Authenticate': 'Basic realm="focus-fairy admin", charset="UTF-8"' },
		});
	}

	const report = await buildUsageReport(env);
	if (url.searchParams.get('format') === 'json') {
		return Response.json(report, { headers: NO_STORE });
	}
	return new Response(renderUsagePage(report), { headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8' } });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '–');
const hours = (ms: number) => (ms ? formatDuration(ms) : '–');
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

function renderUsagePage(r: UsageReport): string {
	const t = r.totals;
	const f = r.features;
	const maxDay = Math.max(1, ...r.daily.map((d) => d.users));
	const maxWeek = Math.max(1, ...r.weekly.map((w) => w.users));
	const generated = new Date(r.generatedAt + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

	const teamRows = r.teams
		.map(
			(x) => `<tr class="${x.sessions30 ? '' : 'idle'}">
				<td><b>${esc(x.name)}</b><span class="id">${esc(x.teamId)}${x.installed ? '' : ' · 토큰 없음'}</span></td>
				<td class="num">${x.users7}</td><td class="num">${x.users30}</td>
				<td class="num">${x.activeDays30}</td><td class="num">${x.sessions30}</td>
				<td class="num">${hours(x.focusMs30)}</td>
				<td class="num">${x.focusingNow || ''}</td>
				<td class="num">${x.lastActive ? shortDate(x.lastActive) : '–'}</td>
			</tr>`
		)
		.join('');

	const dayBars = r.daily
		.map(
			(d) => `<div class="bar" title="${d.date} · ${d.users}명 · ${d.sessions}세션 (익스텐션 ${d.extensionSessions}) · ${hours(d.focusMs)}">
				<span style="height:${(d.users / maxDay) * 100}%"></span><em>${Number(d.date.slice(8))}</em></div>`
		)
		.join('');

	const weekRows = r.weekly
		.map(
			(w) => `<tr><td>${shortDate(w.week)} 주</td>
				<td class="num">${w.users}</td>
				<td class="meter"><span style="width:${(w.users / maxWeek) * 100}%"></span></td>
				<td class="num">${w.newUsers}</td><td class="num">${w.retained}</td>
				<td class="num">${w.retention === null ? '–' : `${Math.round(w.retention * 100)}%`}</td></tr>`
		)
		.join('');

	const feature = (label: string, n: number, total = f.sessions, note = '') =>
		`<li><span>${label}${note ? `<small>${note}</small>` : ''}</span><b>${pct(n, total)}</b><i>${n}${total === f.sessions ? ` / ${total}` : ''}</i></li>`;

	return `<!doctype html>
<html lang="ko">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="robots" content="noindex">
	<title>집중요정 사용 현황</title>
	<style>
		:root { color-scheme: light dark; --bg: #f7f6fb; --card: #fff; --fg: #1f1d2b; --muted: #6b6880; --line: #ebe9f2; --accent: #6d4aff; --soft: #e7e1ff; }
		@media (prefers-color-scheme: dark) { :root { --bg: #15141b; --card: #1e1d26; --fg: #ecebf3; --muted: #a19eb5; --line: #2c2a36; --accent: #9b85ff; --soft: #2e2850; } }
		body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Segoe UI', sans-serif; }
		main { max-width: 980px; margin: 0 auto; padding: 28px 16px 48px; }
		h1 { margin: 0; font-size: 22px; } header p { margin: 4px 0 20px; color: var(--muted); }
		h2 { margin: 0 0 12px; font-size: 15px; }
		section { background: var(--card); border-radius: 16px; padding: 18px 20px; margin-bottom: 16px; box-shadow: 0 2px 12px rgb(0 0 0 / 4%); }
		.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
		.tile { background: var(--card); border-radius: 14px; padding: 14px 16px; box-shadow: 0 2px 12px rgb(0 0 0 / 4%); }
		.tile span { color: var(--muted); font-size: 12px; } .tile b { display: block; font-size: 20px; margin-top: 2px; white-space: nowrap; }
		.scroll { overflow-x: auto; }
		table { width: 100%; border-collapse: collapse; white-space: nowrap; }
		th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; }
		th { color: var(--muted); font-weight: 500; font-size: 12px; }
		.num { text-align: right; font-variant-numeric: tabular-nums; }
		.id { display: block; color: var(--muted); font-size: 11px; }
		tr.idle td { color: var(--muted); } tr.idle b { font-weight: 500; }
		.bars { display: flex; align-items: flex-end; gap: 3px; height: 140px; padding-bottom: 18px; }
		.bar { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; position: relative; }
		.bar span { background: var(--accent); border-radius: 4px 4px 0 0; min-height: 2px; }
		.bar em { position: absolute; bottom: -18px; left: 0; right: 0; text-align: center; font-style: normal; font-size: 10px; color: var(--muted); }
		.bar:nth-child(odd) em { visibility: hidden; }
		.meter { width: 40%; } .meter span { display: block; height: 8px; border-radius: 4px; background: var(--accent); min-width: 2px; }
		ul.features { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 4px 24px; }
		ul.features li { display: grid; grid-template-columns: 1fr auto 72px; gap: 8px; align-items: baseline; padding: 8px 0; border-bottom: 1px solid var(--line); }
		ul.features small { display: block; color: var(--muted); font-size: 11px; }
		ul.features i { font-style: normal; color: var(--muted); font-size: 12px; text-align: right; }
		.note { color: var(--muted); font-size: 12px; margin: 10px 0 0; }
	</style>
</head>
<body>
<main>
	<header>
		<h1>🧚 집중요정 사용 현황</h1>
		<p>최근 ${r.days}일 · ${generated} KST 기준 · 합계만 표시해요 (사용자·계획 내용 없음)</p>
	</header>

	<div class="tiles">
		<div class="tile"><span>지금 집중 중</span><b>${t.focusingNow}명</b></div>
		<div class="tile"><span>최근 7일 사용자</span><b>${t.users7}명</b></div>
		<div class="tile"><span>최근 30일 사용자</span><b>${t.users30}명</b></div>
		<div class="tile"><span>활성 워크스페이스</span><b>${t.activeTeams30} / ${t.teams}</b></div>
		<div class="tile"><span>30일 세션</span><b>${t.sessions30}</b></div>
		<div class="tile"><span>30일 집중 시간</span><b>${hours(t.focusMs30)}</b></div>
	</div>

	<section>
		<h2>워크스페이스</h2>
		<div class="scroll"><table>
			<thead><tr><th>워크스페이스</th><th class="num">7일 사용자</th><th class="num">30일 사용자</th><th class="num">활동일</th><th class="num">세션</th><th class="num">집중 시간</th><th class="num">지금</th><th class="num">마지막 기록</th></tr></thead>
			<tbody>${teamRows}</tbody>
		</table></div>
	</section>

	<section>
		<h2>일별 사용자 (최근 ${r.days}일)</h2>
		<div class="bars">${dayBars}</div>
	</section>

	<section>
		<h2>주별 사용자와 유지율</h2>
		<div class="scroll"><table>
			<thead><tr><th>주 (월요일)</th><th class="num">사용자</th><th></th><th class="num">신규</th><th class="num">지난주에도</th><th class="num">유지율</th></tr></thead>
			<tbody>${weekRows}</tbody>
		</table></div>
		<p class="note">신규 = 집계 범위(최근 ${r.weekly.length + 1}주) 안에서 처음 기록한 사용자 · 유지율 = 지난주 사용자 중 이번 주에도 집중한 비율</p>
	</section>

	<section>
		<h2>기능 사용 (최근 ${r.days}일 세션 기준)</h2>
		<ul class="features">
			${feature('익스텐션에서 시작', f.startedFromExtension)}
			${feature('익스텐션에서 종료', f.endedFromExtension)}
			${feature('기록만 (채널 메시지 없음)', f.recordOnly, f.sessions, '익스텐션에서 채널 없이 시작')}
			${feature('카테고리 지정', f.withTag)}
			${feature('계획 작성', f.withPlan)}
			${feature('쉬어가기 사용', f.withPause)}
		</ul>
		<p class="note">월 목표를 설정한 사용자 ${f.usersWithGoal}명 · Slack status 동기화 연결 ${f.usersWithStatusSync}명 · 출처는 이 기능 배포 이후 세션부터 기록돼요 (이전 세션은 Slack으로 집계)</p>
	</section>
</main>
</body>
</html>`;
}
