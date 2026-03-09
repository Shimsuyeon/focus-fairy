/**
 * Slack OAuth 설치 플로우 핸들러
 * 외부 워크스페이스에서 집중요정을 설치할 수 있도록 지원
 */

import { WITHOUT_EMOJI_IMG, WITH_EMOJI_IMG, FAIRY_CONFETTI_IMG, FAIRY_THUMBNAIL_IMG } from './pages/install/images';

const BOT_SCOPES = ['commands', 'chat:write', 'users:read', 'files:write', 'im:write'].join(',');

const EMOJI_DOWNLOAD_URL = 'https://github.com/Shimsuyeon/focus-fairy/raw/main/assets/emojis/focus-fairy-emojis.zip';
const EMOJI_EXTENSION_URL = 'https://chromewebstore.google.com/detail/neutral-face-emoji-tools/anchoacphlfbdomdlomnbbfhcmcdmjej';

/**
 * 온보딩 가이드 설치 페이지
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
	<title>집중요정 설치 가이드 | Focus Fairy</title>
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
			padding: 2rem 1rem;
		}

		.container {
			max-width: 520px;
			width: 100%;
		}

		.header {
			text-align: center;
			margin-bottom: 2rem;
		}
		.header-emoji { margin-bottom: 0.5rem; }
		.header-emoji img { width: 80px; height: 80px; }
		.header h1 { font-size: 1.8rem; margin-bottom: 0.3rem; }
		.header p { color: rgba(255, 255, 255, 0.5); font-size: 0.9rem; }

		.step {
			background: rgba(255, 255, 255, 0.05);
			border: 1px solid rgba(167, 139, 250, 0.15);
			border-radius: 14px;
			padding: 1.5rem;
			margin-bottom: 1rem;
		}
		.step.hidden { display: none; }
		.step.reveal { animation: fadeSlideIn 0.3s ease forwards; }

		@keyframes fadeSlideIn {
			from { opacity: 0; transform: translateY(8px); }
			to { opacity: 1; transform: translateY(0); }
		}

		.step-header {
			display: flex;
			align-items: center;
			gap: 0.7rem;
			margin-bottom: 1rem;
		}
		.step-number {
			background: #a78bfa;
			color: white;
			width: 28px;
			height: 28px;
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 0.85rem;
			font-weight: 700;
			flex-shrink: 0;
		}
		.step-title {
			font-size: 1rem;
			font-weight: 600;
		}
		.step-optional {
			font-size: 0.75rem;
			color: rgba(167, 139, 250, 0.7);
			background: rgba(167, 139, 250, 0.1);
			padding: 2px 8px;
			border-radius: 4px;
			margin-left: auto;
		}

		.step-body {
			color: rgba(255, 255, 255, 0.6);
			font-size: 0.85rem;
			line-height: 1.6;
		}

		.comparison {
			display: flex;
			gap: 0.75rem;
			margin: 1rem 0;
		}
		.comparison-item {
			flex: 1;
			text-align: center;
		}
		.comparison-label {
			font-size: 0.7rem;
			color: rgba(255, 255, 255, 0.4);
			margin-bottom: 0.4rem;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
		.comparison-img {
			width: 100%;
			height: 60px;
			object-fit: contain;
			border-radius: 8px;
			border: 1px solid rgba(255, 255, 255, 0.1);
			background: rgba(255, 255, 255, 0.95);
		}

		.choice-buttons {
			display: flex;
			gap: 0.5rem;
			margin-top: 1rem;
		}
		.choice-btn {
			flex: 1;
			padding: 10px;
			border-radius: 8px;
			border: none;
			font-size: 0.85rem;
			font-weight: 600;
			font-family: inherit;
			cursor: pointer;
			transition: all 0.3s ease;
		}
		.choice-btn.yes {
			background: rgba(167, 139, 250, 0.2);
			color: #a78bfa;
			border: 1px solid rgba(167, 139, 250, 0.3);
		}
		.choice-btn.yes:hover { background: rgba(167, 139, 250, 0.35); }
		.choice-btn.no {
			background: rgba(255, 255, 255, 0.05);
			color: rgba(255, 255, 255, 0.5);
			border: 1px solid rgba(255, 255, 255, 0.1);
		}
		.choice-btn.no:hover {
			background: rgba(255, 255, 255, 0.1);
			color: rgba(255, 255, 255, 0.7);
		}

		.sub-step {
			margin-top: 1rem;
			padding-top: 1rem;
			border-top: 1px solid rgba(255, 255, 255, 0.06);
		}
		.sub-step.hidden { display: none; }
		.sub-step.reveal { animation: fadeSlideIn 0.3s ease forwards; }

		.sub-step-label {
			font-size: 0.75rem;
			color: #a78bfa;
			font-weight: 600;
			margin-bottom: 0.5rem;
		}
		.action-btn {
			display: block;
			width: 100%;
			padding: 10px 16px;
			border-radius: 8px;
			text-decoration: none;
			font-size: 0.85rem;
			font-weight: 600;
			text-align: center;
			cursor: pointer;
			transition: all 0.3s ease;
			border: 1px solid rgba(167, 139, 250, 0.3);
			font-family: inherit;
			background: rgba(167, 139, 250, 0.2);
			color: #a78bfa;
		}
		.action-btn:hover { background: rgba(167, 139, 250, 0.35); }
		.action-btn.confirm {
			margin-top: 0.5rem;
			background: transparent;
			border: 1px dashed rgba(167, 139, 250, 0.4);
			color: rgba(167, 139, 250, 0.7);
		}
		.action-btn.confirm:hover {
			background: rgba(167, 139, 250, 0.15);
			color: #a78bfa;
		}

		.workspace-input {
			width: 100%;
			padding: 10px 12px;
			border-radius: 8px;
			border: 1px solid rgba(167, 139, 250, 0.3);
			background: rgba(255, 255, 255, 0.08);
			color: rgba(255, 255, 255, 0.9);
			font-size: 0.85rem;
			font-family: inherit;
			outline: none;
			transition: border-color 0.3s ease;
			margin-bottom: 0.5rem;
		}
		.workspace-input::placeholder { color: rgba(255, 255, 255, 0.25); }
		.workspace-input:focus { border-color: #a78bfa; }
		.workspace-input.error { border-color: #F87171; }
		.workspace-error {
			font-size: 0.75rem;
			color: #F87171;
			margin-top: -0.3rem;
			margin-bottom: 0.4rem;
			display: none;
		}
		.workspace-hint {
			font-size: 0.7rem;
			color: rgba(255, 255, 255, 0.35);
			margin-top: 0.5rem;
		}

		.btn {
			display: block;
			background: #a78bfa;
			color: white;
			padding: 14px 32px;
			border-radius: 10px;
			text-decoration: none;
			font-size: 1.1rem;
			font-weight: 600;
			text-align: center;
			transition: all 0.3s ease;
		}
		.btn:hover {
			background: #8b6ff0;
			transform: translateY(-2px);
			box-shadow: 0 4px 20px rgba(167, 139, 250, 0.4);
		}

		.scopes {
			margin-top: 0.5rem;
			font-size: 0.7rem;
			color: rgba(255, 255, 255, 0.3);
			text-align: center;
		}

		code {
			background: rgba(255, 255, 255, 0.1);
			padding: 2px 6px;
			border-radius: 4px;
			font-size: 0.85em;
			color: #a78bfa;
		}

		.footer {
			text-align: center;
			margin-top: 1.5rem;
			color: rgba(255, 255, 255, 0.3);
			font-size: 0.75rem;
		}
		.footer a {
			color: rgba(255, 255, 255, 0.3);
			text-decoration: none;
		}
		.footer a:hover { color: #a78bfa; }
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<div class="header-emoji"><img src="${FAIRY_THUMBNAIL_IMG}" alt="집중요정"></div>
			<h1>집중요정 설치 가이드</h1>
			<p>2단계로 집중요정을 시작하세요</p>
		</div>

		<div class="step" id="step1">
			<div class="step-header">
				<div class="step-number">1</div>
				<span class="step-title">커스텀 이모지 등록</span>
				<span class="step-optional">선택</span>
			</div>
			<div class="step-body">
				집중요정 전용 도트 이모지를 등록하면 더 귀여워져요!
				<div class="comparison">
					<div class="comparison-item">
						<div class="comparison-label">이모지 없이</div>
						<img src="${WITHOUT_EMOJI_IMG}" alt="이모지 미등록" class="comparison-img">
					</div>
					<div class="comparison-item">
						<div class="comparison-label">이모지 등록 후</div>
						<img src="${WITH_EMOJI_IMG}" alt="이모지 등록" class="comparison-img">
					</div>
				</div>
				<div class="choice-buttons" id="emojiChoice">
					<button class="choice-btn yes" onclick="startEmojiSetup()">등록할래요</button>
					<button class="choice-btn no" onclick="skipEmoji()">건너뛰기</button>
				</div>

				<div class="sub-step hidden" id="substep1">
					<div class="sub-step-label">1-1. 이모지 다운로드</div>
					<a href="${EMOJI_DOWNLOAD_URL}" class="action-btn" onclick="completeSubStep(1)">📦 이모지 다운로드 (ZIP)</a>
				</div>

				<div class="sub-step hidden" id="substep2">
					<div class="sub-step-label">1-2. 벌크 등록 도구 설치</div>
					<a href="${EMOJI_EXTENSION_URL}" target="_blank" rel="noopener" class="action-btn">⚡ Neutral Face Emoji Tools 설치</a>
					<button class="action-btn confirm" onclick="completeSubStep(2)">설치 완료했어요 →</button>
				</div>

				<div class="sub-step hidden" id="substep3">
					<div class="sub-step-label">1-3. 이모지 등록 페이지 열기</div>
					<input type="text" class="workspace-input" id="workspaceUrl" placeholder="myteam" />
					<div class="workspace-error" id="urlError">워크스페이스 이름을 입력해주세요</div>
					<div class="workspace-hint">슬랙 좌측 상단 워크스페이스 이름 클릭 → <code>xxx.slack.com</code>에서 xxx 부분 입력</div>
					<button class="action-btn" onclick="openEmojiPage()">이모지 등록 페이지 열기 →</button>
					<div class="workspace-hint">열린 페이지에서 다운받은 이미지를 드래그 앤 드롭하세요</div>
				</div>
			</div>
		</div>

		<div class="step hidden" id="step2">
			<div class="step-header">
				<div class="step-number">2</div>
				<span class="step-title">슬랙에 집중요정 추가</span>
			</div>
			<div class="step-body">
				<a href="${slackAuthUrl}" class="btn">Add to Slack</a>
				<div class="scopes">요청 권한: 슬래시 커맨드, 메시지 전송, 사용자 조회, 파일 전송</div>
			</div>
		</div>

		<div class="footer">
			<a href="https://developer-dreamer.tistory.com/217" target="_blank" rel="noopener">집중요정 Focus Fairy 🧚‍♀️ © Shimsuyeon</a>
		</div>
	</div>
	<script>
		function reveal(id) {
			var el = document.getElementById(id);
			if (el) {
				el.classList.remove('hidden');
				el.classList.add('reveal');
				setTimeout(function() { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
			}
		}
		function showNextSteps() {
			reveal('step2');
		}
		function startEmojiSetup() {
			document.getElementById('emojiChoice').style.display = 'none';
			reveal('substep1');
		}
		function skipEmoji() {
			document.getElementById('emojiChoice').style.display = 'none';
			showNextSteps();
		}
		function completeSubStep(n) {
			var next = document.getElementById('substep' + (n + 1));
			if (next) {
				reveal('substep' + (n + 1));
			} else {
				showNextSteps();
			}
		}
		function openEmojiPage() {
			var input = document.getElementById('workspaceUrl');
			var error = document.getElementById('urlError');
			var raw = input.value.trim().replace(/\\/+$/, '').replace(/^https?:\\/\\//i, '').replace(/\\.slack\\.com$/i, '');
			if (!raw || !raw.match(/^[a-z0-9][a-z0-9-]*$/i)) {
				input.classList.add('error');
				error.style.display = 'block';
				return;
			}
			input.classList.remove('error');
			error.style.display = 'none';
			window.open('https://' + raw + '.slack.com/customize/emoji', '_blank');
			showNextSteps();
		}
		document.getElementById('workspaceUrl').addEventListener('keydown', function(e) {
			if (e.key === 'Enter') openEmojiPage();
		});
	</script>
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
		return renderResult(true, `${teamName} 워크스페이스에\n집중요정이 설치되었어요!`);
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
	const emojiHtml = success
		? `<img src="${FAIRY_CONFETTI_IMG}" alt="confetti" style="width: 64px; height: 64px;">`
		: '😢';
	const color = success ? '#34D399' : '#F87171';

	const nextSteps = success
		? `<div class="next-steps">
				<p class="next-alert">⚠️ 사용하려는 채널에 봇을 초대해야 정상 동작해요!</p>
				<p class="next-desc">아래 명령어를 해당 채널에 입력해주세요</p>
				<div class="copy-block" onclick="copyCommand(this, '/invite @집중요정')">
					<span class="copy-text">/invite @집중요정</span>
					<span class="copy-btn">복사</span>
				</div>
				<p class="next-desc" style="margin-top: 1.5rem;">초대 후 첫 집중을 시작해보세요</p>
				<div class="copy-block" onclick="copyCommand(this, '/start')">
					<span class="copy-text">/start</span>
					<span class="copy-btn">복사</span>
				</div>
			</div>
			<script>
				function copyCommand(el, text) {
					navigator.clipboard.writeText(text);
					var btn = el.querySelector('.copy-btn');
					btn.textContent = '복사됨!';
					btn.style.color = '#34D399';
					setTimeout(function() { btn.textContent = '복사'; btn.style.color = ''; }, 1500);
				}
			</script>`
		: `<p class="retry">다시 시도해주세요.</p>`;

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
			padding: 2rem 1rem;
		}
		.card {
			background: rgba(255, 255, 255, 0.05);
			border: 1px solid ${color}44;
			border-radius: 16px;
			padding: 2.5rem;
			max-width: 460px;
			text-align: center;
		}
		.emoji { font-size: 3rem; margin-bottom: 1rem; }
		h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: ${color}; white-space: pre-line; }
		.retry { color: rgba(255, 255, 255, 0.6); line-height: 1.6; }

		.next-steps {
			text-align: center;
			margin-top: 0.5rem;
		}
		.next-alert {
			font-size: 0.9rem;
			color: #FBBF24;
			font-weight: 600;
			margin-bottom: 0.7rem;
		}
		.next-desc {
			font-size: 0.85rem;
			color: rgba(255, 255, 255, 0.5);
			margin-bottom: 0.7rem;
		}
		.copy-block {
			display: flex;
			align-items: center;
			justify-content: space-between;
			background: rgba(255, 255, 255, 0.08);
			border: 1px solid rgba(167, 139, 250, 0.3);
			border-radius: 8px;
			padding: 12px 16px;
			cursor: pointer;
			transition: all 0.2s ease;
		}
		.copy-block:hover {
			background: rgba(167, 139, 250, 0.1);
		}
		.copy-text {
			font-family: 'SF Mono', 'Consolas', monospace;
			font-size: 0.95rem;
			color: #a78bfa;
			font-weight: 600;
		}
		.copy-btn {
			font-size: 0.75rem;
			color: rgba(255, 255, 255, 0.4);
			transition: color 0.2s ease;
		}
	</style>
</head>
<body>
	<div class="card">
		<div class="emoji">${emojiHtml}</div>
		<h1>${message}</h1>
		${nextSteps}
	</div>
</body>
</html>`;

	return new Response(html, {
		status: success ? 200 : 400,
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}
