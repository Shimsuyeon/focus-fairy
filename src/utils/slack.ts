/**
 * 슬랙 응답 유틸리티
 */

/** 슬랙 in_channel 응답 생성 */
export function reply(text: string): Response {
	return new Response(JSON.stringify({ response_type: 'in_channel', text }), {
		headers: { 'Content-Type': 'application/json' },
	});
}

