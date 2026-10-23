/**
 * 익스텐션 연결 페이지 — GET /extension/connect#code=...
 * Slack 모달의 '익스텐션에 연결하기' 버튼이 이 페이지를 연다.
 * 실제 연결은 익스텐션의 content script(extension/connect.js)가 #code를 읽어 처리하고 이 페이지의 상태 문구를 바꾼다.
 * 익스텐션이 없으면 몇 초 뒤 설치 안내를 보여준다.
 */

const DOCS_URL = 'https://focus-fairy-docs.pages.dev/extension/';
const STORE_URL = 'https://chromewebstore.google.com/detail/hoaigcnbolebecjdidhnhkjdmohhiclp';

export function handleExtensionConnectPage(): Response {
	const html = `<!doctype html>
<html lang="ko">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="robots" content="noindex">
	<meta name="referrer" content="no-referrer">
	<title>집중요정 익스텐션 연결</title>
	<style>
		:root { color-scheme: light dark; --bg: #f7f6fb; --card: #fff; --fg: #1f1d2b; --muted: #6b6880; --accent: #6d4aff; --ok: #22a06b; --err: #e5484d; }
		@media (prefers-color-scheme: dark) { :root { --bg: #15141b; --card: #1e1d26; --fg: #ecebf3; --muted: #a19eb5; --accent: #9b85ff; } }
		body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg);
			font: 15px/1.6 -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Segoe UI', sans-serif; }
		.card { width: min(420px, calc(100vw - 32px)); padding: 32px 28px; border-radius: 20px; background: var(--card); text-align: center;
			box-shadow: 0 8px 32px rgb(0 0 0 / 8%); }
		.fairy { font-size: 44px; }
		h1 { margin: 8px 0 12px; font-size: 20px; }
		#ff-connect-status { margin: 0; color: var(--muted); }
		#ff-connect-status[data-state='done'] { color: var(--ok); font-weight: 600; }
		#ff-connect-status[data-state='error'] { color: var(--err); }
		a { color: var(--accent); }
	</style>
</head>
<body>
	<main class="card">
		<div class="fairy">🧚</div>
		<h1>집중요정 익스텐션 연결</h1>
		<p id="ff-connect-status" data-state="waiting" role="status">익스텐션을 찾는 중이에요…</p>
	</main>
	<script>
		setTimeout(function () {
			var status = document.getElementById('ff-connect-status');
			if (status.dataset.state !== 'waiting') return;
			status.dataset.state = 'error';
			status.innerHTML = '집중요정 크롬 익스텐션을 찾지 못했어요.<br><a href="${STORE_URL}">크롬 웹스토어에서 설치</a>한 뒤 Slack에서 다시 연결해주세요.<br>이미 설치했다면 <b>chrome://extensions</b> 에서 새로고침한 뒤 이 페이지를 다시 열어주세요.<br><a href="${DOCS_URL}">설치 가이드 보기</a>';
		}, 3000);
	</script>
</body>
</html>`;

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
		},
	});
}
