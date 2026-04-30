import type { SiteCommand } from '../types.js';

export const checkLoginCommand: SiteCommand = {
  metadata: {
    site: 'google.com',
    id: 'checkLogin',
    displayName: 'Check Google Login',
    description: 'Checks whether the current Google tab appears authenticated.',
    tags: ['auth', 'builtin'],
    requiresAuth: false,
    inputFields: [],
  },
  async execute(ctx) {
    const authenticated = await ctx.executeScript(
      /* c8 ignore start */
      () => Boolean(document.querySelector('a[href*="accounts.google.com/SignOutOptions"], [aria-label*="Google Account"]')),
      /* c8 ignore stop */
      [],
    );
    return { authenticated: Boolean(authenticated) };
  },
};
