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
	handleCheer,
	handlePause,
	handleResume,
	handleSettings,
	handleHelp,
} from './commands';
import { reply } from './utils/slack';
import { handleLanding } from './pages/landing/index';
import { handleOAuthInstall, handleOAuthCallback } from './pages/install/index';
import { handleInteraction } from './interactions';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// GET 요청 라우팅
		if (request.method !== 'POST') {
			switch (url.pathname) {
				case '/slack/oauth/install':
					return handleOAuthInstall(env);
				case '/slack/oauth/callback':
					return handleOAuthCallback(request, env);
				default: {
					const teamId = url.searchParams.get('team') || env.DEFAULT_TEAM_ID;
					const weekParam = url.searchParams.get('week');
					return handleLanding(env, teamId, weekParam);
				}
			}
		}

		// Slack Interactivity 엔드포인트
		if (url.pathname === '/slack/interactions') {
			return handleInteraction(request, env);
		}

		if (url.pathname !== '/slack/commands') {
			return new Response('Not found', { status: 404 });
		}

		const formData = await request.formData();
		const command = formData.get('command') as string;
		const userId = formData.get('user_id') as string;
		const teamId = formData.get('team_id') as string;
		const channelId = formData.get('channel_id') as string;
		const text = (formData.get('text') as string)?.trim() || '';
		const triggerId = (formData.get('trigger_id') as string) || '';

		switch (command) {
			case '/start':
				return handleStart(env, teamId, userId, channelId, text, triggerId);
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
		case '/cheer':
			return handleCheer(env, teamId, userId, channelId, text);
		case '/pause':
			return handlePause(env, teamId, userId, channelId);
		case '/resume':
			return handleResume(env, teamId, userId, channelId);
		case '/settings':
			return handleSettings(env, teamId, triggerId);
		case '/help':
			return handleHelp(env, teamId, triggerId);
		default:
				return reply('알 수 없는 명령어예요.');
		}
	},
} satisfies ExportedHandler<Env>;
