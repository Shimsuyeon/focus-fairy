/**
 * 집중요정 타입 정의
 */

/** 집중 세션 기록 */
/** 세션을 시작·종료한 곳 — 없으면(이전 기록) slack */
export type SessionSource = 'slack' | 'extension';

export interface Session {
	userId: string;
	start: number;
	end: number;
	duration: number;
	label?: string;
	checked?: boolean[];
	tag?: string;
	pauseDuration?: number;
	source?: SessionSource;
	endSource?: SessionSource;
	/** 채널에 시작 메시지를 올리지 않고 기록만 남긴 세션 (익스텐션 '기록만') */
	recordOnly?: true;
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
