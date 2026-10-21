/**
 * 익스텐션용 REST API — /api/*
 * Slack 밖(크롬 익스텐션 등)에서 세션을 시작/일시정지/재개/종료한다.
 * 인증은 개인 API 토큰(Bearer).
 * 공개 메시지 채널은 사용자가 /start 한 적 있는 채널 중에서만 고를 수 있다 (봇이 게시 가능한 채널 보장 + 임의 채널 게시 방지).
 */

import { authenticateRequest, redeemConnectCode, type ApiIdentity } from './auth';
import { getTeamStatus, getMonthStats, setMonthlyGoal, updateRunningSession } from './dashboard';
import { beginSession, getUserSessionState, getUserTodayStats, getRecentChannels } from '../services/session';
import { handlePause, handleResume } from '../commands/pause';
import { prepareEndSession, completeEndSession } from '../commands/end';
import { getUserTimezoneInfo } from '../commands/settings';
import { postMessage } from '../utils/slack';
import { formatTime, formatDuration } from '../utils/format';
import { SESSION_TAGS } from '../constants/messages';

const MAX_MANUAL_DURATION = 24 * 60 * 60 * 1000;

function corsHeaders(request: Request): Record<string, string> {
	const origin = request.headers.get('Origin') || '';
	if (!origin.startsWith('chrome-extension://')) {
		return {};
	}
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Authorization, Content-Type',
		'Access-Control-Max-Age': '86400',
		Vary: 'Origin',
	};
}

function json(request: Request, body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
	});
}

function apiError(request: Request, status: number, error: string, message: string): Response {
	return json(request, { ok: false, error, message }, status);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
	try {
		const body = await request.json();
		return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/** checkin에 저장된 세션 채널 */
async function getSessionChannel(env: Env, teamId: string, userId: string): Promise<string> {
	const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);
	if (!checkIn) return '';
	try {
		const parsed = JSON.parse(checkIn);
		return typeof parsed === 'object' && parsed.channelId ? parsed.channelId : '';
	} catch {
		return '';
	}
}

export async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: corsHeaders(request) });
	}

	// 연결 링크의 일회용 코드 → 토큰 (토큰이 아직 없으므로 인증 전에 처리)
	if (request.method === 'POST' && url.pathname === '/api/connect') {
		return connectWithCode(request, env);
	}

	const identity = await authenticateRequest(request, env);
	if (!identity) {
		return apiError(request, 401, 'unauthorized', '토큰이 유효하지 않아요. Slack 집중요정 홈 탭에서 다시 발급해주세요.');
	}

	const route = `${request.method} ${url.pathname}`;
	switch (route) {
		case 'GET /api/session':
			return getSession(request, env, identity);
		case 'POST /api/session/start':
			return startSession(request, env, identity);
		case 'POST /api/session/pause':
			return pauseSession(request, env, identity);
		case 'POST /api/session/resume':
			return resumeSession(request, env, identity);
		case 'POST /api/session/end':
			return endSession(request, env, identity);
		case 'POST /api/session/update':
			return updateSession(request, env, identity);
		case 'GET /api/team':
			return json(request, { ok: true, members: await getTeamStatus(env, identity) });
		case 'GET /api/stats':
			return getStats(request, env, identity, url);
		case 'POST /api/goal':
			return setGoal(request, env, identity);
		default:
			return apiError(request, 404, 'not_found', '알 수 없는 API예요.');
	}
}

async function getSession(request: Request, env: Env, { teamId, userId, teamName, userName }: ApiIdentity): Promise<Response> {
	const [session, today, channels, lastChannel] = await Promise.all([
		getUserSessionState(env, teamId, userId),
		getUserTodayStats(env, teamId, userId),
		getRecentChannels(env, teamId, userId),
		env.STUDY_KV.get(`${teamId}:lastChannel:${userId}`),
	]);
	const defaultChannelId = channels.some((c) => c.id === lastChannel) ? lastChannel : channels[0]?.id || null;
	return json(request, {
		ok: true,
		workspace: { id: teamId, name: teamName || teamId },
		user: { id: userId, name: userName || userId },
		session,
		today,
		channels: channels.map(({ id, name }) => ({ id, name })),
		defaultChannelId,
		tags: SESSION_TAGS,
		serverTime: Date.now(),
	});
}

