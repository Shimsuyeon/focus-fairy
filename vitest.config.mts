import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
// wrangler.jsonc 의 assets 디렉터리(dist/web)가 있어야 해서 먼저 만든다
import './scripts/build-web.mjs';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
			},
		},
	},
});
