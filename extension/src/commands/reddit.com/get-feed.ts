import type { Post } from '@telepat/otto-protocol';
import type { SiteCommand } from '../types.js';

const MAX_POSTS = 20;
const MAX_CONCURRENT_FETCHES = 4;
const FETCH_TIMEOUT_MS = 8_000;

export const getFeedCommand: SiteCommand = {
  metadata: {
    site: 'reddit.com',
    id: 'getFeed',
    displayName: 'Get Reddit Feed',
    description: 'Extracts lightweight post summaries from the active Reddit feed page.',
    tags: ['feed', 'reddit'],
    requiresAuth: true,
    preloadHost: 'reddit.com',
    inputFields: [],
  },
  async execute(ctx) {
    const result = await ctx.executeScript(
      async (maxPosts: number, maxConcurrentFetches: number, fetchTimeoutMs: number) => {
        type GenericRecord = Record<string, unknown>;
        type RedditListingNode = { kind?: unknown; data?: GenericRecord };

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

        const appendJsonSuffix = (value: string): string => {
          const parsed = new URL(value);
          if (!parsed.pathname.endsWith('.json')) {
            parsed.pathname = parsed.pathname.endsWith('/')
              ? `${parsed.pathname.slice(0, -1)}.json`
              : `${parsed.pathname}.json`;
          }
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

        const collectPostUrls = (limit: number): string[] => {
          const feedRoot = document.querySelector('#main-content');
          if (!feedRoot) {
            return [];
          }

          const rows = Array.from(feedRoot.querySelectorAll('shreddit-post, [data-testid="post-container"]'));
          const urls = new Set<string>();

          const addUrl = (candidateHref: string | null | undefined): void => {
            if (!candidateHref) {
              return;
            }
            const normalized = normalizeRedditUrl(candidateHref);
            if (!normalized || !normalized.includes('/comments/')) {
              return;
            }
            urls.add(normalized);
          };

          for (const row of rows) {
            if (urls.size >= limit) {
              break;
            }

            const anchors = Array.from(row.querySelectorAll('a[href*="/comments/"]'));
            for (const anchor of anchors) {
              addUrl(anchor.getAttribute('href'));
              if (urls.size >= limit) {
                break;
              }
            }
          }

          if (urls.size < limit) {
            const allAnchors = Array.from(feedRoot.querySelectorAll('a[href*="/comments/"]'));
            for (const anchor of allAnchors) {
              addUrl(anchor.getAttribute('href'));
              if (urls.size >= limit) {
                break;
              }
            }
          }

          return Array.from(urls).slice(0, limit);
        };

        const fetchJsonWithTimeout = async (url: string, timeoutMs: number): Promise<unknown> => {
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

            if (!response.ok) {
              return null;
            }

            return await response.json();
          } catch {
            return null;
          } finally {
            window.clearTimeout(timer);
          }
        };

        const postUrls = collectPostUrls(maxPosts);
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
            const jsonUrl = appendJsonSuffix(postUrl);
            const payload = await fetchJsonWithTimeout(jsonUrl, fetchTimeoutMs);
            const mapped = mapPostPayload(payload, postUrl);
            if (mapped) {
              outputPosts.push(mapped);
            }
          }
        };

        await Promise.all(Array.from({ length: workerCount }, async () => {
          await runWorker();
        }));

        return { posts: outputPosts };
      },
      [MAX_POSTS, MAX_CONCURRENT_FETCHES, FETCH_TIMEOUT_MS],
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
