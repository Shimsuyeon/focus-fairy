/**
 * 팝업 오른쪽 칸 — 월 누적 집중 시간, 목표 진행률, 누적/일별 그래프, 카테고리 비율.
 * 왼쪽 칸(panel.js)에서 워크스페이스를 바꾸거나 세션을 바꾸면 storage 변경으로 따라간다.
 */

import { api, getAccounts, focusedMs, formatDuration } from './api.js';

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const HOUR = 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

let account = null;
let month = null; // 'YYYY-MM', null이면 서버 기준 이번 달
let stats = null;
let session = null;
let tagLabels = {};
let mode = 'cumulative';

// ---------- 불러오기 ----------

function showError(message) {
	$('stats-error').textContent = message;
	$('stats-error').hidden = !message;
}

async function load() {
	account = (await getAccounts()).active;
	$('no-account').hidden = !!account;
	$('content').hidden = !account || !stats;
	if (!account) return;

	const loading = account.id;
	try {
		const [data, summary] = await Promise.all([api(`/api/stats${month ? `?month=${month}` : ''}`), api('/api/session')]);
		if (account?.id !== loading) return;
		stats = data;
		month = data.month;
		session = summary.session;
		tagLabels = Object.fromEntries((summary.tags || []).map((t) => [t.value, t.label]));
		showError('');
		render();
	} catch (err) {
		showError(err.message || '통계를 불러오지 못했어요.');
	}
}

function shiftMonth(delta) {
	const [y, m] = month.split('-').map(Number);
	const d = new Date(Date.UTC(y, m - 1 + delta, 1));
	month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
	load();
}

$('prev-month').addEventListener('click', () => shiftMonth(-1));
$('next-month').addEventListener('click', () => shiftMonth(1));

// ---------- 계산 ----------

/** 그리기에 필요한 값 — 이번 달이면 진행 중인 세션을 오늘에 더한다 */
function compute() {
	const dim = stats.days.length;
	const currentMonth = stats.today.slice(0, 7);
	const isCurrent = stats.month === currentMonth;
	const isPast = stats.month < currentMonth;
	const todayIdx = isCurrent ? Number(stats.today.slice(8)) - 1 : -1;
	const lastIdx = isCurrent ? todayIdx : isPast ? dim - 1 : -1;
	const live = isCurrent ? focusedMs(session) : 0;

	const daily = stats.days.map((d, i) => d.ms + (i === todayIdx ? live : 0));
	const cumulative = [];
	daily.reduce((sum, ms, i) => (cumulative[i] = sum + ms), 0);

	const total = lastIdx >= 0 ? cumulative[lastIdx] : 0;
	const elapsedDays = lastIdx + 1;
	const activeDays = daily.filter((ms) => ms > 0).length;

	let streak = 0;
	// 오늘 아직 안 했어도 어제까지의 연속은 유지
	for (let i = lastIdx; i >= 0; i--) {
		if (daily[i] > 0) streak++;
		else if (i !== todayIdx) break;
	}

	return { dim, isCurrent, isPast, todayIdx, lastIdx, live, daily, cumulative, total, elapsedDays, activeDays, streak, goal: stats.goalMs };
}

function dateLabel(index) {
	const [y, m] = stats.month.split('-').map(Number);
	const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, index + 1)).getUTCDay()];
	return `${m}월 ${index + 1}일 (${weekday})`;
}

function signed(ms) {
	const span = document.createElement('span');
	span.className = ms >= 0 ? 'up' : 'down';
	span.textContent = `${ms >= 0 ? '+' : '−'}${formatDuration(Math.abs(ms))}`;
	return span;
}

// ---------- 그리기 ----------

function render() {
	const c = compute();
	const [y, m] = stats.month.split('-').map(Number);
	$('month-label').textContent = `${y}년 ${m}월`;
	$('next-month').disabled = c.isCurrent || !c.isPast;
	$('content').hidden = false;

	renderSummary(c);
	renderTiles(c);
	renderChart(c);
	renderTags(c);
}

