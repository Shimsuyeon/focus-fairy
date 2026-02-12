/**
 * 집중의 나무 (Focus Tree) 랜딩 페이지
 * 팀 집중 데이터를 시각화하는 신비로운 숲 테마 페이지
 */

import { collectTeamStats } from './data';
import { generateFocusTreeHTML } from './render';

/**
 * 랜딩 페이지 핸들러
 */
export async function handleLanding(env: Env, teamId: string): Promise<Response> {
	const stats = await collectTeamStats(env, teamId);
	const html = generateFocusTreeHTML(stats);

	return new Response(html, {
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}
