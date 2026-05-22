import type { Post } from '@telepat/otto-protocol';
import type { SiteCommand } from '../types.js';

const DEFAULT_MIN_RETURNED_POSTS = 20;
const MAX_MIN_RETURNED_POSTS = 100;
const MAX_CONCURRENT_FETCHES = 4;
const FETCH_TIMEOUT_MS = 8_000;

const VALID_SOURCES = ['home', 'subreddit', 'user'];
const VALID_SORTS = ['best', 'hot', 'new', 'top', 'rising'];
const VALID_T = ['hour', 'day', 'week', 'month', 'year', 'all'];

export const getPostsCommand: SiteCommand = {
  metadata: {
    site: 'reddit.com',
    id: 'getPosts',
    displayName: 'Get Reddit Posts',
    description: 'Fetches Reddit posts via the JSON API from home feed, subreddit listings, or user submitted posts with configurable sort and time filters.',
    tags: ['feed', 'posts', 'reddit'],
    requiresAuth: true,
    requiresDebuggerFocus: true,
    preloadHost: 'www.reddit.com',
    timeoutPolicy: {
      defaultMs: 60_000,
      scaling: {
        inputField: 'minReturnedPosts',
        baseMs: 45_000,
        perUnitMs: 2_000,
        minMs: 45_000,
        maxMs: 300_000,
      },
    },
    inputFields: [
      {
        name: 'source',
        type: 'string',
        description: 'Feed source: home (default), subreddit, or user.',
        optional: true,
      },
      {
        name: 'subreddit',
        type: 'string',
        description: 'Subreddit name without r/ prefix. Required when source is subreddit.',
        optional: true,
      },
      {
        name: 'username',
        type: 'string',
        description: 'Reddit username without u/ prefix. Required when source is user.',
        optional: true,
      },
      {
        name: 'sort',
        type: 'string',
        description: 'Sort order for home and subreddit sources: best (default), hot, new, top, rising.',
        optional: true,
      },
      {
        name: 't',
        type: 'string',
        description: 'Time filter when sort is top: hour, day (default), week, month, year, all.',
        optional: true,
      },
      {
        name: 'minReturnedPosts',
        type: 'number',
        description: 'Minimum number of posts to return (default 20, max 100). Also used as the API page limit.',
        optional: true,
      },
    ],
  },
  async execute(ctx, input) {
    const source = typeof input.source === 'string' ? input.source.trim() : 'home';
    if (!VALID_SOURCES.includes(source)) {
      throw new Error(`getPosts source must be one of: ${VALID_SOURCES.join(', ')}`);
    }

    const subredditRaw = typeof input.subreddit === 'string' ? input.subreddit.trim() : '';
    const subreddit = subredditRaw.replace(/^r\//, '') || null;
    if (source === 'subreddit' && !subreddit) {
      throw new Error('getPosts requires subreddit when source is subreddit');
    }

    const usernameRaw = typeof input.username === 'string' ? input.username.trim() : '';
    const username = usernameRaw.replace(/^u\//, '') || null;
    if (source === 'user' && !username) {
      throw new Error('getPosts requires username when source is user');
    }

    const sort = typeof input.sort === 'string' ? input.sort.trim() : 'best';
    if (!VALID_SORTS.includes(sort)) {
      throw new Error(`getPosts sort must be one of: ${VALID_SORTS.join(', ')}`);
    }

    const t = typeof input.t === 'string' ? input.t.trim() : 'day';
    if (!VALID_T.includes(t)) {
      throw new Error(`getPosts t must be one of: ${VALID_T.join(', ')}`);
    }

    const minReturnedPostsRaw = input.minReturnedPosts;
    const minReturnedPosts = typeof minReturnedPostsRaw === 'number' && Number.isFinite(minReturnedPostsRaw)
      ? minReturnedPostsRaw
      : DEFAULT_MIN_RETURNED_POSTS;
    const boundedMinReturnedPosts = Math.max(1, Math.min(MAX_MIN_RETURNED_POSTS, Math.floor(minReturnedPosts)));

    const result = await ctx.executeScript(
      /* c8 ignore start */
      async (
        requestLimit: number,
        maxConcurrentFetches: number,
        fetchTimeoutMs: number,
        source: string,
        subreddit: string | null,
        username: string | null,
        sort: string,
        t: string,
      ) => {
        type GenericRecord = Record<string, unknown>;
        type RedditListingNode = { kind?: unknown; data?: GenericRecord };

        const MAX_RETRIES = 3;
        const BASE_BACKOFF_MS = 2000;
        const INTER_REQUEST_DELAY_MS = 500;

        const parseRateLimitReset = (headers: Headers): number | null => {
          const resetStr = headers.get('x-ratelimit-reset');
          if (resetStr !== null) {
            const reset = Number(resetStr);
            if (Number.isFinite(reset) && reset > 0) {
              return reset * 1000;
            }
          }
          return null;
        };

        const toIsoFromSeconds = (value: unknown): string | undefined => {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return undefined;
          }
          return new Date(value * 1000).toISOString();
        };

        const toIsoFromEdited = (value: unknown): string | undefined => {
          if (typeof value === 'number' && Number.isFinite(value)) {
            return new Date(value * 1000).toISOString();
          }
          if (typeof value === 'string' && value.trim().length > 0) {
            return value;
          }
          return undefined;
        };

        const createUserRef = (author: unknown, fullName: unknown): GenericRecord | undefined => {
          const authorText = typeof author === 'string' ? author.trim() : '';
          const fullNameText = typeof fullName === 'string' ? fullName.trim() : '';
          if (!authorText && !fullNameText) {
            return undefined;
          }

          return {
            id: fullNameText || authorText || 'unknown',
            username: authorText || undefined,
            displayName: authorText || undefined,
            platform: 'reddit',
          };
        };

        const normalizeRedditUrl = (value: string): string | null => {
          if (!value || value.trim().length === 0) {
            return null;
          }

          try {
            const parsed = new URL(value, window.location.origin);
            const host = parsed.hostname.toLowerCase();
            if (!host.endsWith('reddit.com')) {
              return null;
            }

            parsed.protocol = 'https:';
            parsed.hostname = 'www.reddit.com';
            parsed.hash = '';
            return parsed.toString();
          } catch {
            return null;
          }
        };

        const appendJsonSuffix = (value: string, requestLimit: number): string => {
          const parsed = new URL(value);
          if (!parsed.pathname.endsWith('.json')) {
            parsed.pathname = parsed.pathname.endsWith('/')
              ? `${parsed.pathname.slice(0, -1)}.json`
              : `${parsed.pathname}.json`;
          }
          parsed.searchParams.set('limit', String(requestLimit));
          parsed.searchParams.set('raw_json', '1');
          return parsed.toString();
        };

        const toCanonicalPostUrl = (permalink: unknown, fallback: string): string => {
          if (typeof permalink === 'string' && permalink.trim().length > 0) {
            const normalized = normalizeRedditUrl(permalink);
            if (normalized) {
              return normalized;
            }
          }
          return fallback;
        };

        const mapCommentNode = (
          node: unknown,
          parentPostId: string,
          parentCommentId: string | undefined,
          depth: number,
        ): GenericRecord | null => {
          if (!node || typeof node !== 'object') {
            return null;
          }

          const typedNode = node as RedditListingNode;
          if (typedNode.kind !== 't1' || !typedNode.data) {
            return null;
          }

          const data = typedNode.data;
          const idValue = typeof data.id === 'string' ? data.id : (typeof data.name === 'string' ? data.name : '');
          if (!idValue) {
            return null;
          }

          const replies: GenericRecord[] = [];
          const rawReplies = data.replies;
          if (rawReplies && typeof rawReplies === 'object') {
            const replyChildren = (rawReplies as { data?: { children?: unknown } }).data?.children;
            if (Array.isArray(replyChildren)) {
              for (const child of replyChildren) {
                const mapped = mapCommentNode(child, parentPostId, idValue, depth + 1);
                if (mapped) {
                  replies.push(mapped);
                }
              }
            }
          }

          return {
            kind: 'content.post_comment',
            id: idValue,
            parentPostId,
            parentCommentId,
            author: createUserRef(data.author, data.author_fullname),
            content: typeof data.body === 'string' ? data.body : undefined,
            publishedAt: toIsoFromSeconds(data.created_utc),
            editedAt: toIsoFromEdited(data.edited),
            score: typeof data.score === 'number' ? data.score : undefined,
            depth,
            comments: replies,
            meta: {
              site: 'reddit.com',
              source: 'reddit.json',
              rawEventType: 't1',
            },
            originalEntity: data,
          };
        };

        const mapPostPayload = (payload: unknown, fallbackUrl: string): GenericRecord | null => {
          if (!Array.isArray(payload) || payload.length === 0) {
            return null;
          }

          const listing = payload[0] as { data?: { children?: unknown } } | undefined;
          const children = listing?.data?.children;
          if (!Array.isArray(children)) {
            return null;
          }

          const postNode = children.find((entry) => {
            if (!entry || typeof entry !== 'object') {
              return false;
            }
            return (entry as RedditListingNode).kind === 't3';
          }) as RedditListingNode | undefined;

          if (!postNode?.data) {
            return null;
          }

          const postData = postNode.data;
          const postId = typeof postData.id === 'string' ? postData.id : (typeof postData.name === 'string' ? postData.name : '');
          if (!postId) {
            return null;
          }

          const commentNodes = (payload[1] as { data?: { children?: unknown } } | undefined)?.data?.children;
          const comments: GenericRecord[] = [];
          if (Array.isArray(commentNodes)) {
            for (const commentNode of commentNodes) {
              const mapped = mapCommentNode(commentNode, postId, undefined, 0);
              if (mapped) {
                comments.push(mapped);
              }
            }
          }

          const canonicalUrl = toCanonicalPostUrl(postData.permalink, fallbackUrl);
          const title = typeof postData.title === 'string' ? postData.title : '';
          if (!title) {
            return null;
          }

          return {
            kind: 'content.post',
            id: postId,
            title,
            url: canonicalUrl,
            author: createUserRef(postData.author, postData.author_fullname),
            publishedAt: toIsoFromSeconds(postData.created_utc),
            editedAt: toIsoFromEdited(postData.edited),
            content: typeof postData.selftext === 'string' && postData.selftext.trim().length > 0
              ? postData.selftext
              : undefined,
            community: typeof postData.subreddit_name_prefixed === 'string' && postData.subreddit_name_prefixed.trim().length > 0
              ? postData.subreddit_name_prefixed
              : (typeof postData.subreddit === 'string' && postData.subreddit.trim().length > 0
                ? `r/${postData.subreddit}`
                : undefined),
            score: typeof postData.score === 'number' ? postData.score : undefined,
            commentCount: typeof postData.num_comments === 'number' ? postData.num_comments : undefined,
            comments,
            meta: {
              site: 'reddit.com',
              source: 'reddit.json',
              rawEventType: 't3',
            },
            originalEntity: postData,
          };
        };

        const buildFeedJsonUrl = (source: string, subreddit: string | null, username: string | null, sort: string, t: string, requestLimit: number): string => {
          let pathname: string;
          if (source === 'user') {
            pathname = `/user/${encodeURIComponent(username ?? '')}/submitted`;
          } else if (source === 'subreddit') {
            pathname = `/r/${encodeURIComponent(subreddit ?? '')}/${sort}`;
          } else {
            pathname = `/${sort}`;
          }

          pathname = pathname.replace(/\/+$/, '');
          const params = new URLSearchParams();
          params.set('limit', String(requestLimit));
          params.set('raw_json', '1');
          if (sort === 'top' && t) {
            params.set('t', t);
          }

          return `https://www.reddit.com${pathname}.json?${params.toString()}`;
        };

        const fetchJsonWithTimeout = async (url: string, timeoutMs: number): Promise<unknown> => {
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timer = window.setTimeout(() => {
              controller.abort();
            }, timeoutMs);

            try {
              const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
                headers: {
                  Accept: 'application/json',
                },
                signal: controller.signal,
              });

              if (response.status === 429) {
                const resetMs = parseRateLimitReset(response.headers);
                const delayMs = resetMs !== null
                  ? resetMs + 1000
                  : Math.pow(2, attempt) * BASE_BACKOFF_MS;
                await new Promise((resolve) => {
                  setTimeout(resolve, delayMs);
                });
                continue;
              }

              if (!response.ok) {
                return null;
              }

              return await response.json();
            } catch {
              return null;
            } finally {
              window.clearTimeout(timer);
            }
          }

          return null;
        };

        const collectPostUrlsFromJsonFeed = async (
          feedJsonUrl: string,
          minCount: number,
          timeoutMs: number,
        ): Promise<string[]> => {
          const collected: string[] = [];
          let after: string | null = null;

          while (collected.length < minCount) {
            const pageUrl = after
              ? `${feedJsonUrl}&after=${encodeURIComponent(after)}`
              : feedJsonUrl;

            const payload = await fetchJsonWithTimeout(pageUrl, timeoutMs);
            if (!payload || typeof payload !== 'object') {
              break;
            }

            const listing = (payload as { data?: { children?: unknown[]; after?: string | null } }).data;
            const children = Array.isArray(listing?.children) ? listing.children : [];
            after = typeof listing?.after === 'string' && listing.after.length > 0 ? listing.after : null;

            for (const child of children) {
              if (!child || typeof child !== 'object') {
                continue;
              }

              const node = child as { kind?: string; data?: { permalink?: string } };
              if (node.kind !== 't3' || !node.data?.permalink) {
                continue;
              }

              const normalized = normalizeRedditUrl(node.data.permalink);
              if (normalized && normalized.includes('/comments/')) {
                collected.push(normalized);
              }
            }

            if (!after || children.length === 0) {
              break;
            }
          }

          return collected;
        };

        const feedJsonUrl = buildFeedJsonUrl(source, subreddit, username, sort, t, requestLimit);
        const postUrls = await collectPostUrlsFromJsonFeed(
          feedJsonUrl,
          requestLimit,
          fetchTimeoutMs,
        );
        if (postUrls.length === 0) {
          return { posts: [] };
        }

        const outputPosts: GenericRecord[] = [];
        const workerCount = Math.max(1, Math.min(maxConcurrentFetches, postUrls.length));
        let cursor = 0;

        const runWorker = async (): Promise<void> => {
          while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= postUrls.length) {
              return;
            }

            const postUrl = postUrls[index];
            const jsonUrl = appendJsonSuffix(postUrl, requestLimit);
            const payload = await fetchJsonWithTimeout(jsonUrl, fetchTimeoutMs);
            const mapped = mapPostPayload(payload, postUrl);
            if (mapped) {
              outputPosts.push(mapped);
            }

            if (index + 1 < postUrls.length) {
              await new Promise((resolve) => { setTimeout(resolve, INTER_REQUEST_DELAY_MS); });
            }
          }
        };

        await Promise.all(Array.from({ length: workerCount }, async () => {
          await runWorker();
        }));

        return { posts: outputPosts };
      },
      /* c8 ignore stop */
      [
        boundedMinReturnedPosts,
        MAX_CONCURRENT_FETCHES,
        FETCH_TIMEOUT_MS,
        source,
        subreddit,
        username,
        sort,
        t,
      ],
    );

    const rawPosts = result && typeof result === 'object' && Array.isArray((result as { posts?: unknown }).posts)
      ? (result as { posts: unknown[] }).posts
      : [];

    const posts = rawPosts.filter((value): value is Post => {
      if (!value || typeof value !== 'object') {
        return false;
      }

      const post = value as { kind?: unknown; id?: unknown; title?: unknown };
      return post.kind === 'content.post'
        && typeof post.id === 'string'
        && typeof post.title === 'string';
    });

    return { posts };
  },
};
