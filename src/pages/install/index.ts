/**
 * Slack OAuth 설치 플로우 핸들러
 * 외부 워크스페이스에서 집중요정을 설치할 수 있도록 지원
 */

import { renderInstallPage, renderResultPage, renderUserOAuthResultPage } from './render';

const BOT_SCOPES = ['commands', 'chat:write', 'users:read', 'files:write', 'im:write'].join(',');
const USER_SCOPES = 'users.profile:write';

interface OAuthResponse {
	ok: boolean;
	access_token?: string;
	token_type?: string;
	scope?: string;
	bot_user_id?: string;
	app_id?: string;
	team?: { name?: string; id: string };
	authed_user?: { id: string; access_token?: string; scope?: string };
	error?: string;
}

function htmlResponse(html: string, status = 200): Response {
	return new Response(html, {
		status,
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}

/**
 * 온보딩 가이드 설치 페이지
 */
export function handleOAuthInstall(env: Env): Response {
	const clientId = env.SLACK_CLIENT_ID;
	if (!clientId) {
		return new Response('OAuth is not configured', { status: 500 });
	}

	const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${BOT_SCOPES}`;
	return htmlResponse(renderInstallPage(slackAuthUrl));
}

/**
 * OAuth 콜백 핸들러 — 인증 코드를 봇 토큰으로 교환 후 KV에 저장
 */
export async function handleOAuthCallback(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');

	if (error) {
		return htmlResponse(renderResultPage(false, '설치가 취소되었어요.'), 400);
	}

	if (!code) {
		return htmlResponse(renderResultPage(false, '인증 코드가 없어요.'), 400);
	}

	try {
		const response = await fetch('https://slack.com/api/oauth.v2.access', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: env.SLACK_CLIENT_ID,
				client_secret: env.SLACK_CLIENT_SECRET,
				code,
			}),
		});

		const data = (await response.json()) as OAuthResponse;

		if (!data.ok || !data.access_token || !data.team?.id) {
			console.error('OAuth exchange failed:', data.error);
			return htmlResponse(renderResultPage(false, `설치에 실패했어요: ${data.error || 'unknown error'}`), 400);
		}

		await env.STUDY_KV.put(`tokens:${data.team.id}`, data.access_token);

		const teamName = data.team.name || data.team.id;
		return htmlResponse(renderResultPage(true, `${teamName} 워크스페이스에\n집중요정이 설치되었어요!`));
	} catch (err) {
		console.error('OAuth callback error:', err);
		return htmlResponse(renderResultPage(false, '서버 오류가 발생했어요.'), 400);
	}
}

/**
 * 사용자 OAuth — Slack status 동기화 권한 요청
 */
export function handleUserOAuthInstall(request: Request, env: Env): Response {
	const clientId = env.SLACK_CLIENT_ID;
	if (!clientId) {
		return new Response('OAuth is not configured', { status: 500 });
	}

	const origin = new URL(request.url).origin;
	const redirectUri = `${origin}/slack/oauth/user-callback`;
	const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&user_scope=${USER_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}`;
	return Response.redirect(slackAuthUrl, 302);
}

/**
 * 사용자 OAuth 콜백 — user token 저장
 */
export async function handleUserOAuthCallback(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');

	if (error) {
		return htmlResponse(renderUserOAuthResultPage(false, '권한 연결이 취소되었어요.'), 400);
	}

	if (!code) {
		return htmlResponse(renderUserOAuthResultPage(false, '인증 코드가 없어요.'), 400);
	}

	try {
		const redirectUri = `${url.origin}/slack/oauth/user-callback`;
		const response = await fetch('https://slack.com/api/oauth.v2.access', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: env.SLACK_CLIENT_ID,
				client_secret: env.SLACK_CLIENT_SECRET,
				code,
				redirect_uri: redirectUri,
			}),
		});

		const data = (await response.json()) as OAuthResponse;

		if (!data.ok || !data.authed_user?.access_token || !data.authed_user?.id || !data.team?.id) {
			console.error('User OAuth exchange failed:', data.error);
			return htmlResponse(renderUserOAuthResultPage(false, `연결에 실패했어요: ${data.error || 'unknown error'}`), 400);
		}

		const teamId = data.team.id;
		const userId = data.authed_user.id;
		await env.STUDY_KV.put(`${teamId}:userToken:${userId}`, data.authed_user.access_token);

		return htmlResponse(renderUserOAuthResultPage(true, 'Slack status 동기화가\n연결되었어요!'));
	} catch (err) {
		console.error('User OAuth callback error:', err);
		return htmlResponse(renderUserOAuthResultPage(false, '서버 오류가 발생했어요.'), 400);
	}
}