function renderSummary(c) {
	$('month-total').textContent = c.total > 0 ? formatDuration(c.total) : '0분';
	$('goal-text').textContent = c.goal ? `목표 ${formatDuration(c.goal)}` : '';
	$('edit-goal').textContent = c.goal ? '수정' : '목표 설정';

	const progress = $('progress');
	if (!c.goal) {
		progress.hidden = true;
		$('progress-left').textContent = '월 목표를 정하면 진행률과 하루에 필요한 시간을 보여줘요.';
		$('progress-right').replaceChildren();
		return;
	}

	progress.hidden = false;
	const ratio = c.total / c.goal;
	$('progress-fill').style.width = `${Math.min(ratio, 1) * 100}%`;

	const paceRatio = c.isCurrent ? c.elapsedDays / c.dim : c.isPast ? 1 : 0;
	$('progress-pace').style.left = `calc(${paceRatio * 100}% - 1px)`;
	$('progress-pace').hidden = !c.isCurrent;

	const left = $('progress-left');
	if (c.isCurrent) {
		left.replaceChildren('오늘까지 목표 페이스 대비 ', signed(c.total - (c.goal * c.elapsedDays) / c.dim));
	} else {
		left.textContent = c.isPast ? (ratio >= 1 ? '목표 달성! 🎉' : `${formatDuration(c.goal - c.total)} 부족했어요`) : '';
	}
	const pct = document.createElement('b');
	pct.textContent = `${Math.floor(ratio * 100)}%`;
	$('progress-right').replaceChildren(pct, ' 달성');
}

function renderTiles(c) {
	// 오늘 (지난 달이면 최고의 날)
	if (c.isCurrent) {
		$('tile-today').parentElement.querySelector('.label').textContent = '오늘';
		$('tile-today').textContent = formatDuration(c.daily[c.todayIdx]);
		const count = stats.days[c.todayIdx].count;
		$('tile-today-sub').textContent =
			[count ? `${count}회 기록` : '', c.live ? '지금 집중 중 🟢' : ''].filter(Boolean).join(' · ') || '아직 기록이 없어요';
	} else {
		const best = c.daily.reduce((bi, ms, i, arr) => (ms > arr[bi] ? i : bi), 0);
		$('tile-today').parentElement.querySelector('.label').textContent = '최고의 날';
		$('tile-today').textContent = c.daily[best] > 0 ? formatDuration(c.daily[best]) : '—';
		$('tile-today-sub').textContent = c.daily[best] > 0 ? dateLabel(best) : '';
	}

	// 일 평균
	$('tile-avg').textContent = c.elapsedDays > 0 ? formatDuration(c.total / c.elapsedDays) : '—';
	$('tile-avg-sub').textContent = c.activeDays > 0 ? `집중한 날만 ${formatDuration(c.total / c.activeDays)}` : '';

	// 목표까지 하루
	const detail = $('need-detail');
	detail.replaceChildren();
	const sub = $('tile-need-sub');
	if (!c.goal) {
		$('tile-need').textContent = '—';
		sub.textContent = '목표를 설정해보세요';
	} else if (!c.isCurrent) {
		$('tile-need').textContent = c.total >= c.goal ? '달성 🎉' : '미달성';
		sub.textContent = `목표 ${formatDuration(c.goal)}`;
	} else {
		const remaining = c.goal - c.total;
		const remainingDays = c.dim - c.todayIdx; // 오늘 포함
		const yesterdayCum = c.todayIdx > 0 ? c.cumulative[c.todayIdx - 1] : 0;
		const paceToYesterday = yesterdayCum - (c.goal * c.todayIdx) / c.dim;

		$('tile-need').textContent = remaining <= 0 ? '달성 🎉' : formatDuration(remaining / remainingDays);
		sub.textContent = remaining <= 0 ? `${formatDuration(-remaining)} 초과` : `남은 ${remainingDays}일 (오늘 포함)`;

		const rows = [
			['남은 날', `${remainingDays}일`],
			['채울 시간', remaining > 0 ? formatDuration(remaining) : '없음'],
			['목표 일 평균', formatDuration(c.goal / c.dim)],
			['어제까지 페이스', signed(paceToYesterday)],
		];
		for (const [term, value] of rows) {
			const dt = document.createElement('dt');
			dt.textContent = term;
			const dd = document.createElement('dd');
			dd.append(value);
			detail.append(dt, dd);
		}
	}

	// 집중한 날
	$('tile-days').textContent = `${c.activeDays}일`;
	$('tile-days-sub').textContent = c.elapsedDays > 0 ? `${c.elapsedDays}일 중${c.streak > 1 ? ` · 🔥 ${c.streak}일 연속` : ''}` : '';
}

// ---------- 차트 ----------

function svg(tag, attrs = {}) {
	const el = document.createElementNS(SVG_NS, tag);
	for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
	return el;
}

/** 0부터 maxHours까지 눈금 4~5개 */
function niceScale(maxHours) {
	const raw = Math.max(maxHours, 1) / 4;
	const magnitude = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 2, 2.5, 5, 10].map((n) => n * magnitude).find((s) => s >= raw);
	return { step, max: Math.ceil(Math.max(maxHours, 1) / step) * step };
}

