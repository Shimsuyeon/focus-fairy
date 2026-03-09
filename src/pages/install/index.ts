/**
 * Slack OAuth 설치 플로우 핸들러
 * 외부 워크스페이스에서 집중요정을 설치할 수 있도록 지원
 */

import { renderInstallPage, renderResultPage } from './render';

const BOT_SCOPES = ['commands', 'chat:write', 'users:read', 'files:write', 'im:write'].join(',');

interface OAuthResponse {
	ok: boolean;
	access_token?: string;
	token_type?: string;
	scope?: string;
	bot_user_id?: string;
	app_id?: string;
	team?: { name?: string; id: string };
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
	const preview = url.searchParams.get('preview');
	if (preview === 'success') {
		return htmlResponse(renderResultPage(true, '테스트 워크스페이스에\n집중요정이 설치되었어요!'));
	}
	if (preview === 'fail') {
		return htmlResponse(renderResultPage(false, '설치에 실패했어요.'), 400);
	}

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
