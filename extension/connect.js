/**
 * 연결 페이지(/extension/connect#code=...)에 들어가는 content script.
 * URL의 일회용 코드를 백그라운드에 넘겨 워크스페이스를 연결하고, 페이지의 상태 문구를 바꾼다.
 */

(async () => {
	const status = document.getElementById('ff-connect-status');
	if (!status) return;

	const code = new URLSearchParams(location.hash.slice(1)).get('code');
	// 코드가 주소창·방문 기록에 남지 않게
	history.replaceState(null, '', location.pathname);

	const show = (state, text) => {
		status.dataset.state = state;
		status.textContent = text;
	};

	if (!code) {
		show('error', '연결 코드가 없어요. Slack에서 연결 버튼을 다시 눌러주세요.');
		return;
	}

	show('connecting', '연결하는 중이에요…');
	try {
		const result = await chrome.runtime.sendMessage({ type: 'connect', code });
		if (result?.ok) {
			show('done', `✅ ${result.teamName} 워크스페이스에 연결됐어요! 툴바의 집중요정 아이콘을 눌러보세요. 이 탭은 닫아도 돼요.`);
		} else {
			show('error', result?.message || '연결하지 못했어요. Slack에서 다시 시도해주세요.');
		}
	} catch {
		show('error', '익스텐션과 통신하지 못했어요. chrome://extensions 에서 집중요정을 새로고침한 뒤 Slack에서 다시 시도해주세요.');
	}
})();
