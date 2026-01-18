/**
 * 집중요정 이모지 상수
 */

/** 격려 메시지용 커스텀 이모지 */
export const ENCOURAGEMENT_EMOJIS = {
	':fairy-sprout:': '성장, 한 걸음',
	':fairy-confetti:': '감동, 축하',
	':fairy-fire:': '꾸준함, 열정',
	':fairy-moon:': '수고, 하루 마무리',
	':fairy-wand:': '기다림, 함께',
	':fairy-party:': '최고, 칭찬',
	':fairy-chart:': '노력의 결과',
	':fairy-wish:': '응원, 포기하지 마',
	':fairy-coffee:': '쉬어가기, 여유',
} as const;

/** 격려용 이모지 목록 */
export const ENCOURAGEMENT_EMOJI_LIST = Object.keys(ENCOURAGEMENT_EMOJIS);

/** 이모지 가이드 (프롬프트용) */
export const EMOJI_GUIDE = Object.entries(ENCOURAGEMENT_EMOJIS)
	.map(([emoji, desc]) => `- ${emoji} → ${desc}`)
	.join('\n');
