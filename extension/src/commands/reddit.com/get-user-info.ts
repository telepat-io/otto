import type { SiteCommand } from '../types.js';
import type { UserProfile } from '@telepat/otto-protocol';

type UserInfoInput = {
  username?: string;
  id?: string;
};

export function normalizeId(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('t2_')) {
    return trimmed;
  }
  return `t2_${trimmed}`;
}

export function normalizeProfileUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `https://www.reddit.com${trimmed}`;
  }
  return undefined;
}

export function toIsoUtc(seconds: unknown): string | undefined {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return undefined;
  }
  return new Date(seconds * 1_000).toISOString();
}

export function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

export function mapProfileToUser(
  data: Record<string, unknown>,
  username: string,
  id: string,
): UserProfile {
  const subreddit = data.subreddit && typeof data.subreddit === 'object'
    ? data.subreddit as Record<string, unknown>
    : undefined;

  const resolvedUsername = typeof data.name === 'string' ? data.name : username || undefined;
  const resolvedIdRaw = typeof data.id === 'string' ? data.id : undefined;
  const resolvedId = resolvedIdRaw ? normalizeId(resolvedIdRaw) : (id ? normalizeId(id) : undefined);

  const flags: string[] = [];
  if (data.is_employee === true) {
    flags.push('employee');
  }
  if (data.is_mod === true) {
    flags.push('moderator');
  }
  if (data.is_blocked === true) {
    flags.push('blocked');
  }
  if (data.is_friend === true) {
    flags.push('friend');
  }

  const user: UserProfile = {
    kind: 'entity.user',
    id: resolvedId ?? (resolvedUsername ? `reddit:${resolvedUsername}` : 'reddit:unknown'),
    platform: 'reddit',
    username: resolvedUsername,
    displayName: pickString(subreddit?.title, subreddit?.display_name_prefixed),
    profileUrl: normalizeProfileUrl(subreddit?.url),
    avatarUrl: pickString(data.snoovatar_img, data.icon_img),
    bio: pickString(subreddit?.public_description, subreddit?.description),
    isVerified: data.verified === true,
    createdAt: toIsoUtc(data.created_utc),
    flags: flags.length > 0 ? flags : undefined,
    stats: {
      followers: typeof subreddit?.subscribers === 'number' ? subreddit.subscribers : undefined,
      reputation: typeof data.total_karma === 'number'
        ? data.total_karma
        : (typeof data.link_karma === 'number' && typeof data.comment_karma === 'number'
          ? data.link_karma + data.comment_karma
          : undefined),
      posts: typeof data.link_karma === 'number' ? data.link_karma : undefined,
      comments: typeof data.comment_karma === 'number' ? data.comment_karma : undefined,
    },
    originalEntity: data,
  };

  return user;
}

export const getUserInfoCommand: SiteCommand = {
  metadata: {
    site: 'reddit.com',
    id: 'getUserInfo',
    displayName: 'Get Reddit User Info',
    description: 'Fetches profile metadata for a Reddit user by username or account id.',
    tags: ['users', 'reddit'],
    requiresAuth: false,
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
        description: 'Reddit account id, with or without t2_ prefix. When both username and id are omitted, falls back to logged-in user via /api/me.json.',
        optional: true,
      },
    ],
  },
  async execute(ctx, input) {
    const parsed = (input ?? {}) as UserInfoInput;
    const username = typeof parsed.username === 'string' ? parsed.username.trim().replace(/^u\//, '') : '';
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';

    const resolveSelf = !username && !id;

    const profile = await ctx.executeScript(
      /* c8 ignore start */
      async (targetUsername: string, targetId: string, shouldResolveSelf: boolean) => {
        if (shouldResolveSelf) {
          const response = await fetch('https://www.reddit.com/api/me.json', {
            credentials: 'include',
            cache: 'no-store',
          });
          if (!response.ok) {
            throw new Error(`reddit_me_lookup_failed:${response.status}`);
          }
          const body = await response.json() as { data?: Record<string, unknown> };
          return body.data ?? null;
        }

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
      /* c8 ignore stop */
      [username, id, resolveSelf],
    );

    const data = profile && typeof profile === 'object' ? profile as Record<string, unknown> : null;
    if (!data) {
      throw new Error('reddit_user_not_found');
    }

    const user = mapProfileToUser(data, username, id);

    return {
      user,
      lookup: {
        username: username || undefined,
        id: id || undefined,
      },
    };
  },
};
