// 스토어 스크린샷용 가짜 데이터 + chrome.* 대역 (실제 기록 아님)
(() => {
	const scene = Number(new URLSearchParams(location.search).get('scene') || 1);
	// 화면에 보이는 시각을 오후로 고정 (2026-10-22 15:40 KST)
	const realStart = Date.now();
	const FAKE_NOW = Date.parse('2026-10-22T15:40:00+09:00');
	Date.now = () => FAKE_NOW + (performance.now() | 0);
	const now = Date.now();
	const H = 3600e3, M = 60e3;
	const TAGS = [
		{ value: 'exercise', label: '운동' }, { value: 'reading', label: '독서' }, { value: 'side', label: '사이드' },
		{ value: 'study', label: '공부' }, { value: 'etc', label: '기타' },
	];
	// 10월 1~22일 일별 집중 시간(시간)
	const hoursA = [1.5, 2.8, 0, 3.2, 4.1, 0, 2.2, 1.0, 3.5, 2.6, 0, 1.8, 3.9, 4.6, 2.1, 0, 0, 3.3, 2.7, 1.9, 3.1, 0.9];
	const hoursB = [2.5, 3.1, 1.2, 0, 4.4, 3.8, 2.9, 3.6, 0, 2.2, 3.4, 4.0, 2.8, 3.3, 0, 2.6, 3.9, 4.2, 2.4, 3.0, 2.7, 1.6];
	const hours = scene === 3 ? hoursB : hoursA;
	const days = Array.from({ length: 31 }, (_, i) => {
		const date = `2026-10-${String(i + 1).padStart(2, '0')}`;
		const h = i < 22 ? hours[i] : 0;
		return { date, ms: Math.round(h * H), count: h ? Math.ceil(h / 1.5) : 0 };
	});
	const totalMs = days.reduce((s, d) => s + d.ms, 0);
	const stats = {
		ok: true, month: '2026-10', today: '2026-10-22', days, totalMs,
		goalMs: scene === 3 ? 50 * H : 70 * H,
		byTag: scene === 3
			? { study: 24 * H, side: 18 * H, reading: 9 * H, exercise: 6 * H, etc: 3 * H }
			: { study: 17 * H, side: 12 * H, reading: 6 * H, exercise: 4 * H, etc: 2 * H },
	};
	const focusing = scene !== 2;
	const session = focusing
		? { state: 'focusing', startTime: now - 83 * M - 12e3, tag: scene === 3 ? 'side' : 'study', label: scene === 3 ? '' : '알고리즘 3문제 풀기\nPR 리뷰 남기기', totalPauseDuration: 0 }
		: { state: 'idle' };
	const sessionRes = {
		ok: true, workspace: { id: 'T1', name: scene === 3 ? '사이드 프로젝트 모임' : '모각코 스터디' }, user: { id: 'U_ME', name: '하늘' },
		session, today: { totalMs: Math.round(0.9 * H), sessionCount: 1 },
		channels: [{ id: 'C1', name: '#모각코' }, { id: 'C2', name: '#오늘의-집중' }], defaultChannelId: 'C1', tags: TAGS, serverTime: now,
	};
	const live = (min, tag, paused) => ({ state: paused ? 'paused' : 'focusing', tag, startTime: now - min * M, pausedAt: paused ? now - 8 * M : undefined, totalPauseDuration: 0 });
	const team = {
		ok: true,
		members: [
			{ id: 'U07JIWOO8', name: '지우', isMe: false, todayMs: 55 * M, ...live(126, 'study') },
			{ id: 'U_ME', name: '하늘', isMe: true, todayMs: Math.round(0.9 * H), ...(focusing ? live(83, session.tag) : { state: 'idle' }) },
			{ id: 'U03MINSUQ', name: '민수', isMe: false, todayMs: 0, ...live(48, 'side', true) },
			{ id: 'U05SEOYEON', name: '서연', isMe: false, todayMs: 2 * H + 10 * M, state: 'idle' },
			{ id: 'U09HAJUNX', name: '하준', isMe: false, todayMs: 35 * M, state: 'idle' },
		],
	};
	const store = {
		accounts: [
			{ id: 'a1', serverUrl: 'https://preview', token: 'ff_x', teamName: sessionRes.workspace.name, userName: '하늘', teamId: 'T1', userId: 'U_ME' },
			{ id: 'a2', serverUrl: 'https://preview', token: 'ff_y', teamName: '회사 동아리', userName: '하늘', teamId: 'T2', userId: 'U9' },
		],
		activeAccountId: 'a1',
		sessions: { a2: { state: 'idle' } },
	};
	const clone = (v) => JSON.parse(JSON.stringify(v));
	window.chrome = {
		storage: {
			local: {
				async get(keys) {
					const list = typeof keys === 'string' ? [keys] : keys;
					return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, clone(store[k])]));
				},
				async set(obj) { Object.assign(store, clone(obj)); },
				async remove() {},
			},
			onChanged: { addListener() {} },
		},
		tabs: { create() {} },
		runtime: { getURL: (p) => p, id: 'preview' },
	};
	window.fetch = async (url) => {
		const path = new URL(url).pathname;
		const body = path.startsWith('/api/stats') ? stats : path.startsWith('/api/team') ? team : sessionRes;
		return new Response(JSON.stringify(body), { status: 200 });
	};
})();
