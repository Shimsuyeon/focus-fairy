/**
 * /cheer 커맨드 핸들러
 * 팀원에게 :fairy-coffee: 응원 보내기
 */

import { replyEphemeral, postMessage, lookupUserByName } from '../utils/slack';
import { getTodayKey, getWeekRangeForDate } from '../utils/date';
import { DAILY_CHEER_LIMIT, MEDALS } from '../constants/messages';

interface CheerLog {
	from: string;
	to: string;
	message?: string;
	time: number;
}

export async function handleCheer(
	env: Env,
	teamId: string,
	userId: string,
	channelId: string,
	text: string
): Promise<Response> {
	if (!text) {
		return replyEphemeral(
			':fairy-coffee: 사용법:\n' +
			'• `/cheer @팀원` — 커피 1잔 보내기\n' +
			'• `/cheer @팀원 화이팅!` — 메시지와 함께 응원\n' +
			'• `/cheer @팀원 :fairy-coffee::fairy-coffee::fairy-coffee:` — 커피 여러 잔 보내기\n' +
			'• `/cheer leaderboard` — 이번 주 응원 랭킹 (보낸 커피)\n' +
			'• `/cheer leaderboard received` — 받은 커피 랭킹\n' +
			`• 하루 ${DAILY_CHEER_LIMIT}잔 제한`
		);
	}

	if (text === 'leaderboard' || text === 'leaderboard received') {
		return showLeaderboard(env, teamId, text === 'leaderboard received' ? 'received' : 'given');
	}

	return sendCheer(env, teamId, userId, channelId, text);
}

async function sendCheer(
	env: Env,
	teamId: string,
	userId: string,
	channelId: string,
	text: string
): Promise<Response> {
	let targetUserId: string | null = null;
	let cheerMessage = '';

	const escapedMatch = text.match(/<@([A-Z0-9]+)(?:\|[^>]*)?>/);
	if (escapedMatch) {
		targetUserId = escapedMatch[1];
		cheerMessage = text.replace(escapedMatch[0], '').trim();
	} else {
		const plainMatch = text.match(/@(\S+)/);
		if (plainMatch) {
			targetUserId = await lookupUserByName(env, teamId, plainMatch[1]);
			cheerMessage = text.replace(plainMatch[0], '').trim();
		}
	}

	if (!targetUserId) {
		return replyEphemeral(':fairy-wand: 응원할 팀원을 멘션해주세요! 예: `/cheer @팀원 화이팅!`');
	}

	if (targetUserId === userId) {
		return replyEphemeral(':fairy-zzz: 자기 자신에게는 응원을 보낼 수 없어요!');
	}

	const coffeeMatches = cheerMessage.match(/:fairy-coffee:/g);
	const coffeeCount = coffeeMatches ? coffeeMatches.length : 1;
	const displayMessage = cheerMessage.replace(/:fairy-coffee:/g, '').trim();

	const todayKey = getTodayKey();
	const sentKey = `${teamId}:cheer:sent:${userId}:${todayKey}`;
	const sentCount = parseInt((await env.STUDY_KV.get(sentKey)) || '0');

	if (sentCount >= DAILY_CHEER_LIMIT) {
		return replyEphemeral(
			`:fairy-zzz: 오늘의 커피를 모두 사용했어요! 내일 다시 충전돼요 (${DAILY_CHEER_LIMIT}/${DAILY_CHEER_LIMIT})`
		);
	}

	const actualCount = Math.min(coffeeCount, DAILY_CHEER_LIMIT - sentCount);
	await env.STUDY_KV.put(sentKey, (sentCount + actualCount).toString(), { expirationTtl: 86400 * 2 });

	const logKey = `${teamId}:cheer:log:${todayKey}`;
	const logs: CheerLog[] = JSON.parse((await env.STUDY_KV.get(logKey)) || '[]');
	for (let i = 0; i < actualCount; i++) {
		logs.push({
			from: userId,
			to: targetUserId,
			...(displayMessage && { message: displayMessage }),
			time: Date.now(),
		});
	}
	await env.STUDY_KV.put(logKey, JSON.stringify(logs));

	const weeklyReceived = await getWeeklyReceivedCount(env, teamId, targetUserId);
	const remaining = DAILY_CHEER_LIMIT - (sentCount + actualCount);

	const coffeeEmojis = ':fairy-coffee:'.repeat(actualCount);
	let publicMessage =
		`${coffeeEmojis} <@${userId}>님이 <@${targetUserId}>님에게 커피 ${actualCount}잔을 보냈어요!`;
	if (displayMessage) {
		publicMessage += `\n💬 "${displayMessage}"`;
	}
	publicMessage += `\n:fairy-sprout: 이번 주 받은 응원: ${weeklyReceived}개 | 남은 커피: ${remaining}/${DAILY_CHEER_LIMIT}`;

	if (coffeeCount > actualCount) {
		publicMessage += `\n:fairy-zzz: (${coffeeCount}잔 요청했지만 남은 커피가 ${actualCount}잔이라 ${actualCount}잔만 보냈어요)`;
	}

	const posted = await postMessage(env, teamId, channelId, publicMessage);

	if (posted) {
		return replyEphemeral(`:fairy-coffee: 커피 ${actualCount}잔을 보냈어요! 남은 커피: ${remaining}/${DAILY_CHEER_LIMIT}`);
	} else {
		return replyEphemeral(':fairy-zzz: 응원 전송에 실패했어요. 봇이 채널에 초대되어 있는지 확인해주세요!');
	}
}

