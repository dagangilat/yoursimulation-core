import { defineConfig } from 'vitepress';

// Docs build into the web app's dist so one `firebase deploy --only hosting`
// ships both. Run AFTER `apps/web` build (vite empties dist). See build:all.
export default defineConfig({
  title: 'YourSimulation',
  description: 'Discrete-event simulation for service, queue, and network systems.',
  base: '/docs/',
  outDir: '../apps/web/dist/docs',
  cleanUrls: true,
  ignoreDeadLinks: false,
  srcExclude: ['superpowers/**', '**/*.draft.md', '**/plans/**', '**/specs/**', '????-??-??-*.md'],
  markdown: { math: true },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/tutorial' },
      { text: 'Theory', link: '/theory/01-discrete-event-simulation' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'App', link: 'https://yoursimulation-app.web.app' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Overview', link: '/' },
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
    socialLinks: [{ icon: 'github', link: 'https://github.com/dagangilat/yoursimulation' }],
  },
});
