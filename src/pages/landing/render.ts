/**
 * 랜딩 페이지 HTML 렌더링 함수
 */

import type { TeamMemberStats, FruitData, FireflyData } from './types';
import { FIREFLY_COUNT } from './constants';
import { styles } from './styles';
import { generateFruitData, generateFireflyData } from './data';
import { formatDuration } from '../../utils/format';

/**
 * Focus Tree 전체 HTML 생성
 */
export function generateFocusTreeHTML(stats: TeamMemberStats[]): string {
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
	<style>${styles}</style>
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

/**
 * 열매 HTML 렌더링
 */
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
