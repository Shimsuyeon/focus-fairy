/**
 * 모바일 웹앱(/app)에서 익스텐션 팝업 코드(api.js, panel.js, stats.js)를 그대로 돌리기 위한 chrome.* 대체.
 * 팝업 코드가 쓰는 건 chrome.storage.local (get / set / remove) 과 chrome.storage.onChanged 뿐이라 localStorage로 흉내 낸다.
 * 모듈보다 먼저 일반 <script>로 읽혀야 한다.
 */

(() => {
	const PREFIX = 'ff:';
	const listeners = new Set();

	function read(key) {
		try {
			const raw = localStorage.getItem(PREFIX + key);
			return raw === null ? undefined : JSON.parse(raw);
		} catch {
			return undefined;
		}
	}

	function write(key, value) {
		try {
			if (value === undefined) localStorage.removeItem(PREFIX + key);
			else localStorage.setItem(PREFIX + key, JSON.stringify(value));
		} catch {
			// 저장 공간을 못 쓰는 환경(사생활 보호 모드 등) — 이번 화면에서만 동작
		}
	}

	function allKeys() {
		const keys = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(PREFIX)) keys.push(key.slice(PREFIX.length));
		}
		return keys;
	}

	/** chrome처럼 저장이 끝난 뒤 비동기로 알린다 */
	function emit(changes) {
		if (!Object.keys(changes).length) return;
		setTimeout(() => {
			for (const listener of listeners) {
				try {
					listener(changes, 'local');
				} catch (err) {
					console.error(err);
				}
			}
		});
	}

	const local = {
		async get(keys) {
			const defaults = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
			const list = keys == null ? allKeys() : typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
			const result = {};
			for (const key of list) {
				const value = read(key);
				if (value !== undefined) result[key] = value;
				else if (key in defaults) result[key] = defaults[key];
			}
			return result;
		},
		async set(items) {
			const changes = {};
			for (const [key, newValue] of Object.entries(items)) {
				changes[key] = { oldValue: read(key), newValue };
				write(key, newValue);
			}
			emit(changes);
		},
		async remove(keys) {
			const changes = {};
			for (const key of typeof keys === 'string' ? [keys] : keys) {
				const oldValue = read(key);
				if (oldValue === undefined) continue;
				changes[key] = { oldValue };
				write(key, undefined);
			}
			emit(changes);
		},
	};

	// 같은 앱을 다른 탭에서 연 경우
	window.addEventListener('storage', (e) => {
		if (!e.key || !e.key.startsWith(PREFIX)) return;
		const parse = (raw) => {
			try {
				return raw === null ? undefined : JSON.parse(raw);
			} catch {
				return undefined;
			}
		};
		emit({ [e.key.slice(PREFIX.length)]: { oldValue: parse(e.oldValue), newValue: parse(e.newValue) } });
	});

	const storage = { local, onChanged: { addListener: (fn) => listeners.add(fn) } };
	try {
		window.chrome = { storage };
	} catch {
		// 크롬 브라우저의 window.chrome 을 못 바꾸면 storage만 붙인다
	}
	if (window.chrome.storage !== storage) window.chrome.storage = storage;

	window.FF_DEFAULT_SERVER = location.origin;
	document.documentElement.classList.add('app');
})();
