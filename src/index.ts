/**
 * 집중요정 (Focus Fairy) - 슬랙 기반 집중 시간 트래커
 * 8명 스터디 그룹을 위한 집중 시간 기록 봇
 */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('집중요정 Bot is running! 🧚‍♀️');
    }

    const url = new URL(request.url);
    if (url.pathname !== '/slack/commands') {
      return new Response('Not found', { status: 404 });
    }

    const formData = await request.formData();
    const command = formData.get('command') as string;
    const userId = formData.get('user_id') as string;
    const teamId = formData.get('team_id') as string;
    const text = (formData.get('text') as string)?.trim() || '';

    switch (command) {
      case '/start':
        return handleStart(env, teamId, userId);
      case '/end':
        return handleEnd(env, teamId, userId, text);
      case '/weekly':
        return handleReport(env, teamId, 'week');
      case '/mystats':
        return handleMyStats(env, teamId, userId);
      case '/today':
        return handleToday(env, teamId);
      case '/report':
        return handleReportCommand(env, teamId, text);
      default:
        return reply('알 수 없는 명령어예요.');
    }
  }
} satisfies ExportedHandler<Env>;

// ============================================================================
// Command Handlers
// ============================================================================

async function handleStart(env: Env, teamId: string, userId: string): Promise<Response> {
  const now = Date.now();
  const existing = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);

  if (existing) {
    const startTime = parseInt(existing);
    const elapsed = formatDuration(now - startTime);
    return reply(`<@${userId}> 이미 집중 중이에요! 요정이 지켜보고 있어요 :fairy-hourglass: (${elapsed} 경과)`);
  }

  await env.STUDY_KV.put(`${teamId}:checkin:${userId}`, now.toString());

  const todayKey = getTodayKey();
  const todayList: string[] = JSON.parse(await env.STUDY_KV.get(`${teamId}:today:${todayKey}`) || '[]');
  if (!todayList.includes(userId)) {
    todayList.push(userId);
    await env.STUDY_KV.put(`${teamId}:today:${todayKey}`, JSON.stringify(todayList));
  }

  return reply(`:fairy-wand: <@${userId}> 집중요정이 응원할게요! 화이팅! (${formatTime(now)})`);
}

async function handleEnd(env: Env, teamId: string, userId: string, text: string): Promise<Response> {
  const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);

  if (!checkIn) {
    return reply(`<@${userId}> 아직 시작 전이에요! /start로 요정을 불러주세요 :fairy-wand:`);
  }

  const now = Date.now();
  const startTime = parseInt(checkIn);
  let duration = now - startTime;
  const maxDuration = 6 * 60 * 60 * 1000; // 6시간

  // 6시간 초과 + 시간 입력 없으면 경고
  if (duration > maxDuration && !text) {
    return reply(
      `:fairy-zzz: ${formatDuration(duration)} 기록 예정!\n` +
      `실제 집중 시간과 다르다면 요정이 고쳐드릴게요\n\n` +
      `👉 이렇게 입력해보세요: /end 2시간 30분`
    );
  }

  // 시간 직접 입력한 경우
  if (text) {
    const parsed = parseDuration(text);
    if (parsed === null) {
      return reply('시간 형식을 확인해주세요! 예: /end 2시간 30분');
    }
    duration = parsed;
  }

  // 개별 세션 저장 (날짜별로 조회 가능하도록)
  const sessionDate = getDateKey(startTime);
  const sessionsKey = `${teamId}:sessions:${sessionDate}`;
  const sessions: Session[] = JSON.parse(await env.STUDY_KV.get(sessionsKey) || '[]');
  sessions.push({
    userId,
    start: startTime,
    end: now,
    duration
  });
  await env.STUDY_KV.put(sessionsKey, JSON.stringify(sessions));

  // 전체 누적도 유지
  const totalRecords: Record<string, number> = JSON.parse(await env.STUDY_KV.get(`${teamId}:total`) || '{}');
  totalRecords[userId] = (totalRecords[userId] || 0) + duration;
  await env.STUDY_KV.put(`${teamId}:total`, JSON.stringify(totalRecords));

  await env.STUDY_KV.delete(`${teamId}:checkin:${userId}`);

  // 이번 주 누적 계산
  const weekTotal = await getWeekTotal(env, teamId, userId);

  const encouragements = [
    "오늘도 한 걸음 성장했어요! :fairy-sprout:",
    "요정이 감동받았어요... :fairy-confetti:",
    "꾸준함이 실력이에요! :fairy-fire:",
    "잘했어요! 오늘 하루도 수고 많았어요 :fairy-moon:",
    "훌륭해요! 내일도 요정이 기다릴게요 :fairy-wand:",
    "최고예요! 스스로를 칭찬해주세요 :fairy-party:",
    "오늘도 묵묵히 해낸 당신, 멋있어요 :fairy-sprout:",
    "작은 노력이 모여 큰 결과가 돼요 :fairy-chart:",
    "포기하지 않는 당신을 응원해요 :fairy-wish:",
    "오늘의 나에게 수고했다고 말해주세요 :fairy-coffee:",
    "천천히, 하지만 꾸준히. 잘하고 있어요 :fairy-sprout:",
    "한 뼘 더 성장한 하루였어요 :fairy-confetti:",
    "요정이 오늘도 당신을 기억할게요 :fairy-wand:",
    "지치지 않게, 요정이 곁에 있을게요 :fairy-moon:",
    "쉬어가도 괜찮아요. 다시 시작하면 돼요 :fairy-coffee:"
  ];
  const randomMsg = encouragements[Math.floor(Math.random() * encouragements.length)];

  return reply(
    `:fairy-party: <@${userId}> 수고했어요! 요정이 기록했어요 (${formatTime(now)})\n` +
    `:fairy-hourglass: 이번 세션: ${formatDuration(duration)}\n` +
    `:fairy-chart: 이번 주 누적: ${formatDuration(weekTotal)}\n\n` +
    `${randomMsg}`
  );
}

