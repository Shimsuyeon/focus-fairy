/**
 * 모바일 웹앱(/app) 정적 파일 만들기 — wrangler.jsonc 의 build.command 로 deploy · dev 때 자동 실행
 *
 * 익스텐션 팝업 코드를 그대로 쓴다. dist/web/app/ 에
 * - extension/ 의 api.js · panel.js · stats.js · CSS · 아이콘
 * - web/app/ 의 shim.js (chrome.storage 대체) · app.js (진입점) · app.css (폰 한 열) · pip.js/css (📌 띄우기) · manifest · 홈 화면 아이콘
 * - extension/popup.html 을 웹앱용으로 고친 index.html
 * 을 모은다. Worker가 dist/web 을 정적 파일로 서빙한다.
 */

import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extension = join(root, 'extension');
const outDir = join(root, 'dist', 'web');
const app = join(outDir, 'app');

const SHARED = ['api.js', 'panel.js', 'stats.js', 'common.css', 'panel.css', 'stats.css'];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(app, 'icons'), { recursive: true });

for (const file of SHARED) copyFileSync(join(extension, file), join(app, file));
copyFileSync(join(extension, 'icons', 'icon32.png'), join(app, 'icons', 'icon32.png'));
cpSync(join(root, 'web', 'app'), app, { recursive: true, filter: (path) => !path.endsWith('.DS_Store') });

function replaceOnce(text, from, to) {
	if (!text.includes(from)) throw new Error(`popup.html 에서 찾지 못함: ${from}`);
	return text.replace(from, to);
}

let html = readFileSync(join(extension, 'popup.html'), 'utf8');
html = replaceOnce(html, '<html lang="ko">', '<html lang="ko" class="app">');
html = replaceOnce(
	html,
	'<meta name="viewport" content="width=device-width, initial-scale=1" />',
	[
		'<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
		'<meta name="referrer" content="no-referrer" />',
		'<meta name="theme-color" content="#f7f6fb" media="(prefers-color-scheme: light)" />',
		'<meta name="theme-color" content="#1e1d26" media="(prefers-color-scheme: dark)" />',
		'<meta name="apple-mobile-web-app-capable" content="yes" />',
		'<meta name="apple-mobile-web-app-title" content="집중요정" />',
		'<link rel="manifest" href="manifest.webmanifest" />',
		'<link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />',
		'<link rel="icon" href="icons/icon-192.png" />',
	].join('\n\t\t')
);
html = replaceOnce(html, '<link rel="stylesheet" href="stats.css" />', '<link rel="stylesheet" href="stats.css" />\n\t\t<link rel="stylesheet" href="app.css" />');
html = replaceOnce(
	html,
	'<script type="module" src="panel.js"></script>\n\t\t<script type="module" src="stats.js"></script>',
	'<script src="shim.js"></script>\n\t\t<script type="module" src="app.js"></script>'
);
writeFileSync(join(app, 'index.html'), html);

// 토큰이 브라우저에 저장되므로 외부 스크립트·연결을 막는다
writeFileSync(
	join(outDir, '_headers'),
	`/app/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Cache-Control: no-cache
`
);

console.log('✅ dist/web/app');
