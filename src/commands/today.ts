/**
 * /today 커맨드 핸들러
 */

import { reply, getUserName } from '../utils/slack';
import { getTodayKey } from '../utils/date';

export async function handleToday(env: Env, teamId: string): Promise<Response> {
	const todayKey = getTodayKey();
	const todayList: string[] = JSON.parse((await env.STUDY_KV.get(`${teamId}:today:${todayKey}`)) || '[]');

	if (todayList.length === 0) {
		return reply(':fairy-wish: 오늘은 아직 조용해요... 첫 번째 주인공이 되어볼까요?');
	}

	const statuses = await Promise.all(
		todayList.map(async (uid) => {
			const [checkIn, userName] = await Promise.all([env.STUDY_KV.get(`${teamId}:checkin:${uid}`), getUserName(env, teamId, uid)]);
			const status = checkIn ? ':fairy-fire:' : ':fairy-party:';
			return { status, userName, isStudying: !!checkIn };
		})
	);

	const lines = statuses.map((s) => `${s.status} ${s.userName}`);
	const studying = statuses.filter((s) => s.isStudying).length;

	return reply(
		`:fairy-chart: *오늘 집중한 사람들*\n\n` +
			`${lines.join('\n')}\n\n` +
			`:fairy-fire: 집중 중 ${studying}명 | :fairy-party: 완료 ${todayList.length - studying}명`
	);
}
