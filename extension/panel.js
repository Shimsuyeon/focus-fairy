/**
 * 팝업 왼쪽 칸 — 세션 컨트롤 + 오늘 함께 집중한 팀원.
 * 오른쪽 통계 칸(stats.js)과는 chrome.storage(활성 계정, 세션 캐시)로 맞춰진다.
 */

import {
	api,
	ApiError,
	DEFAULT_SERVER,
	NO_CHANNEL,
	TAG_ICONS,
	getAccounts,
	setActiveAccount,
	saveAccount,
	removeAccount,
	normalizeServerUrl,
	setAccountState,
	getChannelChoice,
	setChannelChoice,
	toStartChannelId,
	focusedMs,
	formatDuration,
} from './api.js';

const $ = (id) => document.getElementById(id);

const STATE_LABEL = {
	idle: '쉬는 중',
	focusing: '집중 중',
	paused: '쉬어가는 중',
};

const ADD_WORKSPACE = '__add__';
const REFRESH_MS = 60 * 1000;

let account = null; // 활성 계정
let session = null;
let today = null; // { totalMs, sessionCount }
let tags = [];
let selectedTag = ''; // 쉬는 중에 고른 시작 카테고리
let members = [];
let flash = ''; // 종료 직후 잠깐 보여줄 문구
let clockTimer = null;
let setupMode = 'add'; // 'add' | 'edit'

// ---------- 공통 ----------

function showError(message) {
	$('error').textContent = message;
	$('error').hidden = !message;
}

async function run(button, task) {
	showError('');
	if (button) button.disabled = true;
	try {
		await task();
	} catch (err) {
		if (err instanceof ApiError && err.status === 401 && account) {
			await setAccountState(account.id, { authError: true });
			await showSetup('edit');
		}
		showError(err.message || '문제가 생겼어요.');
	} finally {
		if (button) button.disabled = false;
	}
}

async function setSession(next) {
	session = next;
	await setAccountState(account.id, { session: next, authError: false });
	renderSession();
	renderTeam();
	await renderWorkspaces();
}

