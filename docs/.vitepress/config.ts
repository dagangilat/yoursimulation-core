import { defineConfig } from 'vitepress';

// Standalone open-engine docs site (deployed from yoursimulation-core).
// `base` is '/' for a custom domain / user-or-org Pages; for a GitHub *project*
// Pages site (dagangilat.github.io/yoursimulation-core/) set base to
// '/yoursimulation-core/'. outDir defaults to docs/.vitepress/dist.
export default defineConfig({
  title: 'YourSimulation Engine',
  description: 'Open-source discrete-event simulation engine — model service, queue, and network systems.',
  base: '/',
  cleanUrls: true,
  ignoreDeadLinks: false,
  srcExclude: ['superpowers/**', '**/*.draft.md', '**/plans/**', '**/specs/**', '????-??-??-*.md'],
  markdown: { math: true },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#4F46E5' }],
  ],
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: 'API & CLI', link: '/api' },
      { text: 'Blocks', link: '/blocks' },
      { text: 'Examples', link: '/examples' },
      { text: 'Theory', link: '/theory/01-discrete-event-simulation' },
      { text: 'Tutorial', link: '/tutorial' },
      { text: 'Try the app', link: 'https://yoursimulation-app.web.app' },
    ],
    sidebar: [
      {
        text: 'Engine',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'API & CLI', link: '/api' },
          { text: 'Blocks reference', link: '/blocks' },
          { text: 'Example domain models', link: '/examples' },
          { text: 'Tutorial: model an airport', link: '/tutorial' },
          { text: 'Glossary', link: '/glossary' },
        ],
      },
      {
        text: 'Theory',
        items: [
          { text: 'Discrete-event simulation', link: '/theory/01-discrete-event-simulation' },
          { text: 'Queueing theory (M/M/1 & M/M/c)', link: '/theory/02-queueing-theory' },
          { text: 'Distributions', link: '/theory/03-distributions' },
          { text: 'Cross-Entropy optimization', link: '/theory/04-cross-entropy' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Architecture', link: '/architecture' },
          { text: 'Development timeline', link: '/development-timeline' },
        ],
      },
    ],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/dagangilat/yoursimulation-core' }],
  },
});
