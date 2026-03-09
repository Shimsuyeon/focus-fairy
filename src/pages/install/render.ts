import { WITHOUT_EMOJI_IMG, WITH_EMOJI_IMG, FAIRY_CONFETTI_IMG, FAIRY_THUMBNAIL_IMG } from './images';
import { installPageStyles, resultPageStyles } from './styles';

const EMOJI_DOWNLOAD_URL = 'https://github.com/Shimsuyeon/focus-fairy/raw/main/assets/emojis/focus-fairy-emojis.zip';
const EMOJI_EXTENSION_URL = 'https://chromewebstore.google.com/detail/neutral-face-emoji-tools/anchoacphlfbdomdlomnbbfhcmcdmjej';

export function renderInstallPage(slackAuthUrl: string): string {
	return `<!DOCTYPE html>
<html lang="ko">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>집중요정 설치 가이드 | Focus Fairy</title>
	<style>${installPageStyles}</style>
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
					<div class="workspace-hint">슬랙 좌측 상단 워크스페이스 이름 클릭 → <code>xxx.slack.com</code>에서 xxx 부분 입력</div>
					<input type="text" class="workspace-input" id="workspaceUrl" placeholder="myteam" />
					<div class="workspace-error" id="urlError">워크스페이스 이름을 입력해주세요</div>
					<div class="workspace-hint">열린 페이지에서 다운받은 이미지를 드래그 앤 드롭하세요</div>
					<div class="workspace-hint">💡 드래그 앤 드롭 영역이 안 보이나요?<br>→ <strong>이모지 추가</strong> 버튼으로 1개를 먼저 등록하면 나타나요!</div>
					<button class="action-btn" onclick="openEmojiPage()">이모지 등록 페이지 열기 →</button>
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
}

export function renderResultPage(success: boolean, message: string): string {
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

	return `<!DOCTYPE html>
<html lang="ko">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${success ? '설치 완료' : '설치 실패'} | Focus Fairy</title>
	<style>${resultPageStyles(color)}</style>
</head>
<body>
	<div class="card">
		<div class="emoji">${emojiHtml}</div>
		<h1>${message}</h1>
		${nextSteps}
	</div>
</body>
</html>`;
}
