/**
 * 백그라운드 서비스 워커
 * - 1분마다 캐시된 세션으로 툴바 배지 갱신, 5분마다 모든 워크스페이스를 서버와 동기화 (Slack에서 바꾼 상태 반영)
 * - 배지: 지금 보고 있는 워크스페이스 우선, 그곳이 쉬는 중이면 집중 중인 다른 워크스페이스
 * - 단축키 toggle-focus: 활성 워크스페이스에서 쉬는 중 → 시작, 집중 중 → 일시정지, 일시정지 → 재개
 */

import { api, getAccounts, setAccountState, getChannelChoice, toStartChannelId, focusedMs, badgeText } from './api.js';

const COLORS = { focusing: '#22A06B', paused: '#E8930C', error: '#E5484D' };

function setupAlarms() {
	chrome.alarms.create('tick', { periodInMinutes: 1 });
	chrome.alarms.create('sync', { periodInMinutes: 5 });
	sync();
}

chrome.runtime.onInstalled.addListener(setupAlarms);
chrome.runtime.onStartup.addListener(setupAlarms);

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === 'sync') sync();
	else renderBadge();
});

// 팝업에서 세션·계정을 바꾸면 storage가 바뀌므로 배지도 바로 따라간다
chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== 'local') return;
	if ('sessions' in changes || 'authErrors' in changes || 'activeAccountId' in changes || 'accounts' in changes) renderBadge();
});

async function sync() {
	const { accounts } = await getAccounts();
	// sessions/authErrors 맵을 read-modify-write 하므로 계정별로 순서대로
	for (const account of accounts) {
		try {
			const data = await api('/api/session', { account });
			await setAccountState(account.id, { session: data.session, authError: false });
		} catch (err) {
			// 네트워크 오류는 캐시 유지, 인증 오류만 표시
			if (err.status === 401) await setAccountState(account.id, { session: null, authError: true });
		}
	}
}

async function renderBadge() {
	const { accounts, active } = await getAccounts();
	const { sessions = {}, authErrors = {} } = await chrome.storage.local.get(['sessions', 'authErrors']);

	if (active && authErrors[active.id]) {
		await chrome.action.setBadgeBackgroundColor({ color: COLORS.error });
		await chrome.action.setBadgeText({ text: '!' });
		await chrome.action.setTitle({ title: `집중요정 — ${active.teamName || '워크스페이스'} 토큰을 다시 확인해주세요` });
		return;
	}

	const isActive = (a) => sessions[a.id] && sessions[a.id].state !== 'idle';
	const shown = active && isActive(active) ? active : accounts.find(isActive);

	if (!shown) {
		await chrome.action.setBadgeText({ text: '' });
		await chrome.action.setTitle({ title: '집중요정 — 쉬는 중' });
		return;
	}

	const session = sessions[shown.id];
	const stateLabel = session.state === 'paused' ? '일시정지 중' : '집중 중';
	await chrome.action.setBadgeBackgroundColor({ color: COLORS[session.state] });
	await chrome.action.setBadgeTextColor?.({ color: '#FFFFFF' });
	await chrome.action.setBadgeText({ text: badgeText(focusedMs(session)) });
	await chrome.action.setTitle({ title: `집중요정 — ${shown.teamName ? `${shown.teamName}에서 ` : ''}${stateLabel}` });
}

chrome.commands.onCommand.addListener(async (command) => {
	if (command !== 'toggle-focus') return;
	const { active } = await getAccounts();
	if (!active) return;

	try {
		const { session } = await api('/api/session', { account: active });
		const action = session.state === 'idle' ? 'start' : session.state === 'focusing' ? 'pause' : 'resume';
		const body = action === 'start' ? { channelId: toStartChannelId(await getChannelChoice(active.id)) } : {};
		const data = await api(`/api/session/${action}`, { method: 'POST', body, account: active });
		await setAccountState(active.id, { session: data.session, authError: false });
	} catch (err) {
		if (err.status === 401) await setAccountState(active.id, { session: null, authError: true });
		console.error('toggle-focus failed:', err);
	}
});