async function showLeaderboard(env: Env, teamId: string, mode: 'given' | 'received'): Promise<Response> {
	const { startDate, endDate } = getWeekRangeForDate(Date.now());
	const counts: Record<string, number> = {};

	const start = new Date(startDate);
	const end = new Date(endDate);
	for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
		const dateKey = d.toISOString().split('T')[0];
		const logKey = `${teamId}:cheer:log:${dateKey}`;
		const logs: CheerLog[] = JSON.parse((await env.STUDY_KV.get(logKey)) || '[]');
		for (const log of logs) {
			const key = mode === 'given' ? log.from : log.to;
			counts[key] = (counts[key] || 0) + 1;
		}
	}

	const sorted = Object.entries(counts)
		.sort(([, a], [, b]) => b - a);

	if (sorted.length === 0) {
		return replyEphemeral(':fairy-coffee: 이번 주는 아직 응원이 없어요! 첫 번째 응원을 보내보세요!');
	}

	const isGiven = mode === 'given';
	const emoji = isGiven ? ':fairy-coffee:' : ':fairy-sprout:';
	const title = isGiven ? '이번 주 커피 히어로' : '이번 주 인기스타';
	const subtitle = isGiven ? '가장 많이 응원한 사람들' : '가장 많이 응원받은 사람들';
	let leaderboard = `${emoji} *${title}*\n${subtitle}\n\n`;
	for (let i = 0; i < sorted.length; i++) {
		const [uid, count] = sorted[i];
		const medal = i < MEDALS.length ? MEDALS[i] : `${i + 1}.`;
		leaderboard += `${medal} <@${uid}> — ${count}잔\n`;
	}

	return replyEphemeral(leaderboard);
}

async function getWeeklyReceivedCount(env: Env, teamId: string, targetUserId: string): Promise<number> {
	const { startDate, endDate } = getWeekRangeForDate(Date.now());
	let count = 0;

	const start = new Date(startDate);
	const end = new Date(endDate);
	for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
		const dateKey = d.toISOString().split('T')[0];
		const logKey = `${teamId}:cheer:log:${dateKey}`;
		const logs: CheerLog[] = JSON.parse((await env.STUDY_KV.get(logKey)) || '[]');
		count += logs.filter(l => l.to === targetUserId).length;
	}

	return count;
}
