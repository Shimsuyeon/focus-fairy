import {
	api,
	ApiError,
	DEFAULT_SERVER,
	NO_CHANNEL,
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
	formatClock,
	formatDuration,
} from './api.js';

const $ = (id) => document.getElementById(id);

const STATE_LABEL = {
	idle: '🌱 쉬는 중',
	focusing: '⏳ 집중 중',
	paused: '🌙 일시정지 중',
};

const ADD_WORKSPACE = '__add__';

let account = null; // 활성 계정
let session = null;
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
	await renderWorkspaces();
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
		const icon = state === 'focusing' ? '⏳ ' : state === 'paused' ? '🌙 ' : '';
		const option = new Option(icon + workspaceLabel(a, accounts), a.id);
		select.append(option);
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

// ---------- 세션 ----------

async function loadSession() {
	showError('');
	account = (await getAccounts()).active;
	if (!account) {
		await showSetup('add');
		return;
	}

	$('view-setup').hidden = true;
	$('view-session').hidden = false;
	$('open-settings').hidden = false;
	$('end-confirm').hidden = true;

	// 캐시로 먼저 그리고 서버 응답으로 갱신
	const { sessions = {} } = await chrome.storage.local.get('sessions');
	session = sessions[account.id] || null;
	$('today').textContent = '';
	renderSession();
	await renderWorkspaces();

	const loading = account.id;
	await run(null, async () => {
		const data = await api('/api/session');
		if (account?.id !== loading) return; // 응답 오기 전에 워크스페이스를 바꾼 경우

		// 워크스페이스/사용자 이름이 바뀌었으면 갱신
		if (data.workspace && (data.workspace.name !== account.teamName || data.user?.name !== account.userName)) {
			account = { ...account, teamId: data.workspace.id, teamName: data.workspace.name, userId: data.user?.id, userName: data.user?.name };
			await saveAccount(account);
		}

		fillTags(data.tags || []);
		await fillChannels(data.channels || [], data.defaultChannelId);
		renderToday(data.today);
		await setSession(data.session);
	});
}

function fillTags(tags) {
	const select = $('tag');
	if (select.options.length > 1) return;
	for (const tag of tags) {
		select.append(new Option(tag.label, tag.value));
	}
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

function renderToday(today) {
	if (!today) return;
	$('today').textContent =
		today.sessionCount > 0 ? `오늘 누적 ${formatDuration(today.totalMs)} · ${today.sessionCount}회` : '오늘은 아직 기록이 없어요';
}

function renderSession() {
	const state = session?.state || 'idle';

	$('state-label').textContent = STATE_LABEL[state];
	$('state-label').dataset.state = state;
	$('clock').dataset.state = state;

	const meta = [];
	if (session?.label) meta.push(session.label);
	$('session-meta').textContent = meta.join('\n');
	$('session-meta').hidden = meta.length === 0;

	$('idle-form').hidden = state !== 'idle';
	$('active-actions').hidden = state === 'idle' || !$('end-confirm').hidden;
	$('btn-pause').hidden = state !== 'focusing';
	$('btn-resume').hidden = state !== 'paused';
	if (state === 'idle') $('end-confirm').hidden = true;

	tick();
	clearInterval(clockTimer);
	if (state === 'focusing') clockTimer = setInterval(tick, 1000);
}

function tick() {
	$('clock').textContent = formatClock(focusedMs(session));
}

$('btn-start').addEventListener('click', (e) =>
	run(e.currentTarget, async () => {
		const data = await api('/api/session/start', {
			method: 'POST',
			body: {
				label: $('plan').value.trim(),
				tag: $('tag').value || undefined,
				channelId: toStartChannelId($('channel').value),
			},
		});
		$('plan').value = '';
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

// ---------- 종료 ----------

async function finishEnd(body) {
	const data = await api('/api/session/end', { method: 'POST', body });
	if (data.needsConfirm) {
		showEndConfirm(data);
		return;
	}
	$('end-confirm').hidden = true;
	await setSession(data.session);
	$('state-label').textContent = `🎉 ${data.durationLabel} 기록 완료!`;
	const summary = await api('/api/session');
	renderToday(summary.today);
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
	$('active-actions').hidden = true;
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

// ---------- 시작 ----------

loadSession();
