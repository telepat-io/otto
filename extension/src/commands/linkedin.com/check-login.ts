import type { SiteCommand } from '../types.js';

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
    const authState = await ctx.executeScript(
      /* c8 ignore start */
      async () => {
        try {
          const response = await fetch('https://www.linkedin.com/litms/api/metadata/user', {
            credentials: 'include',
            cache: 'no-store',
            headers: {
              accept: 'application/json',
            },
          });

          if (!response.ok) {
            return {
              authenticated: false,
              source: 'http-error',
            };
          }

          const body = await response.json() as Record<string, unknown>;
          const client = body.client && typeof body.client === 'object' && body.client !== null
            ? body.client as Record<string, unknown>
            : undefined;
          const isUserLoggedIn = client?.isUserLoggedIn === true;

          return {
            authenticated: Boolean(isUserLoggedIn),
            source: 'api',
          };
        } catch {
          return {
            authenticated: false,
            source: 'fetch-failure',
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
