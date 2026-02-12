/**
 * 랜딩 페이지 CSS 스타일
 */

export const styles = `
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
`;
