/**
 * 랜딩 페이지 HTML 렌더링 함수
 */

import type { TeamMemberStats, FruitData, FireflyData, WeekInfo } from './types';
import { FIREFLY_COUNT } from './constants';
import { styles } from './styles';
import { generateFruitData, generateFireflyData } from './data';
import { formatDuration } from '../../utils/format';

/**
 * Focus Tree 전체 HTML 생성
 */
export function generateFocusTreeHTML(stats: TeamMemberStats[], weekInfo: WeekInfo): string {
	const fruits = generateFruitData(stats);
	const fireflies = generateFireflyData(FIREFLY_COUNT);
	const totalDuration = stats.reduce((sum, s) => sum + s.weeklyDuration, 0);
	const activeCount = stats.filter((s) => s.isActive).length;

	const weekLabel = weekInfo.isCurrentWeek ? '이번 주' : weekInfo.label;
	const emptyMessage = stats.length === 0
		? `<div class="empty-message">이 주에는 아직 기록이 없어요 🌙</div>`
		: '';

	return `<!DOCTYPE html>
<html lang="ko">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>🧚‍♀️ Focus Tree | Focus Fairy</title>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Tangerine:wght@700&display=swap" rel="stylesheet">
	<style>${styles}</style>
</head>
<body>
	<div class="stars"></div>
	
	<div class="container">
		<h1 class="title">Focus Tree</h1>

		<nav class="week-nav">
			${weekInfo.prevMonday !== weekInfo.monday
				? `<a class="week-nav-btn" href="?week=${weekInfo.prevMonday}" aria-label="이전 주">&#8249;</a>`
				: `<span class="week-nav-btn disabled">&#8249;</span>`
			}
			<div class="week-nav-label">
				<span class="week-nav-title">${weekLabel}</span>
				<span class="week-nav-range">${weekInfo.dateRange}</span>
			</div>
			${weekInfo.nextMonday
				? `<a class="week-nav-btn" href="?week=${weekInfo.nextMonday}" aria-label="다음 주">&#8250;</a>`
				: `<span class="week-nav-btn disabled">&#8250;</span>`
			}
		</nav>
		
		<div class="tree">
			<div class="canopy-glow"></div>
			<div class="canopy"></div>
			<div class="trunk"></div>
			${fruits.map(renderFruit).join('')}
			${emptyMessage}
		</div>

		<div class="stats">
			<strong>${stats.length}</strong>명의 요정 | 
			${weekLabel} 총 <strong>${formatDuration(totalDuration)}</strong> 집중
			${activeCount > 0 ? ` | 🔥 ${activeCount}명 집중 중` : ''}
		</div>
	</div>

	${fireflies.map(renderFirefly).join('')}

	<div class="info">집중요정 Focus Fairy 🧚‍♀️</div>
</body>
</html>`;
}

/**
 * 열매 HTML 렌더링
 */
function renderFruit(fruit: FruitData): string {
	const activeClass = fruit.isActive ? 'active' : '';
	const tooltipText = `${formatDuration(fruit.weeklyDuration)}${fruit.isActive ? ' 🔥' : ''}`;

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
		data-tooltip="${tooltipText}"
	></div>`;
}

/**
 * 반딧불이 HTML 렌더링
 */
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
