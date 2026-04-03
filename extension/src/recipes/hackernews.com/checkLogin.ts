import type { SiteRecipe } from '../types.js';

export const checkLoginRecipe: SiteRecipe = {
  metadata: {
    site: 'news.ycombinator.com',
    id: 'checkLogin',
    displayName: 'Check Hacker News Login',
    description: 'Checks whether the current Hacker News tab appears authenticated.',
    tags: ['auth', 'builtin'],
    requiresAuth: false,
  },
  async execute(ctx) {
    const authenticated = await ctx.executeScript(
      () => Boolean(document.querySelector('a#logout, a[href*="logout"]')),
      [],
    );
    return { authenticated: Boolean(authenticated) };
  },
};
