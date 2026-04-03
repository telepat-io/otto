import type { SiteRecipe } from '../types.js';

const REDDIT_LOGIN_URL = 'https://www.reddit.com/login/';

export const gotoLoginRecipe: SiteRecipe = {
  metadata: {
    site: 'reddit.com',
    id: 'gotoLogin',
    displayName: 'Go To Reddit Login',
    description: 'Navigates the current tab to the Reddit login page.',
    tags: ['auth', 'builtin'],
    requiresAuth: false,
  },
  async execute(ctx) {
    await ctx.navigateTab(REDDIT_LOGIN_URL);
    return { loginUrl: REDDIT_LOGIN_URL };
  },
};
