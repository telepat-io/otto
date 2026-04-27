import type { SiteCommand } from '../types.js';

const GOOGLE_LOGIN_URL = 'https://accounts.google.com/ServiceLogin';

export const gotoLoginCommand: SiteCommand = {
  metadata: {
    site: 'google.com',
    id: 'gotoLogin',
    displayName: 'Go To Google Login',
    description: 'Navigates the current tab to the Google accounts login page.',
    tags: ['auth', 'builtin'],
    requiresAuth: false,
    inputFields: [],
  },
  async execute(ctx) {
    await ctx.navigateTab(GOOGLE_LOGIN_URL);
    return { loginUrl: GOOGLE_LOGIN_URL };
  },
};
