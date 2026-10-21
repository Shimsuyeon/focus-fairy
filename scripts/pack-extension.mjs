/**
 * 크롬 웹스토어 제출용 익스텐션 zip 만들기 — npm run pack:extension
 *
 * extension/ 을 dist/extension/ 으로 복사하면서
 * - manifest에서 개발용 localhost 권한·content script 매치를 뺀다 (스토어 심사에서 불필요한 권한으로 보일 수 있음)
 * - README.md 는 넣지 않는다
 * 결과: dist/focus-fairy-extension-<version>.zip
 *
 * 개발할 때는 지금처럼 extension/ 폴더를 그대로 "압축해제된 확장 프로그램"으로 로드하면 된다 (localhost 포함).
 */

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'extension');
const outDir = join(root, 'dist');
const staging = join(outDir, 'extension');

const isDevOnly = (pattern) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(pattern);

rmSync(staging, { recursive: true, force: true });
cpSync(source, staging, { recursive: true, filter: (path) => !path.endsWith('README.md') && !path.endsWith('.DS_Store') });

const manifestPath = join(staging, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = manifest.host_permissions.filter((p) => !isDevOnly(p));
for (const script of manifest.content_scripts ?? []) {
	script.matches = script.matches.filter((p) => !isDevOnly(p));
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');

const zipPath = join(outDir, `focus-fairy-extension-${manifest.version}.zip`);
if (existsSync(zipPath)) rmSync(zipPath);
execFileSync('zip', ['-r', '-X', '-q', zipPath, '.'], { cwd: staging });

console.log(`✅ ${zipPath}`);
console.log(`   host_permissions: ${manifest.host_permissions.join(', ')}`);
