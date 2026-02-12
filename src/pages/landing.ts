/**
 * 집중의 나무 (Focus Tree) 랜딩 페이지
 * 팀 집중 데이터를 시각화하는 신비로운 숲 테마 페이지
 */

import type { Session } from '../types';

// ============================================
// 상수 정의
// ============================================

/** 열매 색상 팔레트 (신비로운 색상들) */
const FRUIT_COLORS = [
	'#FF6B9D', // 핑크
	'#C084FC', // 보라
	'#60A5FA', // 하늘
	'#34D399', // 민트
	'#FBBF24', // 금색
	'#F472B6', // 로즈
	'#A78BFA', // 라벤더
	'#2DD4BF', // 청록
] as const;

/** 반딧불이 개수 */
const FIREFLY_COUNT = 20;

/** 열매 크기 범위 (px) */
const FRUIT_SIZE = { min: 20, max: 50 } as const;

// ============================================
// 타입 정의
// ============================================

interface TeamMemberStats {
	userId: string;
	weeklyDuration: number; // ms
	isActive: boolean;
}

interface FruitData extends TeamMemberStats {
	size: number;
	glowIntensity: number;
	color: string;
	x: number;
	y: number;
}

interface FireflyData {
	id: number;
	x: number;
	y: number;
	delay: number;
	duration: number;
}

// ============================================
// 메인 핸들러
// ============================================

