/**
 * 집중요정 메시지 상수
 */

/** 세션 종료 시 랜덤 격려 메시지 */
export const ENCOURAGEMENTS = [
	'오늘도 한 걸음 성장했어요! :fairy-sprout:',
	'요정이 감동받았어요... :fairy-confetti:',
	'꾸준함이 실력이에요! :fairy-fire:',
	'잘했어요! 오늘 하루도 수고 많았어요 :fairy-moon:',
	'훌륭해요! 내일도 요정이 기다릴게요 :fairy-wand:',
	'최고예요! 스스로를 칭찬해주세요 :fairy-party:',
	'오늘도 묵묵히 해낸 당신, 멋있어요 :fairy-sprout:',
	'작은 노력이 모여 큰 결과가 돼요 :fairy-chart:',
	'포기하지 않는 당신을 응원해요 :fairy-wish:',
	'오늘의 나에게 수고했다고 말해주세요 :fairy-coffee:',
	'천천히, 하지만 꾸준히. 잘하고 있어요 :fairy-sprout:',
	'한 뼘 더 성장한 하루였어요 :fairy-confetti:',
	'요정이 오늘도 당신을 기억할게요 :fairy-wand:',
	'지치지 않게, 요정이 곁에 있을게요 :fairy-moon:',
	'쉬어가도 괜찮아요. 다시 시작하면 돼요 :fairy-coffee:',
] as const;

/** 랭킹 메달 이모지 */
export const MEDALS = [':fairy-gold:', ':fairy-silver:', ':fairy-bronze:'] as const;

/** 최대 자동 기록 시간 (6시간) */
export const MAX_AUTO_DURATION = 6 * 60 * 60 * 1000;

/** 세션 카테고리 태그 */
export const SESSION_TAGS = [
	{ value: 'exercise', label: '운동' },
	{ value: 'reading', label: '독서' },
	{ value: 'side', label: '사이드' },
	{ value: 'study', label: '공부' },
	{ value: 'etc', label: '기타' },
] as const;

export const DEFAULT_TAG = 'etc';

/** 하루 응원 보내기 한도 */
export const DAILY_CHEER_LIMIT = 5;

/** 만우절 세션 종료 격려 메시지 */
export const APRIL_FOOLS_ENCOURAGEMENTS = [
	'요정이 집중 시간을 까먹었어요...라고 할 뻔! :fairy-party:',
	'오늘 집중 시간은 요정 인사팀에 보고되었습니다 :fairy-chart:',
	'요정이 잠깐 졸았는데 끝났다고요? :fairy-zzz:',
	'요정이 기록을 실수로 지웠어요...라고 할 뻔! :fairy-confetti:',
	'집중 기록을 요정 감사팀에서 조사 중입니다 :fairy-fire:',
] as const;

/** 만우절 /cheer 대체 음료 */
export const APRIL_FOOLS_DRINKS = [
	'녹즙', '미숫가루', '옥수수수염차', '양배추즙', '쑥차', '할머니가 끓여주신 대추차',
] as const;

/** 만우절 /cheer 대체 사유 */
export const APRIL_FOOLS_REASONS = [
	'집중요정 판단 하에',
	'요정 건강 위원회 심의 결과',
	'집중요정 영양사의 추천으로',
	'요정 복지부 지침에 따라',
	'집중요정 카페인 감사팀 권고로',
	'요정 건강증진법 제3조에 의거하여',
] as const;

