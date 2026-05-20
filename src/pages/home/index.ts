/**
 * App Home 발행 진입점.
 * app_home_opened 이벤트나 홈 뷰를 새로고침해야 할 시점에 호출된다.
 */

import { getBotToken, getUserName } from '../../utils/slack';
import { getUserSessionState, getUserTodayStats, getUserWeeklyRank, getUserMonthTotal } from '../../services/session';
import { buildHomeView, buildOnboardingView } from './render';

/** App Home 뷰를 발행 (views.publish). 신규 사용자는 온보딩 뷰. */
export async function publishHomeView(env: Env, teamId: string, userId: string): Promise<boolean> {
	const token = await getBotToken(env, teamId);
	if (!token) {
		console.error('publishHomeView: no bot token for team', teamId);
		return false;
	}

	const totalRecords: Record<string, number> = JSON.parse((await env.STUDY_KV.get(`${teamId}:total`)) || '{}');
	const totalAllTimeMs = totalRecords[userId] || 0;
	const userName = await getUserName(env, teamId, userId);

	const [session, today, week, monthTotalMs] = await Promise.all([
		getUserSessionState(env, teamId, userId),
		getUserTodayStats(env, teamId, userId),
		getUserWeeklyRank(env, teamId, userId),
		getUserMonthTotal(env, teamId, userId),
	]);

	const isNewUser = totalAllTimeMs === 0 && today.sessionCount === 0 && session.state === 'idle';
	const view = isNewUser
		? buildOnboardingView({ userName })
		: buildHomeView({ userName, session, today, week, monthTotalMs, totalAllTimeMs });

	try {
		const res = await fetch('https://slack.com/api/views.publish', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ user_id: userId, view }),
		});
		const data = (await res.json()) as { ok: boolean; error?: string };
		if (!data.ok) {
			console.error('views.publish failed:', data.error);
			return false;
		}
		return true;
	} catch (error) {
		console.error('views.publish error:', error);
		return false;
	}
}