/** 랜딩 페이지 핸들러 */
export async function handleLanding(env: Env, teamId: string): Promise<Response> {
	const stats = await collectTeamStats(env, teamId);
	const html = generateFocusTreeHTML(stats);

	return new Response(html, {
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}

// ============================================
// 데이터 수집
// ============================================

/** 팀 통계 수집 (병렬 처리) */
async function collectTeamStats(env: Env, teamId: string): Promise<TeamMemberStats[]> {
	const now = new Date();
	const statsMap = new Map<string, TeamMemberStats>();

	// 최근 7일 날짜 키 생성
	const dateKeys = Array.from({ length: 7 }, (_, i) => {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		return d.toISOString().split('T')[0];
	});

	// 병렬로 KV 읽기
	const [sessionResults, activeData] = await Promise.all([
		Promise.all(dateKeys.map((key) => env.STUDY_KV.get(`${teamId}:sessions:${key}`))),
		env.STUDY_KV.get(`${teamId}:active`),
	]);

	// 세션 데이터 집계
	for (const result of sessionResults) {
		const sessions: Session[] = JSON.parse(result || '[]');
		for (const session of sessions) {
			const existing = statsMap.get(session.userId);
			if (existing) {
				existing.weeklyDuration += session.duration;
			} else {
				statsMap.set(session.userId, {
					userId: session.userId,
					weeklyDuration: session.duration,
					isActive: false,
				});
			}
		}
	}

	// 현재 집중 중인 사용자 표시
	if (activeData) {
		const activeSessions: Record<string, { start: number }> = JSON.parse(activeData);
		for (const userId of Object.keys(activeSessions)) {
			const existing = statsMap.get(userId);
			if (existing) {
				existing.isActive = true;
			} else {
				statsMap.set(userId, { userId, weeklyDuration: 0, isActive: true });
			}
		}
	}

	return Array.from(statsMap.values());
}

// ============================================
// HTML 생성
// ============================================

/** Focus Tree HTML 생성 */
function generateFocusTreeHTML(stats: TeamMemberStats[]): string {
	const fruits = generateFruitData(stats);
	const fireflies = generateFireflyData(FIREFLY_COUNT);
	const totalDuration = stats.reduce((sum, s) => sum + s.weeklyDuration, 0);
	const activeCount = stats.filter((s) => s.isActive).length;

	return `<!DOCTYPE html>
<html lang="ko">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>🧚‍♀️ 집중의 나무 | Focus Fairy</title>
	<style>
		/* ========== CSS 변수 ========== */
		:root {
			/* 색상 */
			--color-bg-top: #0a0a1a;
			--color-bg-mid: #1a1a3a;
			--color-bg-bottom: #0d1f0d;
			--color-primary: #a78bfa;
			--color-tree-dark: #0d330d;
			--color-tree-light: #1a4d1a;
			--color-tree-glow: rgba(74, 222, 128, 0.1);
			--color-trunk-dark: #3d2817;
			--color-trunk-light: #5c3d2e;
			--color-firefly: #fef08a;
			--color-text: rgba(255, 255, 255, 0.7);
			--color-text-dim: rgba(255, 255, 255, 0.5);

			/* 크기 */
			--tree-width: 300px;
			--tree-height: 400px;
			--canopy-size: 250px;
			--trunk-width: 30px;
			--trunk-height: 150px;

			/* 애니메이션 */
			--transition-fast: 0.3s ease;
			--animation-pulse: 4s ease-in-out infinite;
		}

		/* ========== 리셋 & 기본 ========== */
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			min-height: 100vh;
			background: linear-gradient(180deg, var(--color-bg-top) 0%, var(--color-bg-mid) 50%, var(--color-bg-bottom) 100%);
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			font-family: 'Segoe UI', system-ui, sans-serif;
			overflow: hidden;
		}

		/* ========== 레이아웃 ========== */
		.container {
			position: relative;
			width: 100%;
			max-width: 600px;
			height: 80vh;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
		}

		.title {
			color: var(--color-primary);
			font-size: 1.5rem;
			margin-bottom: 2rem;
			text-shadow: 0 0 20px rgba(167, 139, 250, 0.5);
			z-index: 10;
		}

		/* ========== 나무 ========== */
		.tree {
			position: relative;
			width: var(--tree-width);
			height: var(--tree-height);
		}

		.trunk {
			position: absolute;
			bottom: 0;
			left: 50%;
			width: var(--trunk-width);
			height: var(--trunk-height);
			background: linear-gradient(90deg, var(--color-trunk-dark) 0%, var(--color-trunk-light) 50%, var(--color-trunk-dark) 100%);
			border-radius: 5px;
			transform: translateX(-50%);
		}

		.canopy {
			position: absolute;
			bottom: 120px;
			left: 50%;
			width: var(--canopy-size);
			height: var(--canopy-size);
			background: radial-gradient(ellipse at center, var(--color-tree-light) 0%, var(--color-tree-dark) 50%, transparent 70%);
			border-radius: 50%;
			filter: blur(2px);
			transform: translateX(-50%);
		}

		.canopy-glow {
			position: absolute;
			bottom: 100px;
			left: 50%;
			width: 280px;
			height: 280px;
			background: radial-gradient(ellipse at center, var(--color-tree-glow) 0%, transparent 60%);
			border-radius: 50%;
			transform: translateX(-50%);
			will-change: transform, opacity;
			animation: canopyPulse var(--animation-pulse);
		}

		@keyframes canopyPulse {
			0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
			50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
		}

		/* ========== 열매 ========== */
		.fruit {
			position: absolute;
			border-radius: 50%;
			transform: translate(-50%, -50%);
			transition: transform var(--transition-fast);
			will-change: transform, filter;
		}

		.fruit:hover {
			transform: translate(-50%, -50%) scale(1.2);
		}

		.fruit.active {
			animation: fruitPulse 1.5s ease-in-out infinite;
		}

		@keyframes fruitPulse {
			0%, 100% { transform: translate(-50%, -50%) scale(1); filter: brightness(1); }
			50% { transform: translate(-50%, -50%) scale(1.15); filter: brightness(1.3); }
		}

		/* ========== 반딧불이 ========== */
		.firefly {
			position: fixed;
			width: 4px;
			height: 4px;
			background: var(--color-firefly);
			border-radius: 50%;
			box-shadow: 0 0 10px 2px rgba(254, 240, 138, 0.8);
			opacity: 0;
			will-change: transform, opacity;
			animation: fireflyFloat linear infinite;
		}

		@keyframes fireflyFloat {
			0% { opacity: 0; transform: translate(0, 0); }
			10% { opacity: 1; }
			90% { opacity: 1; }
			100% { opacity: 0; transform: translate(30px, -100px); }
		}

		/* ========== 별 배경 ========== */
		.stars {
			position: fixed;
			inset: 0;
			height: 50%;
			background-image: 
				radial-gradient(2px 2px at 20px 30px, white, transparent),
				radial-gradient(2px 2px at 40px 70px, rgba(255,255,255,0.8), transparent),
				radial-gradient(1px 1px at 90px 40px, white, transparent),
				radial-gradient(2px 2px at 160px 120px, rgba(255,255,255,0.6), transparent),
				radial-gradient(1px 1px at 230px 80px, white, transparent),
				radial-gradient(2px 2px at 300px 150px, rgba(255,255,255,0.7), transparent),
				radial-gradient(1px 1px at 350px 60px, white, transparent),
				radial-gradient(2px 2px at 420px 180px, rgba(255,255,255,0.5), transparent);
			background-size: 450px 200px;
			pointer-events: none;
			will-change: opacity;
			animation: twinkle 5s ease-in-out infinite;
		}

		@keyframes twinkle {
			0%, 100% { opacity: 0.5; }
			50% { opacity: 1; }
		}

		/* ========== 통계 & 푸터 ========== */
		.stats {
			margin-top: 2rem;
			color: var(--color-text);
			font-size: 0.9rem;
			text-align: center;
			z-index: 10;
		}

		.stats strong {
			color: var(--color-primary);
		}

		.info {
			position: fixed;
			bottom: 20px;
			color: var(--color-text-dim);
			font-size: 0.8rem;
			text-align: center;
		}
	</style>
</head>
<body>
	<div class="stars"></div>
	
	<div class="container">
		<h1 class="title">🧚‍♀️ 집중의 나무</h1>
		
		<div class="tree">
			<div class="canopy-glow"></div>
			<div class="canopy"></div>
			<div class="trunk"></div>
			${fruits.map(renderFruit).join('')}
		</div>

		<div class="stats">
			<strong>${stats.length}</strong>명의 요정 | 
			이번 주 총 <strong>${formatDuration(totalDuration)}</strong> 집중
			${activeCount > 0 ? ` | 🔥 ${activeCount}명 집중 중` : ''}
		</div>
	</div>

	${fireflies.map(renderFirefly).join('')}

	<div class="info">집중요정 Focus Fairy 🧚‍♀️</div>
</body>
</html>`;
}

// ============================================
// 데이터 생성 헬퍼
// ============================================

/** 열매 데이터 생성 */
function generateFruitData(stats: TeamMemberStats[]): FruitData[] {
	const maxDuration = Math.max(...stats.map((s) => s.weeklyDuration), 1);

	return stats.map((stat, idx) => {
		const normalized = Math.max(0.3, stat.weeklyDuration / maxDuration);
		const size = FRUIT_SIZE.min + normalized * (FRUIT_SIZE.max - FRUIT_SIZE.min);
		const glowIntensity = normalized * 20;
		const color = FRUIT_COLORS[idx % FRUIT_COLORS.length];

		// 원형 배치
		const angle = (idx / stats.length) * Math.PI * 2 - Math.PI / 2;
		const radius = 80 + Math.random() * 40;

		return {
			...stat,
			size,
			glowIntensity,
			color,
			x: 50 + Math.cos(angle) * (radius / 3),
			y: 45 + Math.sin(angle) * (radius / 5),
		};
	});
}

/** 반딧불이 데이터 생성 */
function generateFireflyData(count: number): FireflyData[] {
	return Array.from({ length: count }, (_, id) => ({
		id,
		x: Math.random() * 100,
		y: Math.random() * 100,
		delay: Math.random() * 5,
		duration: 3 + Math.random() * 4,
	}));
}

// ============================================
// 렌더링 헬퍼
// ============================================

/** 열매 HTML 렌더링 */
function renderFruit(fruit: FruitData): string {
	const activeClass = fruit.isActive ? 'active' : '';
	const title = `${formatDuration(fruit.weeklyDuration)} 집중${fruit.isActive ? ' (집중 중!)' : ''}`;

	return `<div 
		class="fruit ${activeClass}"
		style="
			left: ${fruit.x}%;
			top: ${fruit.y}%;
			width: ${fruit.size}px;
			height: ${fruit.size}px;
			background: radial-gradient(circle at 30% 30%, ${fruit.color}, ${fruit.color}88);
			box-shadow: 0 0 ${fruit.glowIntensity}px ${fruit.glowIntensity / 2}px ${fruit.color}88;
		"
		title="${title}"
	></div>`;
}

/** 반딧불이 HTML 렌더링 */
function renderFirefly(firefly: FireflyData): string {
	return `<div 
		class="firefly" 
		style="
			left: ${firefly.x}%;
			top: ${firefly.y}%;
			animation-delay: ${firefly.delay}s;
			animation-duration: ${firefly.duration}s;
		"
	></div>`;
}

// ============================================
// 유틸리티
// ============================================

/** 시간 포맷 (ms → 한글) */
function formatDuration(ms: number): string {
	const totalMinutes = Math.floor(ms / 60000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours > 0) {
		return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
	}
	return `${minutes}분`;
}
