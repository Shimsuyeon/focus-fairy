/**
 * 집중요정 타입 정의
 */

/** 집중 세션 기록 */
export interface Session {
	userId: string;
	start: number;
	end: number;
	duration: number;
}

/** 날짜 범위 (리포트용) */
export interface DateRange {
	startDate: string;
	endDate: string;
	label: string;
}

/** 슬랙 커맨드 요청 데이터 */
export interface SlackCommandRequest {
	command: string;
	userId: string;
	teamId: string;
	text: string;
}

