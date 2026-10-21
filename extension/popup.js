import { api, ApiError, getConfig, saveConfig, clearConfig, getChannelChoice, NO_CHANNEL, focusedMs, formatClock, formatDuration } from './api.js';

const $ = (id) => document.getElementById(id);

const STATE_LABEL = {
	idle: '🌱 쉬는 중',
	focusing: '⏳ 집중 중',
	paused: '🌙 일시정지 중',
};

let session = null;
let clockTimer = null;

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
		if (err instanceof ApiError && err.status === 401) {
			await chrome.storage.local.set({ authError: true });
			showSetup(true);
		}
		showError(err.message || '문제가 생겼어요.');
	} finally {
		if (button) button.disabled = false;
	}
}

async function setSession(next) {
	session = next;
	await chrome.storage.local.set({ session: next, authError: false });
	renderSession();
}

// ---------- 설정 ----------

async function showSetup(canCancel) {
	const { serverUrl, token } = await getConfig();
	$('server-url').value = serverUrl;
	$('token').value = '';
	$('token').placeholder = token ? '새 토큰 붙여넣기 (비우면 유지)' : 'ff_...';
	$('cancel-setup').hidden = !canCancel || !token;
	$('disconnect').hidden = !token;
	$('open-settings').hidden = true;
	$('view-session').hidden = true;
	$('view-setup').hidden = false;
	$('token').focus();
}

$('open-settings').addEventListener('click', () => showSetup(true));
$('cancel-setup').addEventListener('click', () => loadSession());

$('save-config').addEventListener('click', (e) =>
	run(e.currentTarget, async () => {
		const current = await getConfig();
		const token = $('token').value.trim() || current.token;
		if (!token) throw new Error('토큰을 입력해주세요.');
		await saveConfig({ serverUrl: $('server-url').value.trim(), token });
		await loadSession();
	})
);

$('disconnect').addEventListener('click', async () => {
	await clearConfig();
	session = null;
	showSetup(false);
});

// ---------- 세션 ----------

async function loadSession() {
	$('view-setup').hidden = true;
	$('view-session').hidden = false;
	$('open-settings').hidden = false;

	// 캐시로 먼저 그리고 서버 응답으로 갱신
	const cached = await chrome.storage.local.get('session');
	if (cached.session) {
		session = cached.session;
		renderSession();
	}

	await run(null, async () => {
		const data = await api('/api/session');
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
		const option = document.createElement('option');
		option.value = tag.value;
		option.textContent = tag.label;
		select.append(option);
	}
}

/** 저장된 선택이 목록에 있으면 유지, 아니면 서버 기본값(마지막 /start 채널) */
async function fillChannels(channels, defaultChannelId) {
	const select = $('channel');
	select.replaceChildren(select.options[0]);
	for (const channel of channels) {
		const option = document.createElement('option');
		option.value = channel.id;
		option.textContent = channel.name;
		select.append(option);
	}

	const { channelChoice } = await chrome.storage.local.get('channelChoice');
	const valid = channelChoice === NO_CHANNEL || channels.some((c) => c.id === channelChoice);
	select.value = valid ? channelChoice : defaultChannelId || NO_CHANNEL;
	$('channel-hint').hidden = channels.length > 0;
}

$('channel').addEventListener('change', () => chrome.storage.local.set({ channelChoice: $('channel').value }));

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
				channelId: $('channel').value === NO_CHANNEL ? null : $('channel').value,
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

(async () => {
	const { token } = await getConfig();
	if (token) loadSession();
	else showSetup(false);
})();