async function startSession(request: Request, env: Env, { teamId, userId }: ApiIdentity): Promise<Response> {
	const current = await getUserSessionState(env, teamId, userId);
	if (current.state !== 'idle') {
		return apiError(request, 409, 'already_started', current.state === 'paused' ? '일시정지 중인 세션이 있어요.' : '이미 집중 중이에요!');
	}

	const body = await readBody(request);
	const label = typeof body.label === 'string' ? body.label.trim().slice(0, 1000) : '';
	const tag = SESSION_TAGS.some((t) => t.value === body.tag) ? (body.tag as string) : undefined;
	const channelId = await resolveStartChannel(env, teamId, userId, body.channelId);
	if (channelId === undefined) {
		return apiError(request, 400, 'invalid_channel', 'Slack에서 /start 한 적 있는 채널만 선택할 수 있어요.');
	}

	const now = Date.now();
	await beginSession(env, teamId, userId, now, { channelId, label, tag });

	if (channelId) {
		const tzInfo = await getUserTimezoneInfo(env, teamId, userId);
		let publicMessage = `:fairy-wand: <@${userId}>님이 집중을 시작했어요! 화이팅! (${formatTime(now, tzInfo.timezone, tzInfo.showLabel)})`;
		if (label) {
			const lines = label.split('\n').filter((l) => l.trim());
			const planDisplay = lines.length > 1 ? '\n' + lines.map((l) => `• ${l.trim()}`).join('\n') : ` ${label}`;
			publicMessage += `\n:fairy-sprout: 계획:${planDisplay}`;
		}
		if (tag) {
			publicMessage += `\n:fairy-fire: 카테고리: ${SESSION_TAGS.find((t) => t.value === tag)!.label}`;
		}
		await postMessage(env, teamId, channelId, publicMessage);
	}

	return json(request, { ok: true, session: await getUserSessionState(env, teamId, userId) });
}

/**
 * 시작 메시지를 보낼 채널.
 * channelId 문자열 → 최근 채널 목록에 있어야 함 / null → 채널에 안 올림('') / 생략 → 마지막 /start 채널.
 * 허용되지 않는 채널이면 undefined.
 */
async function resolveStartChannel(env: Env, teamId: string, userId: string, requested: unknown): Promise<string | undefined> {
	if (requested === null) return '';
	if (requested === undefined) return (await env.STUDY_KV.get(`${teamId}:lastChannel:${userId}`)) || '';
	if (typeof requested !== 'string') return undefined;
	const channels = await getRecentChannels(env, teamId, userId);
	return channels.some((c) => c.id === requested) ? requested : undefined;
}

async function pauseSession(request: Request, env: Env, { teamId, userId }: ApiIdentity): Promise<Response> {
	const current = await getUserSessionState(env, teamId, userId);
	if (current.state === 'idle') {
		return apiError(request, 409, 'not_started', '진행 중인 세션이 없어요.');
	}
	if (current.state === 'paused') {
		return apiError(request, 409, 'already_paused', '이미 일시정지 중이에요.');
	}

	await handlePause(env, teamId, userId, await getSessionChannel(env, teamId, userId));
	return json(request, { ok: true, session: await getUserSessionState(env, teamId, userId) });
}

async function resumeSession(request: Request, env: Env, { teamId, userId }: ApiIdentity): Promise<Response> {
	const current = await getUserSessionState(env, teamId, userId);
	if (current.state === 'idle') {
		return apiError(request, 409, 'not_started', '진행 중인 세션이 없어요.');
	}
	if (current.state === 'focusing') {
		return apiError(request, 409, 'not_paused', '일시정지 상태가 아니에요.');
	}

	await handleResume(env, teamId, userId, await getSessionChannel(env, teamId, userId));
	return json(request, { ok: true, session: await getUserSessionState(env, teamId, userId) });
}

