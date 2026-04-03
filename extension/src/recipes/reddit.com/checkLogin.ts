import type { SiteRecipe } from '../types.js';

export const checkLoginRecipe: SiteRecipe = {
  metadata: {
    site: 'reddit.com',
    id: 'checkLogin',
    displayName: 'Check Reddit Login',
    description: 'Checks whether the current Reddit tab appears authenticated.',
    tags: ['auth', 'builtin'],
    requiresAuth: false,
  },
  async execute(ctx) {
    const authenticated = await ctx.executeScript(
      () => {
        const selectors = [
          'a[href*="/logout"]',
          'button[aria-label*="Open user menu"]',
          '[id^="USER_DROPDOWN_ID"]',
          '[data-testid="user-dropdown-toggle"]',
        ];
        return selectors.some((selector) => Boolean(document.querySelector(selector)));
      },
      [],
    );

    return { authenticated: Boolean(authenticated) };
  },
};
