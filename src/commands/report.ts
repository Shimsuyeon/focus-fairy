/**
 * /report, /weekly 커맨드 핸들러
 */

import { reply } from '../utils/slack';
import { getDateRange } from '../utils/date';
import { generateReport } from '../services/session';

/** /weekly 핸들러 */
export async function handleWeekly(env: Env, teamId: string): Promise<Response> {
	const { startDate, endDate, label } = getDateRange('week');
	return generateReport(env, teamId, startDate, endDate, label);
}

/** /report 핸들러 */
export async function handleReportCommand(env: Env, teamId: string, text: string): Promise<Response> {
	// /report 01-01 01-07 또는 /report thismonth 또는 /report lastweek
	if (!text) {
		return reply(
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
			return generateReport(env, teamId, startDate, endDate, label);
		}
		return reply('올바른 형식으로 입력해주세요. 예: `/report 01-01 01-07`');
	}

	if (args.length === 2) {
		const startInput = args[0];
		const endInput = args[1];
		if (!/^\d{2}-\d{2}-\d{2}$/.test(startInput) || !/^\d{2}-\d{2}-\d{2}$/.test(endInput)) {
			return reply('올바른 형식으로 입력해주세요. 예: `/report 26-01-01 26-01-07`');
		}
		const startDate = '20' + startInput;
		const endDate = '20' + endInput;
		const label = `${startInput} ~ ${endInput}`;
		return generateReport(env, teamId, startDate, endDate, label);
	}

	return reply('올바른 형식으로 입력해주세요. 예: `/report 26-01-01 26-01-07`');
}

