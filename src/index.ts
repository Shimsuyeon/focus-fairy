/**
 * 집중요정 (Focus Fairy) - 슬랙 기반 집중 시간 트래커
 * 8명 스터디 그룹을 위한 집중 시간 기록 봇
 */

import {
	handleStart,
	handleEnd,
	handleMyStats,
	handleToday,
	handleWeekly,
	handleReportCommand,
	handleExport,
	handlePattern,
} from './commands';
import { reply } from './utils/slack';
import { handleLanding } from './pages/landing/index';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// GET 요청: 집중의 나무 랜딩 페이지
		if (request.method !== 'POST') {
			const url = new URL(request.url);
			const teamId = url.searchParams.get('team') || env.DEFAULT_TEAM_ID;
			const weekParam = url.searchParams.get('week');
			return handleLanding(env, teamId, weekParam);
		}

		// 슬랙 커맨드 엔드포인트만 허용
		const url = new URL(request.url);
		if (url.pathname !== '/slack/commands') {
			return new Response('Not found', { status: 404 });
		}

		// 폼 데이터 파싱
		const formData = await request.formData();
		const command = formData.get('command') as string;
		const userId = formData.get('user_id') as string;
		const teamId = formData.get('team_id') as string;
		const channelId = formData.get('channel_id') as string;
		const text = (formData.get('text') as string)?.trim() || '';

		// 커맨드 라우팅
		switch (command) {
			case '/start':
				return handleStart(env, teamId, userId, channelId);
			case '/end':
				return handleEnd(env, teamId, userId, channelId, text);
			case '/weekly':
				return handleWeekly(env, teamId, userId, channelId);
			case '/mystats':
				return handleMyStats(env, teamId, userId);
			case '/today':
				return handleToday(env, teamId);
			case '/report':
				return handleReportCommand(env, teamId, userId, channelId, text);
			case '/export':
				return handleExport(env, teamId, userId, channelId, text);
			case '/pattern':
				return handlePattern(env, teamId, userId, text);
			default:
				return reply('알 수 없는 명령어예요.');
		}
	},
} satisfies ExportedHandler<Env>;
