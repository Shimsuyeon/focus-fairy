/**
 * 운영자용 사용 현황 — npm run usage (-- --json)
 *
 * 운영 KV(STUDY_KV)를 읽기만 해서 src/services/usage.ts 로 합계를 내고 터미널에 출력한다.
 * 서버에 운영자용 페이지를 두지 않으려고 로컬에서만 돈다. 인증은 이미 로그인한 wrangler를 그대로 쓴다.
 * - 키 목록: `wrangler kv key list --remote` (이때 wrangler가 로그인 토큰을 갱신한다)
 * - 값: Cloudflare API (wrangler 로그인 토큰, 또는 CLOUDFLARE_API_TOKEN)
 * 출력에는 합계만 있다. 사용자 ID·계획 내용·토큰은 출력하지 않는다.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUsageReport, renderUsageText, type UsageKVReader } from '../src/services/usage.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.cloudflare.com/client/v4';
const CONCURRENCY = 8;

function fail(message: string): never {
	console.error(`❌ ${message}`);
	process.exit(1);
}

function namespaceId(): string {
	const config = readFileSync(join(root, 'wrangler.jsonc'), 'utf8');
	const match = /"binding":\s*"STUDY_KV",\s*"id":\s*"([0-9a-f]+)"/.exec(config);
	if (!match) fail('wrangler.jsonc 에서 STUDY_KV 네임스페이스 ID를 찾지 못했어요.');
	return match[1];
}

function listKeysWithWrangler(): string[] {
	try {
		const out = execFileSync('npx', ['wrangler', 'kv', 'key', 'list', '--binding', 'STUDY_KV', '--remote'], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 64 * 1024 * 1024,
		});
		return (JSON.parse(out.slice(out.indexOf('['))) as Array<{ name: string }>).map((k) => k.name);
	} catch {
		fail('KV 키 목록을 읽지 못했어요. `npx wrangler login` 이 되어 있는지 확인해주세요.');
	}
}

function apiToken(): string {
	if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
	const candidates = [
		join(homedir(), 'Library/Preferences/.wrangler/config/default.toml'),
		join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), '.wrangler/config/default.toml'),
		join(homedir(), '.wrangler/config/default.toml'),
	];
	for (const path of candidates) {
		if (!existsSync(path)) continue;
		const match = /oauth_token\s*=\s*"([^"]+)"/.exec(readFileSync(path, 'utf8'));
		if (match) return match[1];
	}
	fail('wrangler 로그인 토큰을 찾지 못했어요. `npx wrangler login` 하거나 CLOUDFLARE_API_TOKEN 을 설정해주세요.');
}

async function cf(token: string, path: string): Promise<Response> {
	return fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

async function accountId(token: string): Promise<string> {
	if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
	const data = (await (await cf(token, '/accounts')).json()) as { result?: Array<{ id: string }> };
	if (!data.result?.length) fail('Cloudflare 계정을 찾지 못했어요. CLOUDFLARE_ACCOUNT_ID 를 설정해주세요.');
	return data.result[0].id;
}

/** 동시에 너무 많이 요청하지 않도록 */
function limit(concurrency: number) {
	let active = 0;
	const queue: Array<() => void> = [];
	return async <T>(task: () => Promise<T>): Promise<T> => {
		if (active >= concurrency) await new Promise<void>((resolve) => queue.push(resolve));
		active++;
		try {
			return await task();
		} finally {
			active--;
			queue.shift()?.();
		}
	};
}

async function slackTeamName(botToken: string): Promise<string | null> {
	try {
		const res = await fetch('https://slack.com/api/auth.test', { method: 'POST', headers: { Authorization: `Bearer ${botToken}` } });
		const data = (await res.json()) as { ok: boolean; team?: string };
		return data.ok && data.team ? data.team : null;
	} catch {
		return null;
	}
}

async function main() {
	const asJson = process.argv.includes('--json');
	const keys = listKeysWithWrangler();
	const token = apiToken();
	const account = await accountId(token);
	const ns = namespaceId();
	const run = limit(CONCURRENCY);
	const keySet = new Set(keys);

	const kv: UsageKVReader = {
		listKeys: async () => keys,
		get: (key) =>
			run(async () => {
				const res = await cf(token, `/accounts/${account}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(key)}`);
				if (res.status === 404) return null;
				if (!res.ok) fail(`KV 값을 읽지 못했어요 (${res.status}). \`npx wrangler login\` 을 다시 해보세요.`);
				return res.text();
			}),
	};

	// 워크스페이스 이름: 캐시된 이름 → 봇 토큰으로 Slack auth.test → 없으면 ID
	const teamName = async (teamId: string) => {
		if (keySet.has(`${teamId}:teamName`)) {
			const cached = await kv.get(`${teamId}:teamName`);
			if (cached) return cached;
		}
		if (keySet.has(`tokens:${teamId}`)) {
			const botToken = await kv.get(`tokens:${teamId}`);
			if (botToken) return (await slackTeamName(botToken)) || teamId;
		}
		return teamId;
	};

	const report = await buildUsageReport(kv, { teamName });
	console.log(asJson ? JSON.stringify(report, null, 2) : renderUsageText(report));
}

main();
