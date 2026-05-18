import type { SiteCommand } from '../types.js';

const LINKEDIN_AUTH_CHECK_URL = 'https://www.linkedin.com/feed/';

type LinkedInCheckLoginResult = {
  authenticated: boolean;
  source?: string;
};

function normalizeLinkedInCheckLoginResult(value: unknown): LinkedInCheckLoginResult {
  const result = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    authenticated: Boolean(result.authenticated),
    source: typeof result.source === 'string' ? result.source : undefined,
  };
}

export const checkLoginCommand: SiteCommand = {
  metadata: {
    site: 'linkedin.com',
    id: 'checkLogin',
    displayName: 'Check LinkedIn Login',
    description: 'Checks whether the current LinkedIn session is authenticated.',
    tags: ['auth', 'builtin'],
    requiresAuth: false,
    inputFields: [],
  },
  async execute(ctx) {
    await ctx.navigateTab(LINKEDIN_AUTH_CHECK_URL);

    const authState = await ctx.executeScript(
      /* c8 ignore start */
      async () => {
        const path = window.location.pathname.toLowerCase();
        const isLoginPath = path.startsWith('/login') || path.startsWith('/signup');
        const isFeedPath = path.startsWith('/feed');

        const hasLoggedInDomSignals = Boolean(document.querySelector(
          '.global-nav__me, .global-nav__me-photo, [data-test-global-nav-link="feed"]',
        ));

        try {
          const response = await fetch('/litms/api/metadata/user', {
            credentials: 'include',
            cache: 'no-store',
            headers: {
              accept: 'application/json',
            },
          });

          if (!response.ok) {
            return {
              authenticated: !isLoginPath && (isFeedPath || hasLoggedInDomSignals),
              source: 'http-error-fallback',
            };
          }

          const body = await response.json() as Record<string, unknown>;
          const client = body.client && typeof body.client === 'object' && body.client !== null
            ? body.client as Record<string, unknown>
            : undefined;
          const isUserLoggedIn = client?.isUserLoggedIn === true;

          if (!isUserLoggedIn && !isLoginPath && (isFeedPath || hasLoggedInDomSignals)) {
            return {
              authenticated: true,
              source: 'dom-path-fallback',
            };
          }

          return {
            authenticated: Boolean(isUserLoggedIn),
            source: 'api',
          };
        } catch {
          return {
            authenticated: !isLoginPath && (isFeedPath || hasLoggedInDomSignals),
            source: 'fetch-failure-fallback',
          };
        }
      },
      /* c8 ignore stop */
      [],
    );

    if (ctx.isSerializedScriptError(authState)) {
      return authState;
    }

    return normalizeLinkedInCheckLoginResult(authState);
  },
  async test(_ctx, _input, helpers) {
    return helpers.execute();
  },
};
