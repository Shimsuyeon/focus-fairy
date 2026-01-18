/**
 * /ai 커맨드 핸들러
 * AI 기능 테스트용 명령어
 */

import { replyEphemeral } from '../utils/slack';
import { formatDuration } from '../utils/format';
import { getTodayKey } from '../utils/date';
import { getWeekTotal } from '../services/session';
import { CHEER_SYSTEM_PROMPT, AI_FALLBACK_MESSAGE, ALLOWED_EMOJIS } from '../constants/prompts';
import type { Session } from '../types';

/** /ai 핸들러 */
export async function handleAI(env: Env, teamId: string, userId: string, text: string): Promise<Response> {
	const subCommand = text.split(' ')[0]?.toLowerCase();

	switch (subCommand) {
		case 'cheer':
			return handleAICheer(env, teamId, userId);
		default:
			return replyEphemeral(
				`:fairy-wand: *AI 기능 테스트*\n\n` + `• \`/ai cheer\` - AI가 생성한 응원 메시지\n\n` + `_더 많은 기능이 곧 추가될 예정이에요!_`
			);
	}
}

/** /ai cheer - AI 응원 메시지 생성 (개인화) */
async function handleAICheer(env: Env, teamId: string, userId: string): Promise<Response> {
	try {
		// 사용자 데이터 수집
		const userData = await getUserContext(env, teamId, userId);

		const response = (await env.AI.run('@cf/meta/llama-3.1-8b-instruct' as keyof AiModels, {
			messages: [
				{ role: 'system', content: CHEER_SYSTEM_PROMPT },
				{
					role: 'user',
					content: `이 사용자를 위한 따뜻한 응원 메시지를 하나 만들어줘. 매번 다르게!\n\n${userData}`,
				},
			],
			max_tokens: 100,
			temperature: 0.9, // 더 다양하게
		})) as { response?: string };

		// AI 응답 추출
		let message = response?.response || AI_FALLBACK_MESSAGE;

		// 허용되지 않은 이모지 제거 (후처리)
		message = sanitizeEmoji(message);

		// 빈 메시지면 fallback
		if (!message.trim()) {
			message = AI_FALLBACK_MESSAGE;
		}

		return replyEphemeral(`:fairy-wand: ${message}`);
	} catch (error) {
		console.error('AI cheer error:', error);
		return replyEphemeral(AI_FALLBACK_MESSAGE);
	}
}

/** 사용자 컨텍스트 데이터 수집 */
async function getUserContext(env: Env, teamId: string, userId: string): Promise<string> {
	const now = Date.now();
	const kstHour = new Date(now + 9 * 60 * 60 * 1000).getUTCHours();

	// 시간대
	let timeOfDay: string;
	if (kstHour >= 6 && kstHour < 12) {
		timeOfDay = '아침';
	} else if (kstHour >= 12 && kstHour < 18) {
		timeOfDay = '오후';
	} else if (kstHour >= 18 && kstHour < 24) {
		timeOfDay = '저녁';
	} else {
		timeOfDay = '새벽';
	}

	// 요일
	const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][new Date(now + 9 * 60 * 60 * 1000).getUTCDay()];

	// 현재 집중 중인지
	const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);
	const isStudying = !!checkIn;
	let studyingDuration = '';
	if (checkIn) {
		const elapsed = now - parseInt(checkIn);
		studyingDuration = formatDuration(elapsed);
	}

	// 오늘 집중 시간
	const todayKey = getTodayKey();
	const todaySessions: Session[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:sessions:${todayKey}`)) || '[]');
	const todayTotal = todaySessions.filter((s) => s.userId === userId).reduce((sum, s) => sum + s.duration, 0);

	// 이번 주 누적
	const weekTotal = await getWeekTotal(env, teamId, userId);

	// 컨텍스트 문자열 생성
	const lines = [
		`- 현재 시간대: ${timeOfDay} (${dayOfWeek}요일)`,
		`- 오늘 집중 시간: ${todayTotal > 0 ? formatDuration(todayTotal) : '아직 없음'}`,
		`- 이번 주 누적: ${weekTotal > 0 ? formatDuration(weekTotal) : '아직 없음'}`,
	];

	if (isStudying) {
		lines.push(`- 현재 상태: 집중 중! (${studyingDuration} 경과)`);
	} else {
		lines.push(`- 현재 상태: 쉬는 중`);
	}

	return lines.join('\n');
}

/** 허용된 이모지 외 제거 */
function sanitizeEmoji(text: string): string {
	// :xxx: 패턴 중 허용되지 않은 것 제거
	return text.replace(/:[a-z-]+:/g, (match) => (ALLOWED_EMOJIS.has(match) ? match : ''));
}