function renderChart(c) {
	const box = $('chart');
	const width = box.clientWidth || 600;
	const height = box.clientHeight || 300;
	const pad = { top: 12, right: 12, bottom: 26, left: 40 };
	const plotW = width - pad.left - pad.right;
	const plotH = height - pad.top - pad.bottom;

	const cumulative = mode === 'cumulative';
	$('chart-title').textContent = cumulative ? '누적 집중 시간' : '일별 집중 시간';
	$('legend-goal').hidden = !c.goal;
	$('legend-goal-text').textContent = cumulative ? '목표 페이스' : '목표 일 평균';

	const values = cumulative ? c.cumulative : c.daily;
	const shown = values.slice(0, c.lastIdx + 1);
	const goalTop = c.goal ? (cumulative ? c.goal : c.goal / c.dim) : 0;
	const { step, max } = niceScale(Math.max(...shown.map((v) => v / HOUR), goalTop / HOUR, 0));

	const band = plotW / c.dim;
	const x = (i) => pad.left + band * (i + 0.5);
	const yOf = (ms) => pad.top + plotH - (ms / HOUR / max) * plotH;

	const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': $('chart-title').textContent });

	// 가로 눈금
	for (let v = 0; v <= max + 1e-9; v += step) {
		const yy = yOf(v * HOUR);
		root.append(svg('line', { class: 'grid-line', x1: pad.left, x2: width - pad.right, y1: yy, y2: yy }));
		const label = svg('text', { class: 'axis-text', x: pad.left - 8, y: yy + 4, 'text-anchor': 'end' });
		label.textContent = `${Number.isInteger(v) ? v : v.toFixed(1)}h`;
		root.append(label);
	}

	// 날짜 (좁으면 건너뛰기)
	const every = band >= 20 ? 1 : band >= 10 ? 2 : 5;
	const [y, m] = stats.month.split('-').map(Number);
	for (let i = 0; i < c.dim; i++) {
		if (i % every !== 0 && i !== c.todayIdx) continue;
		const weekday = new Date(Date.UTC(y, m - 1, i + 1)).getUTCDay();
		const cls = i === c.todayIdx ? 'axis-text today' : weekday === 0 || weekday === 6 ? 'axis-text weekend' : 'axis-text';
		const label = svg('text', { class: cls, x: x(i), y: height - 8, 'text-anchor': 'middle' });
		label.textContent = String(i + 1);
		root.append(label);
	}

	if (c.todayIdx >= 0) {
		root.append(svg('line', { class: 'today-line', x1: x(c.todayIdx), x2: x(c.todayIdx), y1: pad.top, y2: pad.top + plotH }));
	}

	// 목표
	if (c.goal) {
		if (cumulative) {
			root.append(svg('line', { class: 'line-goal', x1: x(0), y1: yOf(c.goal / c.dim), x2: x(c.dim - 1), y2: yOf(c.goal) }));
		} else {
			const yy = yOf(c.goal / c.dim);
			root.append(svg('line', { class: 'line-goal', x1: pad.left, x2: width - pad.right, y1: yy, y2: yy }));
		}
	}

	// 실제
	const bars = [];
	if (cumulative && shown.length > 0) {
		const points = shown.map((v, i) => `${x(i)},${yOf(v)}`);
		const base = yOf(0);
		root.append(svg('path', { class: 'area-actual', d: `M${x(0)},${base} L${points.join(' L')} L${x(shown.length - 1)},${base} Z` }));
		root.append(svg('polyline', { class: 'line-actual', points: points.join(' ') }));
	} else if (!cumulative) {
		const barW = Math.max(2, Math.min(band * 0.62, 22));
		shown.forEach((v, i) => {
			const top = yOf(v);
			const bar = svg('rect', {
				class: i === c.todayIdx ? 'bar today' : 'bar',
				x: x(i) - barW / 2,
				y: top,
				width: barW,
				height: Math.max(0, yOf(0) - top),
				rx: Math.min(4, barW / 2),
			});
			bars[i] = bar;
			root.append(bar);
		});
	}

	// 마우스 오버
	const hoverLine = svg('line', { class: 'hover-line', y1: pad.top, y2: pad.top + plotH, visibility: 'hidden' });
	const hoverDot = svg('circle', { class: 'hover-dot', r: 4.5, visibility: 'hidden' });
	const overlay = svg('rect', { x: pad.left, y: pad.top, width: plotW, height: plotH, fill: 'transparent' });
	root.append(hoverLine, hoverDot, overlay);

	const tip = $('chart-tip');
	let hovered = -1;
	overlay.addEventListener('mousemove', (e) => {
		const rect = root.getBoundingClientRect();
		const mx = ((e.clientX - rect.left) / rect.width) * width;
		const i = Math.max(0, Math.min(c.dim - 1, Math.floor((mx - pad.left) / band)));
		if (i === hovered) return;
		bars[hovered]?.classList.remove('hover');
		hovered = i;

		hoverLine.setAttribute('x1', x(i));
		hoverLine.setAttribute('x2', x(i));
		hoverLine.setAttribute('visibility', 'visible');
		if (cumulative && i <= c.lastIdx) {
			hoverDot.setAttribute('cx', x(i));
			hoverDot.setAttribute('cy', yOf(c.cumulative[i]));
			hoverDot.setAttribute('visibility', 'visible');
		} else {
			hoverDot.setAttribute('visibility', 'hidden');
		}
		bars[i]?.classList.add('hover');

		const lines = [];
		if (i <= c.lastIdx) {
			lines.push(`그날 ${formatDuration(c.daily[i])}`, `누적 ${formatDuration(c.cumulative[i])}`);
		} else {
			lines.push('아직이에요');
		}
		if (c.goal) lines.push(`목표 페이스 ${formatDuration((c.goal * (i + 1)) / c.dim)}`);
		const title = document.createElement('b');
		title.textContent = dateLabel(i) + (i === c.todayIdx ? ' · 오늘' : '');
		tip.replaceChildren(title, ...lines.flatMap((l, n) => (n ? [document.createElement('br'), l] : [l])));
		tip.hidden = false;

		const card = box.parentElement.getBoundingClientRect();
		const left = rect.left - card.left + (x(i) / width) * rect.width;
		tip.style.left = `${Math.min(left + 12, card.width - tip.offsetWidth - 8)}px`;
		tip.style.top = `${rect.top - card.top + 8}px`;
	});
	overlay.addEventListener('mouseleave', () => {
		bars[hovered]?.classList.remove('hover');
		hovered = -1;
		hoverLine.setAttribute('visibility', 'hidden');
		hoverDot.setAttribute('visibility', 'hidden');
		tip.hidden = true;
	});

	box.replaceChildren(root);
}

