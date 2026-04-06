import type { SiteRecipe } from '../types.js';

const HN_LOGIN_URL = 'https://news.ycombinator.com/login';

export const gotoLoginRecipe: SiteRecipe = {
  metadata: {
    site: 'news.ycombinator.com',
    id: 'gotoLogin',
    displayName: 'Go To Hacker News Login',
    description: 'Navigates the current tab to the Hacker News login page.',
    tags: ['auth', 'builtin'],
    requiresAuth: false,
    inputFields: [],
  },
  async execute(ctx) {
    await ctx.navigateTab(HN_LOGIN_URL);
    return { loginUrl: HN_LOGIN_URL };
  },
};
