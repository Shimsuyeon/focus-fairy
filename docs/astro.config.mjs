// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://focus-fairy-docs.pages.dev',
	integrations: [
		starlight({
			title: '집중요정',
			description: '팀의 집중 시간을 시각화하는 Slack 봇',
			defaultLocale: 'root',
			locales: {
				root: { label: '한국어', lang: 'ko' },
				en: { label: 'English', lang: 'en' },
			},
			social: {
				github: 'https://github.com/Shimsuyeon/focus-fairy',
			},
			sidebar: [
				{
					label: '시작하기',
					translations: { en: 'Getting Started' },
					items: [
						{ label: '소개', translations: { en: 'Introduction' }, slug: 'index' },
						{ label: '설치하기', translations: { en: 'Installation' }, slug: 'getting-started' },
					],
				},
				{
					label: '명령어',
					translations: { en: 'Commands' },
					autogenerate: { directory: 'commands' },
				},
				{
					label: '설정',
					translations: { en: 'Settings' },
					autogenerate: { directory: 'settings' },
				},
			],
		}),
	],
});
