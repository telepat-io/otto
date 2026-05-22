import type { SiteCommand } from '../types.js';

export function normalizeCheckLoginResult(authState: unknown): {
  authenticated: boolean;
  username: string | undefined;
  id: string | undefined;
  avatar: string | undefined;
  source: string | undefined;
} {
  const result = authState && typeof authState === 'object' ? authState as Record<string, unknown> : {};
  return {
    authenticated: Boolean(result.authenticated),
    username: typeof result.username === 'string' ? result.username : undefined,
    id: typeof result.id === 'string' ? result.id : undefined,
    avatar: typeof result.avatar === 'string' ? result.avatar : undefined,
    source: typeof result.source === 'string' ? result.source : undefined,
  };
}

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
      /* c8 ignore start */
      async () => {
        const CHECK_LOGIN_MAX_ATTEMPTS = 4;
        const CHECK_LOGIN_RETRY_DELAY_MS = 1500;

        const fallbackSelectors = [
          'a[href*="/logout"]',
          'button[aria-label*="Open user menu"]',
          '[id^="USER_DROPDOWN_ID"]',
          '[data-testid="user-dropdown-toggle"]',
        ];

        const checkDomFallback = (): boolean =>
          fallbackSelectors.some((selector) => Boolean(document.querySelector(selector)));

        const tryApiMe = async (): Promise<{ authenticated: boolean; username?: string; id?: string; avatar?: string; source: string } | null> => {
          try {
            const response = await fetch('https://www.reddit.com/api/me.json', {
              credentials: 'include',
              cache: 'no-store',
            });

            if (!response.ok) {
              return null;
            }

            const body = await response.json() as { data?: Record<string, unknown> };
            const data = body?.data;
            const username = typeof data?.name === 'string' ? data.name : undefined;

            if (username) {
              const id = typeof data?.id === 'string' ? data.id : undefined;
              const snoovatar = typeof data?.snoovatar_img === 'string' ? data.snoovatar_img : undefined;
              const icon = typeof data?.icon_img === 'string' ? data.icon_img : undefined;
              return { authenticated: true, username, id, avatar: snoovatar || icon, source: 'api' };
            }

            return null;
          } catch {
            return null;
          }
        };

        for (let attempt = 0; attempt < CHECK_LOGIN_MAX_ATTEMPTS; attempt++) {
          const apiResult = await tryApiMe();
          if (apiResult && apiResult.authenticated) {
            return apiResult;
          }

          const fallbackAuthenticated = checkDomFallback();
          if (fallbackAuthenticated) {
            return { authenticated: true, source: 'dom-fallback' };
          }

          if (attempt < CHECK_LOGIN_MAX_ATTEMPTS - 1) {
            await new Promise((resolve) => { setTimeout(resolve, CHECK_LOGIN_RETRY_DELAY_MS); });
          }
        }

        return { authenticated: false, source: 'api' };
      },
      /* c8 ignore stop */
      [],
    );

    return normalizeCheckLoginResult(authState);
  },
};
