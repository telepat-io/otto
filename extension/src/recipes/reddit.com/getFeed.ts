import type { SiteRecipe } from '../types.js';

export const getFeedRecipe: SiteRecipe = {
  metadata: {
    site: 'reddit.com',
    id: 'getFeed',
    displayName: 'Get Reddit Feed',
    description: 'Extracts lightweight post summaries from the active Reddit feed page.',
    tags: ['feed', 'reddit'],
    requiresAuth: true,
    preloadHost: 'reddit.com',
    inputFields: [],
  },
  async execute(ctx) {
    const posts = await ctx.executeScript(
      () => {
        const rows = Array.from(document.querySelectorAll('shreddit-post, [data-testid="post-container"]')).slice(0, 20);
        return rows.map((row) => {
          const title =
            row.querySelector('h3')?.textContent?.trim() ||
            row.querySelector('[slot="title"]')?.textContent?.trim() ||
            null;
          const author =
            row.querySelector('a[href*="/user/"]')?.textContent?.trim() ||
            row.querySelector('[data-testid="post_author_link"]')?.textContent?.trim() ||
            null;
          return { title, author };
        });
      },
      [],
    );

    return { posts: Array.isArray(posts) ? posts : [] };
  },
};
