import type { SiteCommand } from '../types.js';

const LINKEDIN_LOGIN_URL = 'https://www.linkedin.com/login';

export const gotoLoginCommand: SiteCommand = {
  metadata: {
    site: 'linkedin.com',
    id: 'gotoLogin',
    displayName: 'Go To LinkedIn Login',
    description: 'Navigates the current tab to the LinkedIn login page.',
    tags: ['auth', 'builtin'],
    requiresAuth: false,
    inputFields: [],
  },
  async execute(ctx) {
    await ctx.navigateTab(LINKEDIN_LOGIN_URL);
    return {
      loginUrl: LINKEDIN_LOGIN_URL,
    };
  },
  async test(_ctx, _input, helpers) {
    return helpers.execute();
  },
};
