/**
 * 📌 띄우기 — Document Picture-in-Picture 로 다른 앱 창보다 항상 위에 뜨는 미니 창 (데스크톱 Chrome · Edge)
 * 내 타이머 · 시작/쉬어가기/종료 + 지금 집중 중인 팀원.
 * 본 창(panel.js)과는 chrome.storage 의 세션 캐시(shim.js)로 맞춘다.
 */

import { api, getAccounts, getChannelChoice, setAccountState, toStartChannelId, focusedMs, formatClock, formatDuration, TAG_ICONS } from './api.js';

const REFRESH_MS = 30 * 1000;
const NEW_MS = 4000; // 새로 집중을 시작한 팀원 반짝임

const STATE_LABEL = { idle: '쉬는 중', focusing: '집중 중', paused: '쉬어가는 중' };

let win = null; // PiP 창
let account = null;
let session = null;
let members = [];
let focusingIds = null; // 직전 갱신 때 집중 중이던 팀원 (처음엔 반짝이지 않게 null)
const sparkleUntil = new Map();
let confirm = null; // 종료 확인(needsConfirm) 응답
let message = '';
let timers = [];

export function setupPip() {
	if (!('documentPictureInPicture' in window)) return;

	const button = document.createElement('button');
	button.id = 'open-pip';
	button.className = 'icon-btn';
	button.title = '다른 창 위에 작게 띄우기';
	button.textContent = '📌';
	button.addEventListener('click', () => (win ? win.focus() : open()));
	document.querySelector('.topbar').append(button);

	chrome.storage.onChanged.addListener((changes) => {
		if (!win) return;
		if (changes.activeAccountId || changes.accounts) {
			load();
			return;
		}
		const next = changes.sessions?.newValue?.[account?.id];
		if (next && JSON.stringify(next) !== JSON.stringify(session)) {
			session = next;
			render();
		}
	});
}

async function open() {
	try {
		win = await window.documentPictureInPicture.requestWindow({ width: 300, height: 360 });
	} catch (err) {
		console.error('PiP failed:', err);
		return;
	}
	const css = win.document.createElement('link');
	css.rel = 'stylesheet';
	css.href = new URL('pip.css', import.meta.url).href; // PiP 문서는 about:blank 라 절대 주소로
	win.document.head.append(css);
	win.document.title = '집중요정';
	win.document.body.innerHTML = '<main class="mini"></main>';
	win.document.body.addEventListener('click', onClick);
	win.addEventListener('pagehide', close);

	timers = [setInterval(tick, 1000), setInterval(refresh, REFRESH_MS)];
	win.document.addEventListener('visibilitychange', () => win?.document.visibilityState === 'visible' && refresh());
	await load();
}

function close() {
	timers.forEach(clearInterval);
	timers = [];
	win = null;
	focusingIds = null;
	confirm = null;
}

async function load() {
	account = (await getAccounts()).active;
	const { sessions = {} } = await chrome.storage.local.get('sessions');
	session = account ? sessions[account.id] || null : null;
	members = [];
	focusingIds = null;
	confirm = null;
	render();
	await refresh();
}

async function refresh() {
	if (!win || !account) return;
	const loading = account.id;
	try {
		const [data, team] = await Promise.all([api('/api/session'), api('/api/team').catch(() => null)]);
		if (account?.id !== loading) return;
		if (team) updateMembers(team.members);
		await setSession(data.session);
	} catch (err) {
		message = err.message || '문제가 생겼어요.';
		render();
	}
}

function updateMembers(next) {
	const now = Date.now();
	const focusing = new Set(next.filter((m) => m.state === 'focusing' && !m.isMe).map((m) => m.id));
	if (focusingIds) for (const id of focusing) if (!focusingIds.has(id)) sparkleUntil.set(id, now + NEW_MS);
	focusingIds = focusing;
	members = next;
	setTimeout(render, NEW_MS);
}

async function setSession(next) {
	session = next;
	await setAccountState(account.id, { session: next, authError: false }); // 본 창도 따라온다
	render();
}

async function act(task) {
	message = '';
	try {
		await task();
	} catch (err) {
		message = err.message || '문제가 생겼어요.';
	}
	render();
}

const ACTIONS = {
	start: async () => {
		const choice = await getChannelChoice(account.id);
		const data = await api('/api/session/start', { method: 'POST', body: { channelId: toStartChannelId(choice) } });
		await setSession(data.session);
	},
	pause: async () => setSession((await api('/api/session/pause', { method: 'POST', body: {} })).session),
	resume: async () => setSession((await api('/api/session/resume', { method: 'POST', body: {} })).session),
	end: () => finishEnd({}),
	'end-confirm': () => finishEnd({ confirm: true }),
	'end-cancel': async () => {
		confirm = null;
	},
	main: async () => window.focus(),
};

