/**
 * Slack Events API 핸들러.
 *
 * URL verification(설치 시 1회) + event_callback(상시) 두 가지 종류를 받는다.
 * 현재는 app_home_opened만 처리. 추가 이벤트는 handleEventCallback의 switch에 분기 추가.
 */

import { publishHomeView } from '../pages/home';

interface UrlVerification {
	type: 'url_verification';
	challenge: string;
}

interface EventCallback {
	type: 'event_callback';
	team_id: string;
	event: AppHomeOpenedEvent | { type: string };
}

interface AppHomeOpenedEvent {
	type: 'app_home_opened';
	user: string;
	tab?: 'home' | 'messages';
}

type SlackEventPayload = UrlVerification | EventCallback;

export async function handleEvent(request: Request, env: Env): Promise<Response> {
	let payload: SlackEventPayload;
	try {
		payload = (await request.json()) as SlackEventPayload;
	} catch {
		return new Response('Bad Request', { status: 400 });
	}

	if (payload.type === 'url_verification') {
		return new Response(JSON.stringify({ challenge: payload.challenge }), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (payload.type === 'event_callback') {
		return handleEventCallback(payload, env);
	}

	return new Response('', { status: 200 });
}

async function handleEventCallback(payload: EventCallback, env: Env): Promise<Response> {
	const { event, team_id } = payload;

	switch (event.type) {
		case 'app_home_opened': {
			const e = event as AppHomeOpenedEvent;
			// 홈 탭만 처리 (messages 탭 클릭에선 무시)
			if (e.tab && e.tab !== 'home') {
				return new Response('', { status: 200 });
			}
			await publishHomeView(env, team_id, e.user);
			return new Response('', { status: 200 });
		}
		default:
			return new Response('', { status: 200 });
	}
}
