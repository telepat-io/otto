import type { SiteCommand } from '../types.js';
import type { SearchResult } from '@telepat/otto-protocol';

const MAX_PAGES = 5;
const PAGE_SIZE = 10;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export const getSearchResultsCommand: SiteCommand = {
  metadata: {
    site: 'google.com',
    id: 'getSearchResults',
    displayName: 'Get Google Search Results',
    description: 'Searches Google and returns structured results (title, url, description, links, image) from one or more SERP pages.',
    tags: ['search', 'google', 'serp'],
    requiresAuth: false,
    inputFields: [
      {
        name: 'query',
        type: 'string',
        description: 'The search query to look up on Google.',
      },
      {
        name: 'limit',
        type: 'number',
        description: `Maximum total results to return across all pages (1–${MAX_LIMIT}). Defaults to ${DEFAULT_LIMIT}.`,
        optional: true,
      },
      {
        name: 'pages',
        type: 'number',
        description: `Number of SERP pages to fetch (1–${MAX_PAGES}). Defaults to 1.`,
        optional: true,
      },
    ],
  },

  async execute(ctx, input) {
    const query = (input.query as string).trim();
    const rawLimit = typeof input.limit === 'number' ? input.limit : DEFAULT_LIMIT;
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)));
    const rawPages = typeof input.pages === 'number' ? input.pages : 1;
    const pages = Math.min(MAX_PAGES, Math.max(1, Math.floor(rawPages)));

    const allResults: SearchResult[] = [];

    for (let page = 1; page <= pages; page++) {
      if (allResults.length >= limit) break;

      const start = (page - 1) * PAGE_SIZE;
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}${start > 0 ? `&start=${start}` : ''}`;

      await ctx.navigateTab(searchUrl);

      const remaining = limit - allResults.length;
      const maxThisPage = Math.min(PAGE_SIZE, remaining);

      const pageResults = await ctx.executeScript(
        (maxResults: number, rankOffset: number) => {
          function unwrapGoogleUrl(href: string): string | null {
            if (!href) return null;
            try {
              const u = new URL(href);
              // Google sometimes wraps via /url?q=<target>
              const q = u.searchParams.get('q');
              if (q && (q.startsWith('http://') || q.startsWith('https://'))) return q;
              return href;
            } catch {
              return href;
            }
          }

          type RawResult = {
            kind: 'content.search_result';
            id: string;
            title: string | null;
            url: string | null;
            description: string | null;
            links: Array<{ text: string; url: string }> | undefined;
            image: string | null;
            rank: number;
            isAd: boolean;
          };

          // jsname="UWckNb" is a compiled symbol Google uses for the main result
          // anchor — stable across SERP redesigns unlike CSS class names.
          // data-snf="x5WNvb"  → title/link block
          // data-snf="nke7rc"  → description/snippet block
          // data-snc           → per-result container wrapping the above blocks
          const anchors = Array.from(
            document.querySelectorAll<HTMLAnchorElement>('a[jsname="UWckNb"]'),
          );

          const results: RawResult[] = [];
          let rank = rankOffset + 1;

          for (const anchor of anchors) {
            if (results.length >= maxResults) break;

            // URL: href is already the direct destination URL; unwrap only if
            // Google wraps it via the /url?q= redirect.
            const url = anchor.href ? unwrapGoogleUrl(anchor.href) : null;

            // Title: h3 is a direct descendant of the anchor
            const titleEl = anchor.querySelector('h3');
            const title = titleEl?.textContent?.trim() ?? null;

            if (!title && !url) continue;

            // Result container: walk up to the element with data-snc which
            // groups all content blocks (title, description, sitelinks) for
            // one organic result.
            const container = anchor.closest('[data-snc]');

            // Description: the data-snf="nke7rc" block holds the snippet text.
            const descBlock = container?.querySelector('[data-snf="nke7rc"]');
            const description = descBlock?.textContent?.trim() ?? null;

            // Ad detection: Google marks ad containers with data-text-ad.
            const isAd = Boolean(
              anchor.closest('[data-text-ad]') ||
              container?.querySelector('[data-text-ad]'),
            );

            // Sitelinks: sub-links within the container that are not the main
            // result anchor and point to external (non-Google) URLs.
            const subLinks = Array.from(
              container?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [],
            )
              .filter((a) => a !== anchor && !anchor.contains(a))
              .map((a) => ({
                text: a.textContent?.trim() ?? '',
                url: unwrapGoogleUrl(a.href) ?? a.href,
              }))
              .filter(
                (l) =>
                  l.text.length > 0 &&
                  l.url.length > 0 &&
                  !l.url.includes('google.com') &&
                  !l.url.includes('gstatic.com'),
              )
              .slice(0, 6);
            const links = subLinks.length > 0 ? subLinks : undefined;

            // Thumbnail image: skip favicons (typically 18×18 or 16×16).
            const imgEls = Array.from(
              container?.querySelectorAll<HTMLImageElement>('img') ?? [],
            );
            const thumbEl = imgEls.find((img) => {
              if (img.src.startsWith('data:')) return false;
              const w = img.naturalWidth || img.width;
              const h = img.naturalHeight || img.height;
              return w > 32 || h > 32;
            });
            const image = thumbEl?.src ?? null;

            results.push({
              kind: 'content.search_result',
              id: String(rank),
              title,
              url,
              description,
              links,
              image,
              rank,
              isAd,
            });

            rank++;
          }

          return results;
        },
        [maxThisPage, start],
      );

      if (!Array.isArray(pageResults) || pageResults.length === 0) break;
      allResults.push(...(pageResults as SearchResult[]).slice(0, remaining));
    }

    return { results: allResults, query };
  },
};
