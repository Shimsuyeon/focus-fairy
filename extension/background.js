/**
 * 백그라운드 서비스 워커
 * - 1분마다 캐시된 세션으로 툴바 배지 갱신, 5분마다 서버와 동기화 (Slack에서 바꾼 상태 반영)
 * - 단축키 toggle-focus: 쉬는 중 → 시작, 집중 중 → 일시정지, 일시정지 → 재개
 */

import { api, getConfig, getChannelChoice, focusedMs, badgeText } from './api.js';

const COLORS = { focusing: '#7C5CFF', paused: '#F5A623', error: '#E5484D' };

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

// popup에서 세션을 바꾸면 storage가 바뀌므로 배지도 바로 따라간다
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'local' && ('session' in changes || 'authError' in changes)) renderBadge();
	if (area === 'local' && 'token' in changes) sync();
});

async function sync() {
	const { token } = await getConfig();
	if (!token) {
		await chrome.storage.local.set({ session: null, authError: false });
		return;
	}
	try {
		const data = await api('/api/session');
		await chrome.storage.local.set({ session: data.session, authError: false });
	} catch (err) {
		// 네트워크 오류는 캐시 유지, 인증 오류만 표시
		if (err.status === 401) await chrome.storage.local.set({ session: null, authError: true });
	}
}

async function renderBadge() {
	const { session, authError } = await chrome.storage.local.get(['session', 'authError']);

	if (authError) {
		await chrome.action.setBadgeBackgroundColor({ color: COLORS.error });
		await chrome.action.setBadgeText({ text: '!' });
		await chrome.action.setTitle({ title: '집중요정 — 토큰을 다시 확인해주세요' });
		return;
	}

	if (!session || session.state === 'idle') {
		await chrome.action.setBadgeText({ text: '' });
		await chrome.action.setTitle({ title: '집중요정 — 쉬는 중' });
		return;
	}

	const ms = focusedMs(session);
	await chrome.action.setBadgeBackgroundColor({ color: COLORS[session.state] });
	await chrome.action.setBadgeTextColor?.({ color: '#FFFFFF' });
	await chrome.action.setBadgeText({ text: badgeText(ms) });
	await chrome.action.setTitle({ title: `집중요정 — ${session.state === 'paused' ? '일시정지 중' : '집중 중'}` });
}

chrome.commands.onCommand.addListener(async (command) => {
	if (command !== 'toggle-focus') return;
	try {
		const { session } = await api('/api/session');
		const action = session.state === 'idle' ? 'start' : session.state === 'focusing' ? 'pause' : 'resume';
		const body = action === 'start' ? { channelId: await getChannelChoice() } : {};
		const data = await api(`/api/session/${action}`, { method: 'POST', body });
		await chrome.storage.local.set({ session: data.session, authError: false });
	} catch (err) {
		if (err.status === 401) await chrome.storage.local.set({ session: null, authError: true });
		console.error('toggle-focus failed:', err);
	}
});
