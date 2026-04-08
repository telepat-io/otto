import type { SiteCommand } from '../types.js';

export const checkLoginCommand: SiteCommand = {
  metadata: {
    site: 'news.ycombinator.com',
    id: 'checkLogin',
    displayName: 'Check Hacker News Login',
    description: 'Checks whether the current Hacker News tab appears authenticated.',
    tags: ['auth', 'builtin'],
    requiresAuth: false,
    inputFields: [],
  },
  async execute(ctx) {
    const authenticated = await ctx.executeScript(
      () => Boolean(document.querySelector('a#logout, a[href*="logout"]')),
      [],
    );
    return { authenticated: Boolean(authenticated) };
  },
};
