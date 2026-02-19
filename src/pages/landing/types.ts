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

/** 주차 네비게이션 정보 */
export interface WeekInfo {
	/** 해당 주 월요일 (YYYY-MM-DD) */
	monday: string;
	/** 해당 주 일요일 (YYYY-MM-DD) */
	sunday: string;
	/** 현재 주인지 여부 */
	isCurrentWeek: boolean;
	/** 이전 주 월요일 (YYYY-MM-DD) */
	prevMonday: string;
	/** 다음 주 월요일 (YYYY-MM-DD, 현재 주면 null) */
	nextMonday: string | null;
	/** 표시용 라벨 (예: "2월 1주") */
	label: string;
	/** 날짜 범위 표시 (예: "02.03 ~ 02.09") */
	dateRange: string;
}
