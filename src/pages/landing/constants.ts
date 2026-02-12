/**
 * 랜딩 페이지 상수 정의
 */

/** 열매 색상 팔레트 (신비로운 색상들) */
export const FRUIT_COLORS = [
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
export const FIREFLY_COUNT = 20;

/** 열매 크기 범위 (px) */
export const FRUIT_SIZE = {
	min: 20,
	max: 50,
} as const;