async function handleReport(env: Env, teamId: string, period: string): Promise<Response> {
  const { startDate, endDate, label } = getDateRange(period);
  return generateReport(env, teamId, startDate, endDate, label);
}

async function handleReportCommand(env: Env, teamId: string, text: string): Promise<Response> {
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

async function handleMyStats(env: Env, teamId: string, userId: string): Promise<Response> {
  const totalRecords: Record<string, number> = JSON.parse(await env.STUDY_KV.get(`${teamId}:total`) || '{}');
  const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${userId}`);

  const weekTotal = await getWeekTotal(env, teamId, userId);
  const totalTime = totalRecords[userId] || 0;

  let status = ':fairy-coffee: 현재 쉬는 중';
  if (checkIn) {
    const elapsed = Date.now() - parseInt(checkIn);
    status = `:fairy-fire: 집중 중 (${formatDuration(elapsed)} 경과)`;
  }

  return reply(
    `:fairy-chart: *<@${userId}>님의 집중 통계*\n\n` +
    `${status}\n` +
    `:fairy-sun: 이번 주: ${formatDuration(weekTotal)}\n` +
    `:fairy-gold: 전체 누적: ${formatDuration(totalTime)}`
  );
}

async function handleToday(env: Env, teamId: string): Promise<Response> {
  const todayKey = getTodayKey();
  const todayList: string[] = JSON.parse(await env.STUDY_KV.get(`${teamId}:today:${todayKey}`) || '[]');

  if (todayList.length === 0) {
    return reply(':fairy-wish: 오늘은 아직 조용해요... 첫 번째 주인공이 되어볼까요?');
  }

  const statuses = await Promise.all(
    todayList.map(async (uid) => {
      const checkIn = await env.STUDY_KV.get(`${teamId}:checkin:${uid}`);
      const status = checkIn ? ':fairy-fire:' : ':fairy-party:';
      return `${status} <@${uid}>`;
    })
  );

  const studying = statuses.filter(s => s.includes('fire')).length;

  return reply(
    `:fairy-chart: *오늘 집중한 사람들*\n\n` +
    `${statuses.join('\n')}\n\n` +
    `:fairy-fire: 집중 중 ${studying}명 | :fairy-party: 완료 ${todayList.length - studying}명`
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getWeekTotal(env: Env, teamId: string, userId: string): Promise<number> {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dayOfWeek = today.getUTCDay();
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const dateKey = d.toISOString().split('T')[0];
    const sessions: Session[] = JSON.parse(await env.STUDY_KV.get(`${teamId}:sessions:${dateKey}`) || '[]');
    total += sessions.filter(s => s.userId === userId).reduce((sum, s) => sum + s.duration, 0);
  }
  return total;
}

async function generateReport(env: Env, teamId: string, startDate: string, endDate: string, label: string): Promise<Response> {
  const stats: Record<string, number> = {};
  
  let current = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  
  while (current <= end) {
    const dateKey = current.toISOString().split('T')[0];
    const sessions: Session[] = JSON.parse(await env.STUDY_KV.get(`${teamId}:sessions:${dateKey}`) || '[]');
    
    for (const session of sessions) {
      stats[session.userId] = (stats[session.userId] || 0) + session.duration;
    }
    
    current.setUTCDate(current.getUTCDate() + 1);
  }

  const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return reply(':fairy-chart: 이번 주는 아직 기록이 없어요! 요정이 기다리고 있을게요 :fairy-wand:');
  }

  const medals = [':fairy-gold:', ':fairy-silver:', ':fairy-bronze:'];
  const lines = entries.map(([uid, ms], i) => {
    const medal = medals[i] || `${i + 1}.`;
    return `${medal} <@${uid}> - ${formatDuration(ms)}`;
  });

  const total = entries.reduce((sum, [, ms]) => sum + ms, 0);

  return reply(
    `:fairy-chart: *${label} 집중 시간 리포트*\n\n` +
    `${lines.join('\n')}\n\n` +
    `총 ${entries.length}명 | :fairy-hourglass: 합계 ${formatDuration(total)}`
  );
}

interface DateRange {
  startDate: string;
  endDate: string;
  label: string;
}

function getDateRange(period: string): DateRange {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const date = today.getUTCDate();
  const dayOfWeek = today.getUTCDay();

  switch (period) {
    case 'week':
    case 'thisweek': {
      const monday = new Date(Date.UTC(year, month, date - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)));
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      return {
        startDate: monday.toISOString().split('T')[0],
        endDate: sunday.toISOString().split('T')[0],
        label: '이번 주'
      };
    }
    case 'lastweek': {
      const lastMonday = new Date(Date.UTC(year, month, date - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7));
      const lastSunday = new Date(lastMonday);
      lastSunday.setUTCDate(lastMonday.getUTCDate() + 6);
      return {
        startDate: lastMonday.toISOString().split('T')[0],
        endDate: lastSunday.toISOString().split('T')[0],
        label: '지난 주'
      };
    }
    case 'thismonth': {
      const firstDay = new Date(Date.UTC(year, month, 1));
      const lastDay = new Date(Date.UTC(year, month + 1, 0));
      return {
        startDate: firstDay.toISOString().split('T')[0],
        endDate: lastDay.toISOString().split('T')[0],
        label: `${month + 1}월`
      };
    }
    case 'lastmonth': {
      const firstDay = new Date(Date.UTC(year, month - 1, 1));
      const lastDay = new Date(Date.UTC(year, month, 0));
      return {
        startDate: firstDay.toISOString().split('T')[0],
        endDate: lastDay.toISOString().split('T')[0],
        label: `${month}월`
      };
    }
    default:
      return { startDate: '', endDate: '', label: '' };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function reply(text: string): Response {
  return new Response(
    JSON.stringify({ response_type: 'in_channel', text }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul'
  });
}

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function getTodayKey(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
}

function getDateKey(ts: number): string {
  const d = new Date(ts + 9 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
}

function parseDuration(text: string): number | null {
  let total = 0;
  const hourMatch = text.match(/(\d+)\s*시간/);
  const minMatch = text.match(/(\d+)\s*분/);
  
  if (!hourMatch && !minMatch) return null;
  
  if (hourMatch) total += parseInt(hourMatch[1]) * 60 * 60 * 1000;
  if (minMatch) total += parseInt(minMatch[1]) * 60 * 1000;
  
  return total;
}

// ============================================================================
// Types
// ============================================================================

interface Session {
  userId: string;
  start: number;
  end: number;
  duration: number;
}
