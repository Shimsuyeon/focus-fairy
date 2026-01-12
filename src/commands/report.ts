/**
 * /report, /weekly 커맨드 핸들러
 */

import { reply, replyEphemeral, postMessage, getUserName } from '../utils/slack';
import { getDateRange } from '../utils/date';
import { generateReportText } from '../services/session';

/** 리포트를 채널에 전송 (조회자 표시) */
async function sendReport(
	env: Env,
	teamId: string,
	userId: string,
	channelId: string,
	startDate: string,
	endDate: string,
	label: string
): Promise<Response> {
	const reportText = await generateReportText(env, teamId, startDate, endDate, label);
	const userName = await getUserName(env, teamId, userId);

	if (!reportText) {
		return replyEphemeral(':fairy-chart: 해당 기간에는 아직 기록이 없어요! 요정이 기다리고 있을게요 :fairy-wand:');
	}

	const fullMessage = `:fairy-wand: ${userName}님이 리포트를 조회했어요!\n\n${reportText}`;

	const success = await postMessage(env, teamId, channelId, fullMessage);

	if (!success) {
		// fallback to in_channel
		return reply(fullMessage);
	}

	return replyEphemeral('리포트 조회 완료!');
}

/** /weekly 핸들러 */
export async function handleWeekly(env: Env, teamId: string, userId: string, channelId: string): Promise<Response> {
	const { startDate, endDate, label } = getDateRange('week');
	return sendReport(env, teamId, userId, channelId, startDate, endDate, label);
}

/** /report 핸들러 */
export async function handleReportCommand(env: Env, teamId: string, userId: string, channelId: string, text: string): Promise<Response> {
	// /report 01-01 01-07 또는 /report thismonth 또는 /report lastweek
	if (!text) {
		return replyEphemeral(
			`:fairy-chart: *리포트 사용법*\n\n` +
				`• \`/report thisweek\` - 이번 주\n` +
				`• \`/report lastweek\` - 지난 주\n` +
				`• \`/report thismonth\` - 이번 달\n` +
				`• \`/report 26-01-01 26-01-07\` - 특정 기간`
		);
	}

	const args = text.split(' ');

	if (args.length === 1) {
		const period = args[0].toLowerCase();
		if (['thisweek', 'lastweek', 'thismonth', 'lastmonth'].includes(period)) {
			const { startDate, endDate, label } = getDateRange(period);
			return sendReport(env, teamId, userId, channelId, startDate, endDate, label);
		}
		return replyEphemeral('올바른 형식으로 입력해주세요. 예: `/report 01-01 01-07`');
	}

	if (args.length === 2) {
		const startInput = args[0];
		const endInput = args[1];
		if (!/^\d{2}-\d{2}-\d{2}$/.test(startInput) || !/^\d{2}-\d{2}-\d{2}$/.test(endInput)) {
			return replyEphemeral('올바른 형식으로 입력해주세요. 예: `/report 26-01-01 26-01-07`');
		}
		const startDate = '20' + startInput;
		const endDate = '20' + endInput;
		const label = `${startInput} ~ ${endInput}`;
		return sendReport(env, teamId, userId, channelId, startDate, endDate, label);
	}

	return replyEphemeral('올바른 형식으로 입력해주세요. 예: `/report 26-01-01 26-01-07`');
}
