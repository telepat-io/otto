import type { SiteCommand } from '../types.js';

export const checkLoginCommand: SiteCommand = {
  metadata: {
    site: 'reddit.com',
    id: 'checkLogin',
    displayName: 'Check Reddit Login',
    description: 'Checks whether the current Reddit tab appears authenticated.',
    tags: ['auth', 'builtin'],
    requiresAuth: false,
    inputFields: [],
  },
  async execute(ctx) {
    const authState = await ctx.executeScript(
      async () => {
        const fallbackSelectors = [
          'a[href*="/logout"]',
          'button[aria-label*="Open user menu"]',
          '[id^="USER_DROPDOWN_ID"]',
          '[data-testid="user-dropdown-toggle"]',
        ];

        const fallbackAuthenticated = fallbackSelectors.some((selector) => Boolean(document.querySelector(selector)));

        try {
          const response = await fetch('https://www.reddit.com/api/me.json', {
            credentials: 'include',
            cache: 'no-store',
          });

          if (!response.ok) {
            return {
              authenticated: fallbackAuthenticated,
              source: fallbackAuthenticated ? 'dom-fallback' : 'api',
            };
          }

          const body = await response.json() as { data?: Record<string, unknown> };
          const data = body?.data;
          const username = typeof data?.name === 'string' ? data.name : undefined;
          const id = typeof data?.id === 'string' ? data.id : undefined;
          const snoovatar = typeof data?.snoovatar_img === 'string' ? data.snoovatar_img : undefined;
          const icon = typeof data?.icon_img === 'string' ? data.icon_img : undefined;

          if (username) {
            return {
              authenticated: true,
              username,
              id,
              avatar: snoovatar || icon,
              source: 'api',
            };
          }

          return {
            authenticated: fallbackAuthenticated,
            source: fallbackAuthenticated ? 'dom-fallback' : 'api',
          };
        } catch {
          return {
            authenticated: fallbackAuthenticated,
            source: 'dom-fallback',
          };
        }
      },
      [],
    );

    const result = authState && typeof authState === 'object' ? authState as Record<string, unknown> : {};
    return {
      authenticated: Boolean(result.authenticated),
      username: typeof result.username === 'string' ? result.username : undefined,
      id: typeof result.id === 'string' ? result.id : undefined,
      avatar: typeof result.avatar === 'string' ? result.avatar : undefined,
      source: typeof result.source === 'string' ? result.source : undefined,
    };
  },
};