async function finishEnd(body) {
	const data = await api('/api/session/end', { method: 'POST', body });
	if (data.needsConfirm) {
		confirm = data;
		return;
	}
	confirm = null;
	message = `🎉 ${data.durationLabel} 기록 완료!`;
	setTimeout(() => {
		message = '';
		render();
	}, 5000);
	await setSession(data.session);
	await refresh();
}

function onClick(e) {
	const button = e.target.closest('button[data-action]');
	if (!button || button.disabled) return;
	button.disabled = true;
	act(ACTIONS[button.dataset.action]);
}

// ---------- 그리기 ----------

function el(tag, props = {}, ...children) {
	const node = win.document.createElement(tag);
	for (const [key, value] of Object.entries(props)) {
		if (key === 'dataset') Object.assign(node.dataset, value);
		else if (key === 'style') node.style.cssText = value;
		else node[key] = value;
	}
	node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
	return node;
}

function avatarColor(id) {
	let hash = 0;
	for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
	return `hsl(${hash % 360} 55% 52%)`;
}

function render() {
	if (!win) return;
	const root = win.document.querySelector('.mini');

	if (!account) {
		root.replaceChildren(
			el('p', { className: 'empty' }, '연결된 워크스페이스가 없어요.'),
			el('button', { className: 'link', dataset: { action: 'main' } }, '본 창에서 연결하기')
		);
		return;
	}

	const state = session?.state || 'idle';
	const team = members.filter((m) => !m.isMe && m.state !== 'idle');
	const focusingCount = team.filter((m) => m.state === 'focusing').length + (state === 'focusing' ? 1 : 0);

	const children = [
		el(
			'header',
			{},
			el('span', { className: 'workspace' }, account.teamName || '집중요정'),
			el('span', { className: 'count' }, focusingCount ? `${focusingCount}명 집중 중` : '')
		),
		el(
			'section',
			{ className: 'me', dataset: { state } },
			el('p', { className: 'state' }, el('i', { className: 'dot' }), STATE_LABEL[state], session?.tag && state !== 'idle' ? ` ${TAG_ICONS[session.tag] || ''}` : ''),
			el('p', { className: 'clock' }, state === 'idle' ? '—' : formatClock(focusedMs(session))),
			session?.label && state !== 'idle' ? el('p', { className: 'plan', title: session.label }, session.label) : null
		),
		confirm ? renderConfirm() : renderButtons(state),
		message ? el('p', { className: 'message' }, message) : null,
		el(
			'ul',
			{ className: 'team' },
			...(team.length
				? team.map((m) =>
						el(
							'li',
							{ dataset: { state: m.state }, className: (sparkleUntil.get(m.id) || 0) > Date.now() ? 'new' : '' },
							el('span', { className: 'avatar', style: `background:${avatarColor(m.id)}` }, [...m.name][0] || '?'),
							el('span', { className: 'name' }, m.name + (m.tag && TAG_ICONS[m.tag] ? ` ${TAG_ICONS[m.tag]}` : '')),
							el('span', { className: 'time', dataset: { member: m.id } }, memberTime(m))
						)
					)
				: [el('li', { className: 'alone' }, '지금은 집중 중인 팀원이 없어요')])
		),
	];
	root.replaceChildren(...children.filter(Boolean));
}

function renderButtons(state) {
	const button = (action, label, primary) => el('button', { className: primary ? 'primary' : '', dataset: { action } }, label);
	if (state === 'idle') return el('div', { className: 'actions' }, button('start', '▶ 집중 시작', true));
	return el(
		'div',
		{ className: 'actions' },
		state === 'focusing' ? button('pause', '⏸ 쉬어가기') : button('resume', '▶ 다시 집중', true),
		button('end', '■ 종료')
	);
}

function renderConfirm() {
	return el(
		'div',
		{ className: 'confirm' },
		el('p', {}, `⏰ ${confirm.durationLabel} 기록할까요?`),
		el(
			'div',
			{ className: 'actions' },
			el('button', { className: 'primary', dataset: { action: 'end-confirm' } }, '✅ 기록'),
			el('button', { dataset: { action: 'end-cancel' } }, '취소')
		),
		el('button', { className: 'link', dataset: { action: 'main' } }, '시간을 직접 입력하려면 본 창에서')
	);
}

function memberTime(m) {
	const ms = focusedMs(m);
	return ms >= 60 * 1000 ? formatDuration(ms) : '방금 시작';
}

/** 1초마다 내 시계와 팀원 경과 시간만 고친다 */
function tick() {
	if (!win) return;
	const clock = win.document.querySelector('.clock');
	if (clock && session && session.state !== 'idle') clock.textContent = formatClock(focusedMs(session));
	for (const node of win.document.querySelectorAll('.time[data-member]')) {
		const m = members.find((x) => x.id === node.dataset.member);
		if (m) node.textContent = memberTime(m);
	}
}
