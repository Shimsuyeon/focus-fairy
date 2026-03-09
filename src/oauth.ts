/**
 * Slack OAuth 설치 플로우 핸들러
 * 외부 워크스페이스에서 집중요정을 설치할 수 있도록 지원
 */

const BOT_SCOPES = ['commands', 'chat:write', 'users:read', 'files:write', 'im:write'].join(',');

/**
 * "Add to Slack" 설치 페이지
 */
export function handleOAuthInstall(env: Env): Response {
	const clientId = env.SLACK_CLIENT_ID;
	if (!clientId) {
		return new Response('OAuth is not configured', { status: 500 });
	}

	const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${BOT_SCOPES}`;

	const html = `<!DOCTYPE html>
<html lang="ko">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>집중요정 설치 | Focus Fairy</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			min-height: 100vh;
			background: linear-gradient(180deg, #0a0a1a 0%, #1a1a3a 50%, #0d1f0d 100%);
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			font-family: 'Segoe UI', system-ui, sans-serif;
			color: rgba(255, 255, 255, 0.85);
		}
		.card {
			background: rgba(255, 255, 255, 0.05);
			border: 1px solid rgba(167, 139, 250, 0.2);
			border-radius: 16px;
			padding: 3rem;
			max-width: 420px;
			text-align: center;
		}
		h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
		.emoji { font-size: 3rem; margin-bottom: 1rem; }
		p { color: rgba(255, 255, 255, 0.6); margin-bottom: 2rem; line-height: 1.6; }
		.btn {
			display: inline-block;
			background: #a78bfa;
			color: white;
			padding: 14px 32px;
			border-radius: 10px;
			text-decoration: none;
			font-size: 1.1rem;
			font-weight: 600;
			transition: all 0.3s ease;
		}
		.btn:hover {
			background: #8b6ff0;
			transform: translateY(-2px);
			box-shadow: 0 4px 20px rgba(167, 139, 250, 0.4);
		}
		.scopes {
			margin-top: 2rem;
			font-size: 0.75rem;
			color: rgba(255, 255, 255, 0.35);
		}
	</style>
</head>
<body>
	<div class="card">
		<div class="emoji">🧚‍♀️</div>
		<h1>집중요정 설치</h1>
		<p>슬랙 워크스페이스에 집중요정을 추가하고<br>팀의 집중 시간을 함께 기록해보세요!</p>
		<a href="${slackAuthUrl}" class="btn">Add to Slack</a>
		<div class="scopes">요청 권한: 슬래시 커맨드, 메시지 전송, 사용자 조회, 파일 전송</div>
	</div>
</body>
</html>`;

	return new Response(html, {
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}

/**
 * OAuth 콜백 핸들러 — 인증 코드를 봇 토큰으로 교환 후 KV에 저장
 */
export async function handleOAuthCallback(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');

	if (error) {
		return renderResult(false, '설치가 취소되었어요.');
	}

	if (!code) {
		return renderResult(false, '인증 코드가 없어요.');
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
			return renderResult(false, `설치에 실패했어요: ${data.error || 'unknown error'}`);
		}

		await env.STUDY_KV.put(`tokens:${data.team.id}`, data.access_token);

		const teamName = data.team.name || data.team.id;
		return renderResult(true, `${teamName} 워크스페이스에 집중요정이 설치되었어요!`);
	} catch (err) {
		console.error('OAuth callback error:', err);
		return renderResult(false, '서버 오류가 발생했어요.');
	}
}

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

function renderResult(success: boolean, message: string): Response {
	const emoji = success ? '🎉' : '😢';
	const color = success ? '#34D399' : '#F87171';

	const html = `<!DOCTYPE html>
<html lang="ko">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${success ? '설치 완료' : '설치 실패'} | Focus Fairy</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			min-height: 100vh;
			background: linear-gradient(180deg, #0a0a1a 0%, #1a1a3a 50%, #0d1f0d 100%);
			display: flex;
			align-items: center;
			justify-content: center;
			font-family: 'Segoe UI', system-ui, sans-serif;
			color: rgba(255, 255, 255, 0.85);
		}
		.card {
			background: rgba(255, 255, 255, 0.05);
			border: 1px solid ${color}44;
			border-radius: 16px;
			padding: 3rem;
			max-width: 420px;
			text-align: center;
		}
		.emoji { font-size: 3rem; margin-bottom: 1rem; }
		h1 { font-size: 1.5rem; margin-bottom: 1rem; color: ${color}; }
		p { color: rgba(255, 255, 255, 0.6); line-height: 1.6; }
	</style>
</head>
<body>
	<div class="card">
		<div class="emoji">${emoji}</div>
		<h1>${message}</h1>
		<p>${success ? '슬랙에서 /start 명령어로 집중을 시작해보세요! 🧚‍♀️' : '다시 시도해주세요.'}</p>
	</div>
</body>
</html>`;

	return new Response(html, {
		status: success ? 200 : 400,
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}
