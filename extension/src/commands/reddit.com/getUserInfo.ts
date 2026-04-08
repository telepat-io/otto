import type { SiteCommand } from '../types.js';

type UserInfoInput = {
  username?: string;
  id?: string;
};

function normalizeId(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('t2_')) {
    return trimmed;
  }
  return `t2_${trimmed}`;
}

export const getUserInfoCommand: SiteCommand = {
  metadata: {
    site: 'reddit.com',
    id: 'getUserInfo',
    displayName: 'Get Reddit User Info',
    description: 'Fetches profile metadata for a Reddit user by username or account id.',
    tags: ['users', 'reddit'],
    requiresAuth: false,
    inputAtLeastOneOf: ['username', 'id'],
    inputFields: [
      {
        name: 'username',
        type: 'string',
        description: 'Reddit username; when provided takes priority over id lookup.',
        optional: true,
      },
      {
        name: 'id',
        type: 'string',
        description: 'Reddit account id, with or without t2_ prefix.',
        optional: true,
      },
    ],
  },
  async execute(ctx, input) {
    const parsed = (input ?? {}) as UserInfoInput;
    const username = typeof parsed.username === 'string' ? parsed.username.trim().replace(/^u\//, '') : '';
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';

    if (!username && !id) {
      throw new Error('getUserInfo requires input.username or input.id');
    }

    const profile = await ctx.executeScript(
      async (targetUsername: string, targetId: string) => {
        if (targetUsername) {
          const response = await fetch(`https://www.reddit.com/user/${encodeURIComponent(targetUsername)}/about.json`, {
            credentials: 'include',
            cache: 'no-store',
          });
          if (!response.ok) {
            throw new Error(`reddit_user_lookup_failed:${response.status}`);
          }
          const body = await response.json() as { data?: Record<string, unknown> };
          return body.data ?? null;
        }

        const normalizedId = targetId.startsWith('t2_') ? targetId : `t2_${targetId}`;
        const response = await fetch(
          `https://www.reddit.com/api/user_data_by_account_ids.json?ids=${encodeURIComponent(normalizedId)}`,
          {
            credentials: 'include',
            cache: 'no-store',
          },
        );
        if (!response.ok) {
          throw new Error(`reddit_user_lookup_failed:${response.status}`);
        }
        const body = await response.json() as Record<string, Record<string, unknown> | undefined>;
        return body[normalizedId] ?? null;
      },
      [username, id],
    );

    const data = profile && typeof profile === 'object' ? profile as Record<string, unknown> : null;
    if (!data) {
      throw new Error('reddit_user_not_found');
    }

    const resolvedUsername = typeof data.name === 'string' ? data.name : username || undefined;
    const resolvedIdRaw = typeof data.id === 'string' ? data.id : undefined;
    const resolvedId = resolvedIdRaw ? normalizeId(resolvedIdRaw) : (id ? normalizeId(id) : undefined);

    return {
      username: resolvedUsername,
      id: resolvedId,
      avatar: typeof data.snoovatar_img === 'string'
        ? data.snoovatar_img
        : (typeof data.icon_img === 'string' ? data.icon_img : undefined),
      createdUtc: typeof data.created_utc === 'number' ? data.created_utc : undefined,
      isBlocked: data.is_blocked === true,
      isMod: data.is_mod === true,
      isEmployee: data.is_employee === true,
      acceptChats: typeof data.accept_chats === 'boolean' ? data.accept_chats : undefined,
      raw: data,
    };
  },
};