document.querySelector('.segmented').addEventListener('click', (e) => {
	const button = e.target.closest('button[data-mode]');
	if (!button || !stats) return;
	mode = button.dataset.mode;
	for (const b of document.querySelectorAll('.segmented button')) b.setAttribute('aria-selected', String(b === button));
	renderChart(compute());
});

new ResizeObserver(() => stats && renderChart(compute())).observe($('chart'));

// ---------- 카테고리 ----------

function renderTags() {
	const entries = Object.entries(stats.byTag).sort((a, b) => b[1] - a[1]);
	const top = entries[0]?.[1] || 1;
	$('tag-empty').hidden = entries.length > 0;
	$('tag-list').replaceChildren(
		...entries.map(([tag, ms]) => {
			const li = document.createElement('li');
			li.className = 'tag-row';
			const name = document.createElement('span');
			name.textContent = tag === 'none' ? '카테고리 없음' : tagLabels[tag] || tag;
			const track = document.createElement('div');
			track.className = 'bar-track';
			const fill = document.createElement('div');
			fill.className = 'bar-fill';
			fill.style.width = `${(ms / top) * 100}%`;
			track.append(fill);
			const amount = document.createElement('span');
			amount.className = 'amount';
			amount.textContent = `${formatDuration(ms)} · ${Math.round((ms / stats.totalMs) * 100)}%`;
			li.append(name, track, amount);
			return li;
		})
	);
}

// ---------- 목표 ----------

$('edit-goal').addEventListener('click', () => {
	$('goal-hours').value = stats?.goalMs ? Math.round(stats.goalMs / HOUR) : '';
	$('goal-form').hidden = false;
	$('edit-goal').hidden = true;
	$('goal-text').hidden = true;
	$('goal-hours').focus();
});

function closeGoalForm() {
	$('goal-form').hidden = true;
	$('edit-goal').hidden = false;
	$('goal-text').hidden = false;
}

$('cancel-goal').addEventListener('click', closeGoalForm);

$('goal-form').addEventListener('submit', async (e) => {
	e.preventDefault();
	const hours = Number($('goal-hours').value || 0);
	try {
		const data = await api('/api/goal', { method: 'POST', body: { hours } });
		stats.goalMs = data.goalMs;
		closeGoalForm();
		showError('');
		render();
	} catch (err) {
		showError(err.message);
	}
});

// ---------- 동기화 ----------

chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== 'local') return;
	if (changes.activeAccountId || changes.accounts) {
		const nextId = changes.activeAccountId?.newValue;
		if (nextId !== undefined && nextId !== account?.id) {
			month = null;
			stats = null;
		}
		load();
		return;
	}
	const next = changes.sessions?.newValue?.[account?.id];
	if (next && stats) {
		const ended = session?.state !== 'idle' && next.state === 'idle';
		session = next;
		if (ended) load(); // 방금 끝난 세션이 기록에 들어갔다
		else render();
	}
});

// 진행 중 세션 시간이 오늘 값에 반영되도록
setInterval(() => {
	if (stats && session?.state === 'focusing') render();
}, 30 * 1000);

load();