function timeOfDay(ts) {
	return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ---------- 워크스페이스 ----------

function workspaceLabel(a, all) {
	const name = a.teamName || '연결 확인 중…';
	// 같은 워크스페이스를 여러 사용자로 연결한 경우에만 사용자 이름을 붙인다
	const ambiguous = all.filter((b) => b.teamName && b.teamName === a.teamName).length > 1;
	return ambiguous && a.userName ? `${name} (${a.userName})` : name;
}

/** 헤더 드롭다운 — 다른 워크스페이스가 집중 중이면 아이콘으로 표시 */
async function renderWorkspaces() {
	const { accounts } = await getAccounts();
	const { sessions = {} } = await chrome.storage.local.get('sessions');
	const select = $('workspace');

	select.replaceChildren();
	for (const a of accounts) {
		const state = sessions[a.id]?.state;
		const icon = state === 'focusing' ? '🟢 ' : state === 'paused' ? '🟠 ' : '';
		select.append(new Option(icon + workspaceLabel(a, accounts), a.id));
	}
	select.append(new Option('＋ 워크스페이스 추가', ADD_WORKSPACE));
	select.value = account?.id || ADD_WORKSPACE;

	select.hidden = accounts.length === 0;
	$('app-title').hidden = accounts.length > 0;
}

$('workspace').addEventListener('change', async () => {
	const value = $('workspace').value;
	if (value === ADD_WORKSPACE) {
		await showSetup('add');
		return;
	}
	await setActiveAccount(value);
	await loadSession();
});

// ---------- 설정 (추가 / 수정) ----------

async function showSetup(mode) {
	setupMode = mode;
	const { accounts } = await getAccounts();
	const editing = mode === 'edit' && account;

	$('setup-title').textContent = editing ? `${account.teamName || '워크스페이스'} 설정` : '워크스페이스 연결';
	$('server-url').value = editing ? account.serverUrl : accounts.at(-1)?.serverUrl || DEFAULT_SERVER;
	$('token').value = '';
	$('token').placeholder = editing ? '새 토큰 붙여넣기 (비우면 유지)' : 'ff_...';
	$('save-config').textContent = editing ? '저장' : '연결하기';
	$('cancel-setup').hidden = accounts.length === 0;
	$('disconnect').hidden = !editing;
	$('open-settings').hidden = true;
	$('view-session').hidden = true;
	document.body.classList.toggle('setup-only', accounts.length === 0);
	$('view-setup').hidden = false;
	clearInterval(clockTimer);
	await renderWorkspaces();
	if (mode === 'add') $('workspace').value = ADD_WORKSPACE;
	$('token').focus();
}

$('open-settings').addEventListener('click', () => showSetup('edit'));
$('cancel-setup').addEventListener('click', () => loadSession());

/** 토큰을 서버에 확인하고 워크스페이스 정보를 채워 저장 */
$('save-config').addEventListener('click', (e) =>
	run(e.currentTarget, async () => {
		const editing = setupMode === 'edit' && account;
		const token = $('token').value.trim() || (editing ? account.token : '');
		if (!token) throw new Error('토큰을 입력해주세요.');

		const candidate = {
			...(editing ? account : { id: crypto.randomUUID() }),
			serverUrl: normalizeServerUrl($('server-url').value),
			token,
		};

		let data;
		try {
			data = await api('/api/session', { account: candidate });
		} catch (err) {
			// 저장 전 확인 실패 — 기존 계정의 인증 오류로 처리하지 않는다
			throw new Error(err.status === 401 ? '토큰이 유효하지 않아요. 다시 확인해주세요.' : err.message);
		}

		await saveAccount({
			...candidate,
			teamId: data.workspace?.id,
			teamName: data.workspace?.name,
			userId: data.user?.id,
			userName: data.user?.name,
		});
		await setAccountState(candidate.id, { session: data.session, authError: false });
		await setActiveAccount(candidate.id);
		await loadSession();
	})
);

$('disconnect').addEventListener('click', async () => {
	await removeAccount(account.id);
	account = null;
	session = null;
	const { active } = await getAccounts();
	if (active) await loadSession();
	else await showSetup('add');
});

// ---------- 불러오기 ----------

/** 워크스페이스를 (다시) 열 때 — 캐시로 먼저 그리고 서버로 갱신 */
async function loadSession() {
	showError('');
	account = (await getAccounts()).active;
	if (!account) {
		await showSetup('add');
		return;
	}

	document.body.classList.remove('setup-only');
	$('view-setup').hidden = true;
	$('view-session').hidden = false;
	$('open-settings').hidden = false;
	$('end-confirm').hidden = true;
	$('edit-form').hidden = true;

	const { sessions = {} } = await chrome.storage.local.get('sessions');
	session = sessions[account.id] || null;
	today = null;
	members = [];
	selectedTag = '';
	renderSession();
	renderTeam();
	await renderWorkspaces();
	await refresh();
}

/** 세션 + 팀원 현황 갱신 */
async function refresh() {
	if (!account) return;
	const loading = account.id;
	await run(null, async () => {
		const [data, team] = await Promise.all([api('/api/session'), api('/api/team').catch(() => null)]);
		if (account?.id !== loading) return; // 응답 오기 전에 워크스페이스를 바꾼 경우

		// 워크스페이스/사용자 이름이 바뀌었으면 갱신
		if (data.workspace && (data.workspace.name !== account.teamName || data.user?.name !== account.userName)) {
			account = { ...account, teamId: data.workspace.id, teamName: data.workspace.name, userId: data.user?.id, userName: data.user?.name };
			await saveAccount(account);
		}

		tags = data.tags || [];
		today = data.today;
		if (team) members = team.members;
		await fillChannels(data.channels || [], data.defaultChannelId);
		await setSession(data.session);
	});
}

/** 저장된 선택이 목록에 있으면 유지, 아니면 서버 기본값(마지막 /start 채널) */
async function fillChannels(channels, defaultChannelId) {
	const select = $('channel');
	select.replaceChildren(select.options[0]);
	for (const channel of channels) {
		select.append(new Option(channel.name, channel.id));
	}

	const choice = await getChannelChoice(account.id);
	const valid = choice === NO_CHANNEL || channels.some((c) => c.id === choice);
	select.value = valid ? choice : defaultChannelId || NO_CHANNEL;
	$('channel-hint').hidden = channels.length > 0;
}

$('channel').addEventListener('change', () => setChannelChoice(account.id, $('channel').value));

// ---------- 그리기 ----------

function renderSession() {
	const state = session?.state || 'idle';
	const active = state !== 'idle';
	const confirming = !$('end-confirm').hidden;

	$('state-label').dataset.state = state;
	$('state-label').lastElementChild.textContent = flash || STATE_LABEL[state];
	$('clock').dataset.state = state;

	$('session-plan').textContent = session?.label || '';
	$('session-plan').hidden = !active || !session?.label || !$('edit-form').hidden;
	$('btn-edit').hidden = !active || !$('edit-form').hidden;

	$('idle-form').hidden = active;
	if (!active) {
		$('edit-form').hidden = true;
		$('end-confirm').hidden = true;
	}

	$('main-actions').hidden = confirming && active;
	$('btn-start').hidden = active;
	$('btn-pause').hidden = state !== 'focusing';
	$('btn-resume').hidden = state !== 'paused';
	$('btn-end').hidden = !active;

	renderTags();
	tick();
	clearInterval(clockTimer);
	if (state === 'focusing') clockTimer = setInterval(tick, 1000);
}

/** 큰 시계: 집중 중이면 이번 세션, 쉬는 중이면 오늘 누적 */
function tick() {
	const state = session?.state || 'idle';
	const elapsed = focusedMs(session);
	const shown = state === 'idle' ? today?.totalMs || 0 : elapsed;

	const totalSec = Math.floor(shown / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	const clock = $('clock');
	clock.replaceChildren(h > 0 ? `${h}시간 ${m}분` : `${m}분`);
	if (state !== 'idle') {
		const small = document.createElement('small');
		small.textContent = `${s}초`;
		clock.append(small);
	}

	const meta = [];
	if (state === 'idle') {
		meta.push(today?.sessionCount ? `오늘 누적 · ${today.sessionCount}회 기록` : '오늘은 아직 기록이 없어요');
	} else {
		if (session.startTime) meta.push(`${timeOfDay(session.startTime)} 시작`);
		const pause = (session.totalPauseDuration || 0) + (session.pausedAt ? Date.now() - session.pausedAt : 0);
		if (pause >= 60 * 1000) meta.push(`쉰 시간 ${formatDuration(pause)}`);
		if (today) meta.push(`오늘 총 ${formatDuration(today.totalMs + elapsed)}`);
	}
	$('session-meta').textContent = meta.join(' · ');
}

function renderTags() {
	const active = session && session.state !== 'idle';
	const current = active ? session.tag || '' : selectedTag;
	const box = $('tags');
	box.replaceChildren(
		...tags.map((tag) => {
			const button = document.createElement('button');
			button.className = 'tag-btn';
			button.role = 'radio';
			button.dataset.tag = tag.value;
			button.setAttribute('aria-checked', String(current === tag.value));
			button.title = active ? `카테고리를 ${tag.label}(으)로 바꾸기` : `${tag.label}(으)로 시작`;
			const emoji = document.createElement('span');
			emoji.className = 'emoji';
			emoji.textContent = TAG_ICONS[tag.value] || '•';
			button.append(emoji, tag.label);
			return button;
		})
	);
}

/** 쉬는 중엔 시작할 카테고리 선택, 집중 중엔 바로 바꾼다. 같은 걸 다시 누르면 해제 */
$('tags').addEventListener('click', (e) => {
	const button = e.target.closest('.tag-btn');
	if (!button) return;
	const value = button.dataset.tag;

	if (!session || session.state === 'idle') {
		selectedTag = selectedTag === value ? '' : value;
		renderTags();
		return;
	}

	run(button, async () => {
		const data = await api('/api/session/update', { method: 'POST', body: { tag: session.tag === value ? null : value } });
		await setSession(data.session);
	});
});

function avatarColor(id) {
	let hash = 0;
	for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
	return `hsl(${hash % 360} 55% 52%)`;
}

function renderTeam() {
	// 내 상태는 서버 목록보다 지금 가진 세션이 최신
	const list = members.map((m) => (m.isMe && session ? { ...m, ...session, tag: session.tag } : m));
	const focusingCount = list.filter((m) => m.state === 'focusing').length;

	$('team-count').textContent = focusingCount ? `${focusingCount}명 집중 중` : '';
	$('team-empty').hidden = list.length > 0;
	$('team-list').replaceChildren(
		...list.map((m) => {
			const li = document.createElement('li');
			li.className = 'member';
			li.dataset.state = m.state;

			const avatar = document.createElement('span');
			avatar.className = 'avatar';
			avatar.style.background = avatarColor(m.id);
			avatar.textContent = [...m.name][0] || '?';

			const name = document.createElement('span');
			name.className = 'name';
			name.textContent = m.name + (m.state !== 'idle' && m.tag && TAG_ICONS[m.tag] ? ` ${TAG_ICONS[m.tag]}` : '');
			if (m.isMe) {
				const me = document.createElement('span');
				me.className = 'me';
				me.textContent = '나';
				name.append(me);
			}

			const time = document.createElement('span');
			time.className = 'time';
			const dot = document.createElement('i');
			dot.className = 'dot';
			const total = m.todayMs + focusedMs(m);
			time.append(dot, total > 0 ? formatDuration(total) : m.state === 'idle' ? '' : '방금 시작');
			time.title = STATE_LABEL[m.state];

			li.append(avatar, name, time);
			return li;
		})
	);
}

// ---------- 세션 동작 ----------

$('btn-start').addEventListener('click', (e) =>
	run(e.currentTarget, async () => {
		const data = await api('/api/session/start', {
			method: 'POST',
			body: {
				label: $('plan').value.trim(),
				tag: selectedTag || undefined,
				channelId: toStartChannelId($('channel').value),
			},
		});
		$('plan').value = '';
		selectedTag = '';
		await setSession(data.session);
	})
);

$('btn-pause').addEventListener('click', (e) =>
	run(e.currentTarget, async () => {
		const data = await api('/api/session/pause', { method: 'POST', body: {} });
		await setSession(data.session);
	})
);

$('btn-resume').addEventListener('click', (e) =>
	run(e.currentTarget, async () => {
		const data = await api('/api/session/resume', { method: 'POST', body: {} });
		await setSession(data.session);
	})
);

$('btn-edit').addEventListener('click', () => {
	$('edit-plan').value = session?.label || '';
	$('edit-form').hidden = false;
	renderSession();
	$('edit-plan').focus();
});

$('btn-edit-cancel').addEventListener('click', () => {
	$('edit-form').hidden = true;
	renderSession();
});

$('btn-edit-save').addEventListener('click', (e) =>
	run(e.currentTarget, async () => {
		const data = await api('/api/session/update', { method: 'POST', body: { label: $('edit-plan').value } });
		$('edit-form').hidden = true;
		await setSession(data.session);
	})
);

// ---------- 종료 ----------

async function finishEnd(body) {
	const data = await api('/api/session/end', { method: 'POST', body });
	if (data.needsConfirm) {
		showEndConfirm(data);
		return;
	}
	$('end-confirm').hidden = true;
	flash = `🎉 ${data.durationLabel} 기록 완료!`;
	setTimeout(() => {
		flash = '';
		renderSession();
	}, 5000);
	await setSession(data.session);
	await refresh();
}

function showEndConfirm(data) {
	const parts = [];
	if (data.pauseDuration > 0) parts.push(`휴식 ${formatDuration(data.pauseDuration)}`);
	if (data.lunchDeducted > 0) parts.push(`점심 ${formatDuration(data.lunchDeducted)}`);
	$('end-confirm-text').textContent =
		`⏰ ${data.durationLabel} 기록 예정이에요.` +
		(parts.length ? `\n(${parts.join(' + ')} 제외)` : '') +
		'\n실제 집중 시간과 다르면 직접 입력해주세요.';
	$('btn-end-confirm').textContent = `✅ ${data.durationLabel} 그대로 기록`;
	$('manual-h').value = '';
	$('manual-m').value = '';
	$('end-confirm').hidden = false;
	renderSession();
}

$('btn-end').addEventListener('click', (e) => run(e.currentTarget, () => finishEnd({})));
$('btn-end-confirm').addEventListener('click', (e) => run(e.currentTarget, () => finishEnd({ confirm: true })));

$('btn-end-manual').addEventListener('click', (e) =>
	run(e.currentTarget, async () => {
		const h = Number($('manual-h').value || 0);
		const m = Number($('manual-m').value || 0);
		const duration = (h * 60 + m) * 60 * 1000;
		if (!(duration > 0)) throw new Error('기록할 시간을 입력해주세요.');
		await finishEnd({ duration });
	})
);

$('btn-end-cancel').addEventListener('click', () => {
	$('end-confirm').hidden = true;
	renderSession();
});

// ---------- 다른 화면과 동기화 ----------

// 단축키 · 백그라운드 동기화로 바뀐 것을 따라간다
chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== 'local') return;
	if (changes.activeAccountId && changes.activeAccountId.newValue !== account?.id && $('view-setup').hidden) {
		loadSession();
		return;
	}
	const next = changes.sessions?.newValue?.[account?.id];
	if (next && JSON.stringify(next) !== JSON.stringify(session)) {
		session = next;
		renderSession();
		renderTeam();
	}
	if (changes.sessions || changes.accounts) renderWorkspaces();
});

// 팝업을 열어둔 채로 있을 때 팀원 현황 갱신
setInterval(() => {
	if (!$('view-session').hidden) refresh();
}, REFRESH_MS);
setInterval(renderTeam, 30 * 1000);

loadSession();
