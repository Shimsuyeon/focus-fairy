/**
 * 모바일 웹앱(/app) 진입점.
 * 1. Slack '웹앱 열기' 링크(/app/#code=...)로 들어오면 연결
 *    — 아이폰 사파리는 홈 화면 앱과 저장 공간이 따로라 바로 연결하지 않고, 홈 화면 앱에서 입력할 코드를 보여준다.
 * 2. 홈 화면 추가 안내
 * 3. 익스텐션 팝업 코드(panel.js, stats.js)를 그대로 불러온다 (chrome.* 는 shim.js)
 */

import { connectWithCode } from './api.js';

const DISMISS_KEY = 'ff-install-dismissed';

// ---------- 홈 화면 추가 ----------

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
	e.preventDefault(); // 크롬 기본 미니 바 대신 안내 카드의 버튼으로
	deferredPrompt = e;
	renderInstall();
});
window.addEventListener('appinstalled', () => {
	deferredPrompt = null;
	renderInstall();
});

function isStandalone() {
	return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/** installed | prompt | ios | ios-other | android | desktop */
function installWay() {
	if (isStandalone()) return 'installed';
	if (deferredPrompt) return 'prompt';
	const ua = navigator.userAgent;
	const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
	if (ios) return /CriOS|FxiOS|EdgiOS|KAKAOTALK|Instagram|FBAN|FBAV|NAVER|Line\//.test(ua) ? 'ios-other' : 'ios';
	if (/Android/.test(ua)) return 'android';
	return 'desktop';
}

const isIos = () => ['ios', 'ios-other'].includes(installWay());

function dismissed() {
	try {
		return localStorage.getItem(DISMISS_KEY) === '1';
	} catch {
		return false;
	}
}

function card(id) {
	let el = document.getElementById(id);
	if (!el) {
		el = document.createElement('section');
		el.id = id;
		el.className = 'app-card';
		document.querySelector('.panel').prepend(el);
	}
	return el;
}

function html(strings, ...values) {
	const escape = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
	return strings.reduce((out, s, i) => out + s + (i < values.length ? escape(values[i]) : ''), '');
}

function renderInstall() {
	const way = installWay();
	const el = card('app-install');
	if (way === 'installed' || way === 'desktop' || dismissed()) {
		el.hidden = true;
		return;
	}
	el.hidden = false;

	const steps = {
		prompt: '홈 화면에 추가하면 앱처럼 바로 열 수 있어요.',
		android: '크롬 오른쪽 위 <b>⋮ → 홈 화면에 추가</b> (또는 <b>앱 설치</b>)를 누르면 앱처럼 쓸 수 있어요.',
		ios: 'Safari 아래쪽 <b>공유 버튼(⬆︎) → 홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있어요.',
		'ios-other': '홈 화면에 추가하려면 <b>Safari</b>에서 열어주세요. Slack 안에서 열렸다면 오른쪽 위 메뉴에서 <b>Safari로 열기</b>를 눌러주세요.',
	};
	el.innerHTML = `
		<p><b>📲 홈 화면에 추가</b></p>
		<p class="hint">${steps[way]}</p>
		<div class="row">
			${way === 'prompt' ? '<button id="app-install-btn" class="primary">홈 화면에 추가</button>' : ''}
			<button id="app-install-close" class="link">닫기</button>
		</div>`;

	document.getElementById('app-install-btn')?.addEventListener('click', async () => {
		const e = deferredPrompt;
		deferredPrompt = null; // 한 번만 쓸 수 있다
		await e?.prompt();
		renderInstall();
	});
	document.getElementById('app-install-close').addEventListener('click', () => {
		try {
			localStorage.setItem(DISMISS_KEY, '1');
		} catch {
			// 무시
		}
		el.hidden = true;
	});
}

// ---------- 연결 링크 ----------

/** 주소의 #code=... 를 읽고 주소창·방문 기록에서 지운다 */
function takeCodeFromUrl() {
	const code = new URLSearchParams(location.hash.slice(1)).get('code');
	if (location.hash) history.replaceState(null, '', location.pathname + location.search);
	return code;
}

function showMessage(text, state = 'error') {
	const el = card('app-message');
	el.dataset.state = state;
	el.textContent = text;
	el.hidden = false;
}

async function connect(code) {
	const result = await connectWithCode(code, location.origin);
	if (result.ok) showMessage(`✅ ${result.teamName} 워크스페이스에 연결됐어요!`, 'done');
	else showMessage(result.message);
	return result.ok;
}

/** 아이폰 사파리: 홈 화면 앱에서 입력할 코드를 보여준다 (사파리에서 바로 쓰고 싶으면 연결 버튼) */
function showCodeForHomeScreen(code) {
	const pretty = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
	const el = card('app-pending');
	el.innerHTML = html`
		<p><b>📱 아이폰은 홈 화면 앱에서 연결해요</b></p>
		<p class="hint">홈 화면 앱은 Safari와 저장 공간이 따로라서, 홈 화면에 추가한 뒤 그 앱을 열고 아래 코드를 입력해주세요. (10분 안에, 한 번만)</p>
		<p class="code">${pretty}</p>
		<div class="row"><button id="app-connect-here" class="link">홈 화면에 추가하지 않고 Safari에서 쓸래요</button></div>`;
	document.getElementById('app-connect-here').addEventListener('click', async (e) => {
		e.currentTarget.disabled = true;
		el.hidden = true;
		if (await connect(code)) location.reload();
	});
}

// ---------- 시작 ----------

renderInstall();

const code = takeCodeFromUrl();
if (code && isIos() && !isStandalone()) showCodeForHomeScreen(code);
else if (code) await connect(code);

await import('./panel.js');
await import('./stats.js');
