/**
 * 랜딩 페이지 타입 정의
 */

/** 팀원 통계 */
export interface TeamMemberStats {
	userId: string;
	weeklyDuration: number; // ms
	isActive: boolean;
}

/** 열매 렌더링 데이터 */
export interface FruitData extends TeamMemberStats {
	size: number;
	glowIntensity: number;
	color: string;
	x: number;
	y: number;
}

/** 반딧불이 렌더링 데이터 */
export interface FireflyData {
	id: number;
	x: number;
	y: number;
	delay: number;
	duration: number;
}