/**
 * 세션 종료.
 * body.duration(ms)을 주면 그 시간으로 기록, 없으면 자동 계산.
 * 자동 계산 시간이 워크스페이스 임계값을 넘으면 기록하지 않고 needsConfirm을 돌려준다 → body.confirm: true 로 재요청.
 */
async function endSession(request: Request, env: Env, { teamId, userId }: ApiIdentity): Promise<Response> {
	const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);
	if (!checkIn) {
		return apiError(request, 409, 'not_started', '진행 중인 세션이 없어요.');
	}

	const body = await readBody(request);
	const prepared = await prepareEndSession(env, teamId, userId, checkIn);
	const { checkin, tzInfo, lunchDeducted, maxAutoDuration } = prepared;
	let duration = prepared.duration;

	if (body.duration !== undefined) {
		const manual = Number(body.duration);
		if (!Number.isFinite(manual) || manual <= 0 || manual > MAX_MANUAL_DURATION) {
			return apiError(request, 400, 'invalid_duration', '기록할 시간을 확인해주세요. (최대 24시간)');
		}
		duration = Math.round(manual);
	} else if (duration > maxAutoDuration && body.confirm !== true) {
		return json(request, {
			ok: false,
			needsConfirm: true,
			duration,
			durationLabel: formatDuration(duration),
			pauseDuration: checkin.totalPauseDuration,
			lunchDeducted,
		});
	}

	const channelId = checkin.msgChannelId || '';
	const durationLabel = await completeEndSession(env, teamId, userId, channelId, duration, checkin, tzInfo, lunchDeducted);
	return json(request, { ok: true, duration, durationLabel, session: { state: 'idle' } });
}

async function updateSession(request: Request, env: Env, identity: ApiIdentity): Promise<Response> {
	const result = await updateRunningSession(env, identity, await readBody(request));
	if (result === 'not_started') {
		return apiError(request, 409, 'not_started', '진행 중인 세션이 없어요.');
	}
	if (result === 'invalid_tag') {
		return apiError(request, 400, 'invalid_tag', '알 수 없는 카테고리예요.');
	}
	return json(request, { ok: true, session: await getUserSessionState(env, identity.teamId, identity.userId) });
}

async function getStats(request: Request, env: Env, identity: ApiIdentity, url: URL): Promise<Response> {
	const stats = await getMonthStats(env, identity, url.searchParams.get('month'));
	if (!stats) {
		return apiError(request, 400, 'invalid_month', 'month는 YYYY-MM 형식이어야 해요.');
	}
	return json(request, { ok: true, ...stats });
}

/** body.hours — 월 목표 시간. 0 / null 이면 해제 */
async function setGoal(request: Request, env: Env, identity: ApiIdentity): Promise<Response> {
	const goalMs = await setMonthlyGoal(env, identity, (await readBody(request)).hours);
	if (goalMs === false) {
		return apiError(request, 400, 'invalid_goal', '목표 시간을 확인해주세요. (최대 744시간)');
	}
	return json(request, { ok: true, goalMs });
}

async function connectWithCode(request: Request, env: Env): Promise<Response> {
	const { code } = await readBody(request);
	const redeemed = typeof code === 'string' && code ? await redeemConnectCode(env, code) : null;
	if (!redeemed) {
		return apiError(request, 400, 'invalid_code', '연결 링크가 만료됐거나 이미 사용됐어요. Slack에서 다시 연결해주세요.');
	}

	const { token, identity } = redeemed;
	return json(request, {
		ok: true,
		token,
		workspace: { id: identity.teamId, name: identity.teamName || identity.teamId },
		user: { id: identity.userId, name: identity.userName || identity.userId },
		session: await getUserSessionState(env, identity.teamId, identity.userId),
	});
}
