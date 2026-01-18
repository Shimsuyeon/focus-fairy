/**
 * /ai 커맨드 핸들러
 * AI 기능 테스트용 명령어
 */

import { replyEphemeral } from '../utils/slack';
import { CHEER_SYSTEM_PROMPT, AI_FALLBACK_MESSAGE, ALLOWED_EMOJIS } from '../constants/prompts';

/** /ai 핸들러 */
export async function handleAI(env: Env, teamId: string, userId: string, text: string): Promise<Response> {
	const subCommand = text.split(' ')[0]?.toLowerCase();

	switch (subCommand) {
		case 'cheer':
			return handleAICheer(env);
		default:
			return replyEphemeral(
				`:fairy-wand: *AI 기능 테스트*\n\n` +
					`• \`/ai cheer\` - AI가 생성한 응원 메시지\n\n` +
					`_더 많은 기능이 곧 추가될 예정이에요!_`
			);
	}
}

/** /ai cheer - AI 응원 메시지 생성 */
async function handleAICheer(env: Env): Promise<Response> {
	try {
		const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
			messages: [
				{ role: 'system', content: CHEER_SYSTEM_PROMPT },
				{ role: 'user', content: '응원 메시지를 하나 만들어줘.' },
			],
			max_tokens: 100,
		});

		// AI 응답 추출
		let message = response.response || AI_FALLBACK_MESSAGE;

		// 허용되지 않은 이모지 제거 (후처리)
		message = sanitizeEmoji(message);

		return replyEphemeral(`:fairy-wand: ${message}`);
	} catch (error) {
		console.error('AI cheer error:', error);
		return replyEphemeral(AI_FALLBACK_MESSAGE);
	}
}

/** 허용된 이모지 외 제거 */
function sanitizeEmoji(text: string): string {
	// :xxx: 패턴 중 허용되지 않은 것 제거
	return text.replace(/:[a-z-]+:/g, (match) => (ALLOWED_EMOJIS.has(match) ? match : ''));
}

