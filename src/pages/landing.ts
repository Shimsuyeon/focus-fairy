/**
 * 집중의 나무 (Focus Tree) 랜딩 페이지
 * 팀 집중 데이터를 시각화하는 신비로운 숲 테마 페이지
 */

import type { Session } from '../types';

interface TeamMemberStats {
	userId: string;
	weeklyDuration: number; // ms
	isActive: boolean;
}

/** 랜딩 페이지 핸들러 */
export async function handleLanding(env: Env, teamId: string): Promise<Response> {
	// 팀 데이터 수집
	const stats = await collectTeamStats(env, teamId);

	// HTML 생성
	const html = generateFocusTreeHTML(stats);

	return new Response(html, {
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}

/** 팀 통계 수집 */
async function collectTeamStats(env: Env, teamId: string): Promise<TeamMemberStats[]> {
	const now = new Date();
	const statsMap = new Map<string, TeamMemberStats>();

	// 이번 주 세션 수집 (최근 7일)
	const dateKeys: string[] = [];
	for (let i = 0; i < 7; i++) {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		dateKeys.push(d.toISOString().split('T')[0]);
	}

	// 병렬로 KV 읽기
	const sessionResults = await Promise.all(dateKeys.map((key) => env.STUDY_KV.get(`${teamId}:sessions:${key}`)));

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

	// 현재 집중 중인 사용자 확인
	const activeData = await env.STUDY_KV.get(`${teamId}:active`);
	if (activeData) {
		const activeSessions: Record<string, { start: number }> = JSON.parse(activeData);
		for (const userId of Object.keys(activeSessions)) {
			const existing = statsMap.get(userId);
			if (existing) {
				existing.isActive = true;
			} else {
				statsMap.set(userId, {
					userId,
					weeklyDuration: 0,
					isActive: true,
				});
			}
		}
	}

	return Array.from(statsMap.values());
}

/** Focus Tree HTML 생성 */
function generateFocusTreeHTML(stats: TeamMemberStats[]): string {
	// 열매 색상 팔레트 (신비로운 색상들)
	const fruitColors = [
		'#FF6B9D', // 핑크
		'#C084FC', // 보라
		'#60A5FA', // 하늘
		'#34D399', // 민트
		'#FBBF24', // 금색
		'#F472B6', // 로즈
		'#A78BFA', // 라벤더
		'#2DD4BF', // 청록
	];

	// 최대 집중 시간 (정규화용)
	const maxDuration = Math.max(...stats.map((s) => s.weeklyDuration), 1);

	// 열매 데이터 생성
	const fruits = stats.map((stat, idx) => {
		const normalizedSize = Math.max(0.3, stat.weeklyDuration / maxDuration);
		const size = 20 + normalizedSize * 30; // 20px ~ 50px
		const glowIntensity = normalizedSize * 20; // 글로우 강도
		const color = fruitColors[idx % fruitColors.length];

		// 나무 주변에 배치 (원형)
		const angle = (idx / stats.length) * Math.PI * 2 - Math.PI / 2;
		const radius = 80 + Math.random() * 40;
		const x = 50 + Math.cos(angle) * (radius / 3);
		const y = 45 + Math.sin(angle) * (radius / 5);

		return {
			...stat,
			size,
			glowIntensity,
			color,
			x,
			y,
		};
	});

	// 반딧불이 생성 (20개)
	const fireflies = Array.from({ length: 20 }, (_, i) => ({
		id: i,
		x: Math.random() * 100,
		y: Math.random() * 100,
		delay: Math.random() * 5,
		duration: 3 + Math.random() * 4,
	}));

	return `<!DOCTYPE html>
<html lang="ko">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>🧚‍♀️ 집중의 나무 | Focus Fairy</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			min-height: 100vh;
			background: linear-gradient(180deg, #0a0a1a 0%, #1a1a3a 50%, #0d1f0d 100%);
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			font-family: 'Segoe UI', system-ui, sans-serif;
			overflow: hidden;
		}

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
			color: #a78bfa;
			font-size: 1.5rem;
			margin-bottom: 2rem;
			text-shadow: 0 0 20px rgba(167, 139, 250, 0.5);
			z-index: 10;
		}

		/* 나무 */
		.tree {
			position: relative;
			width: 300px;
			height: 400px;
		}

		.trunk {
			position: absolute;
			bottom: 0;
			left: 50%;
			transform: translateX(-50%);
			width: 30px;
			height: 150px;
			background: linear-gradient(90deg, #3d2817 0%, #5c3d2e 50%, #3d2817 100%);
			border-radius: 5px;
		}

		.canopy {
			position: absolute;
			bottom: 120px;
			left: 50%;
			transform: translateX(-50%);
			width: 250px;
			height: 250px;
			background: radial-gradient(ellipse at center, #1a4d1a 0%, #0d330d 50%, transparent 70%);
			border-radius: 50%;
			filter: blur(2px);
		}

		.canopy-glow {
			position: absolute;
			bottom: 100px;
			left: 50%;
			transform: translateX(-50%);
			width: 280px;
			height: 280px;
			background: radial-gradient(ellipse at center, rgba(74, 222, 128, 0.1) 0%, transparent 60%);
			border-radius: 50%;
			animation: canopyPulse 4s ease-in-out infinite;
		}

		@keyframes canopyPulse {
			0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
			50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
		}

		/* 열매 */
		.fruit {
			position: absolute;
			border-radius: 50%;
			transform: translate(-50%, -50%);
			transition: all 0.3s ease;
		}

		.fruit:hover {
			transform: translate(-50%, -50%) scale(1.2);
		}

		.fruit.active {
			animation: fruitPulse 1.5s ease-in-out infinite;
		}

		@keyframes fruitPulse {
			0%, 100% { 
				transform: translate(-50%, -50%) scale(1);
				filter: brightness(1);
			}
			50% { 
				transform: translate(-50%, -50%) scale(1.15);
				filter: brightness(1.3);
			}
		}

		/* 반딧불이 */
		.firefly {
			position: fixed;
			width: 4px;
			height: 4px;
			background: #fef08a;
			border-radius: 50%;
			box-shadow: 0 0 10px 2px rgba(254, 240, 138, 0.8);
			animation: fireflyFloat linear infinite;
			opacity: 0;
		}

		@keyframes fireflyFloat {
			0% {
				opacity: 0;
				transform: translateY(0) translateX(0);
			}
			10% {
				opacity: 1;
			}
			90% {
				opacity: 1;
			}
			100% {
				opacity: 0;
				transform: translateY(-100px) translateX(30px);
			}
		}

		/* 하단 정보 */
		.info {
			position: fixed;
			bottom: 20px;
			color: rgba(255, 255, 255, 0.5);
			font-size: 0.8rem;
			text-align: center;
		}

		.stats {
			margin-top: 2rem;
			color: rgba(255, 255, 255, 0.7);
			font-size: 0.9rem;
			text-align: center;
			z-index: 10;
		}

		.stats strong {
			color: #a78bfa;
		}

		/* 별 배경 */
		.stars {
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
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
			animation: twinkle 5s ease-in-out infinite;
			pointer-events: none;
		}

		@keyframes twinkle {
			0%, 100% { opacity: 0.5; }
			50% { opacity: 1; }
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
			
			${fruits
				.map(
					(fruit) => `
				<div 
					class="fruit ${fruit.isActive ? 'active' : ''}"
					style="
						left: ${fruit.x}%;
						top: ${fruit.y}%;
						width: ${fruit.size}px;
						height: ${fruit.size}px;
						background: radial-gradient(circle at 30% 30%, ${fruit.color}, ${fruit.color}88);
						box-shadow: 0 0 ${fruit.glowIntensity}px ${fruit.glowIntensity / 2}px ${fruit.color}88;
					"
					title="${formatDuration(fruit.weeklyDuration)} 집중${fruit.isActive ? ' (집중 중!)' : ''}"
				></div>
			`
				)
				.join('')}
		</div>

		<div class="stats">
			<strong>${stats.length}</strong>명의 요정 | 
			이번 주 총 <strong>${formatDuration(stats.reduce((sum, s) => sum + s.weeklyDuration, 0))}</strong> 집중
			${stats.filter((s) => s.isActive).length > 0 ? ` | 🔥 ${stats.filter((s) => s.isActive).length}명 집중 중` : ''}
		</div>
	</div>

	${fireflies
		.map(
			(f) => `
		<div 
			class="firefly" 
			style="
				left: ${f.x}%;
				top: ${f.y}%;
				animation-delay: ${f.delay}s;
				animation-duration: ${f.duration}s;
			"
		></div>
	`
		)
		.join('')}

	<div class="info">
		집중요정 Focus Fairy 🧚‍♀️
	</div>
</body>
</html>`;
}

/** 시간 포맷 */
function formatDuration(ms: number): string {
	const totalMinutes = Math.floor(ms / 60000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours > 0) {
		return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
	}
	return `${minutes}분`;
}
