import type { SiteCommand } from '../types.js';

export const getFrontPageCommand: SiteCommand = {
  metadata: {
    site: 'news.ycombinator.com',
    id: 'getFrontPage',
    displayName: 'Get Hacker News Front Page',
    description: 'Extracts front-page story titles and links from Hacker News.',
    tags: ['feed', 'hackernews'],
    requiresAuth: false,
    preloadHost: 'news.ycombinator.com',
    inputFields: [],
  },
  async execute(ctx) {
    const stories = await ctx.executeScript(
      /* c8 ignore start */
      () => {
        const rows = Array.from(document.querySelectorAll('tr.athing')).slice(0, 30);
        return rows.map((row) => {
          const titleLink = row.querySelector<HTMLAnchorElement>('span.titleline > a');
          return {
            title: titleLink?.textContent?.trim() ?? null,
            href: titleLink?.href ?? null,
          };
        });
      },
      /* c8 ignore stop */
      [],
    );

    return { stories: Array.isArray(stories) ? stories : [] };
  },
};
