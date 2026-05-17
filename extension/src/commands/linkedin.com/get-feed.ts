import type { Post } from '@telepat/otto-protocol';
import type { SiteCommand } from '../types.js';

const LINKEDIN_FEED_URL = 'https://www.linkedin.com/feed/';
const DEFAULT_MIN_RETURNED_POSTS = 5;
const MAX_MIN_RETURNED_POSTS = 200;
const MAX_SCROLL_PASSES = 24;
const SCROLL_WAIT_MS = 650;
const INTER_SCROLL_PAUSE_MS = 900;
const STAGNANT_SCROLL_PASSES_TO_STOP = 3;
const POST_SCROLL_LOAD_TIMEOUT_MS = 4_000;
const POST_SCROLL_LOAD_POLL_MS = 200;
const CLIPBOARD_PERMISSION_WAIT_WINDOW_MS = 30_000;

export const getFeedCommand: SiteCommand = {
  metadata: {
    site: 'linkedin.com',
    id: 'getFeed',
    displayName: 'Get LinkedIn Feed',
    description: 'Extracts post summaries from the LinkedIn feed page.',
    tags: ['feed', 'linkedin'],
    requiresAuth: true,
    requiresDebuggerFocus: true,
    preloadHost: LINKEDIN_FEED_URL,
    timeoutPolicy: {
      defaultMs: 60_000,
      scaling: {
        inputField: 'minReturnedPosts',
        baseMs: 45_000,
        perUnitMs: 4_000,
        minMs: 45_000,
        maxMs: 300_000,
      },
    },
    inputFields: [
      {
        name: 'minReturnedPosts',
        type: 'number',
        description: 'Minimum number of feed posts to attempt to return by scrolling and loading additional feed items.',
        optional: true,
      },
      {
        name: 'getClipboardPermission',
        type: 'boolean',
        description: 'When true, keeps the page alive briefly so the user can grant clipboard permission for copying post URLs.',
        optional: true,
      },
    ],
  },
  async execute(ctx, input) {
    const getClipboardPermission = input.getClipboardPermission === true;
    const minReturnedPostsRaw = input.minReturnedPosts;
    const minReturnedPosts = typeof minReturnedPostsRaw === 'number' && Number.isFinite(minReturnedPostsRaw)
      ? minReturnedPostsRaw
      : DEFAULT_MIN_RETURNED_POSTS;
    const boundedMinReturnedPosts = getClipboardPermission
      ? 1
      : Math.max(1, Math.min(MAX_MIN_RETURNED_POSTS, Math.floor(minReturnedPosts)));

    const result = await ctx.executeScript(
      /* c8 ignore start */
      async (
        targetMinReturnedPosts: number,
        maxScrollPasses: number,
        scrollWaitMs: number,
        interScrollPauseMs: number,
        stagnantPassesToStop: number,
        postScrollLoadTimeoutMs: number,
        postScrollLoadPollMs: number,
        allowClipboardPermissionWindow: boolean,
        clipboardPermissionWaitWindowMs: number,
      ) => {
        const FEED_LOAD_TIMEOUT_MS = 8_000;
        const FEED_LOAD_POLL_MS = 250;
        const relativeTimestampPattern = /^(?:\d+\s*(?:s|sec|secs|m|min|mins|h|hr|hrs|d|day|days|w|wk|wks|mo|mos|y|yr|yrs)|now|just now|today|yesterday)$/i;
        const blockedStandaloneTextPattern = /^(?:feed post|suggested|promoted|new comment in your group|follow)$/i;
        const blockedContentPattern = /(?:\bpromoted\b|\bsuggested\b|\badd to your feed\b)/i;
        const authorAdornmentPattern = /\s*(?:verified profile|open to work|\s*•\s*\d+(?:st|nd|rd|th)\+?).*$/i;
        const CLIPBOARD_PERMISSION_PROMPT_PENDING_ERROR_CODE = 'clipboard_permission_prompt_pending';
        const CLIPBOARD_PERMISSION_DENIED_ERROR_CODE = 'clipboard_permission_denied';

        const sleep = (delayMs: number): Promise<void> => new Promise((resolve) => {
          window.setTimeout(resolve, delayMs);
        });

        const createClipboardPermissionPromptPendingError = (): Record<string, unknown> => ({
          __ottoSerializedCommandError: true,
          code: CLIPBOARD_PERMISSION_PROMPT_PENDING_ERROR_CODE,
          message: 'Clipboard permission prompt is pending. Ask the user to allow clipboard access, then retry with getClipboardPermission=true.',
          diagnostics: {
            site: 'linkedin.com',
            requirement: 'clipboard-read',
            state: 'prompt',
            action: 'prompt_user_to_allow_clipboard',
          },
        });

        const createClipboardPermissionDeniedError = (): Record<string, unknown> => ({
          __ottoSerializedCommandError: true,
          code: CLIPBOARD_PERMISSION_DENIED_ERROR_CODE,
          message: 'Clipboard permission was denied. Ask the user to enable clipboard access in site settings and retry.',
          diagnostics: {
            site: 'linkedin.com',
            requirement: 'clipboard-read',
            state: 'denied',
            action: 'open_clipboard_site_settings',
            settingsUrl: 'chrome://settings/content/siteDetails?site=https%3A%2F%2Fwww.linkedin.com',
          },
        });

        const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

        const normalizeAuthorName = (value: string): string => normalizeWhitespace(value)
          .replace(authorAdornmentPattern, '')
          .replace(/[\s,.;:|]+$/g, '')
          .trim();

        const normalizeProfileUrl = (href: string | null | undefined): string | undefined => {
          if (!href || href.trim().length === 0) {
            return undefined;
          }

          try {
            const parsed = new URL(href, window.location.origin);
            if (!parsed.hostname.toLowerCase().endsWith('linkedin.com')) {
              return undefined;
            }

            parsed.protocol = 'https:';
            parsed.hash = '';
            parsed.search = '';
            return parsed.toString();
          } catch {
            return undefined;
          }
        };

        const extractProfileSlug = (profileUrl: string | undefined): string | undefined => {
          if (!profileUrl) {
            return undefined;
          }

          try {
            const parsed = new URL(profileUrl);
            const pathSegments = parsed.pathname.split('/').map((segment) => segment.trim()).filter(Boolean);
            for (const namespace of ['in', 'company', 'school']) {
              const namespaceIndex = pathSegments.indexOf(namespace);
              if (namespaceIndex >= 0 && pathSegments[namespaceIndex + 1]) {
                return pathSegments[namespaceIndex + 1];
              }
            }

            if (pathSegments[pathSegments.length - 1] === 'posts' && pathSegments[pathSegments.length - 2]) {
              return pathSegments[pathSegments.length - 2];
            }

            return pathSegments[pathSegments.length - 1] || undefined;
          } catch {
            return undefined;
          }
        };

        const parseRelativePublishedAt = (value: string | undefined): string | undefined => {
          if (!value) {
            return undefined;
          }

          const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
          if (!normalized) {
            return undefined;
          }

          const now = new Date();
          if (normalized === 'now' || normalized === 'just now' || normalized === 'today') {
            return now.toISOString();
          }
          if (normalized === 'yesterday') {
            return new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString();
          }

          const match = normalized.match(/^(\d+)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days|w|wk|wks|mo|mos|y|yr|yrs)$/i);
          if (!match) {
            return undefined;
          }

          const amount = Number(match[1]);
          if (!Number.isFinite(amount) || amount <= 0) {
            return undefined;
          }

          const unit = match[2].toLowerCase();
          const millisecondsByUnit: Record<string, number> = {
            s: 1000,
            sec: 1000,
            secs: 1000,
            m: 60 * 1000,
            min: 60 * 1000,
            mins: 60 * 1000,
            h: 60 * 60 * 1000,
            hr: 60 * 60 * 1000,
            hrs: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000,
            day: 24 * 60 * 60 * 1000,
            days: 24 * 60 * 60 * 1000,
            w: 7 * 24 * 60 * 60 * 1000,
            wk: 7 * 24 * 60 * 60 * 1000,
            wks: 7 * 24 * 60 * 60 * 1000,
            mo: 30 * 24 * 60 * 60 * 1000,
            mos: 30 * 24 * 60 * 60 * 1000,
            y: 365 * 24 * 60 * 60 * 1000,
            yr: 365 * 24 * 60 * 60 * 1000,
            yrs: 365 * 24 * 60 * 60 * 1000,
          };

          const unitMs = millisecondsByUnit[unit];
          if (!unitMs) {
            return undefined;
          }

          return new Date(now.getTime() - (amount * unitMs)).toISOString();
        };

        const extractRelativeTimestampToken = (value: string): string | undefined => {
          const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
          if (!normalized) {
            return undefined;
          }

          const match = normalized.match(/(?:^|\s)(\d+\s*(?:s|sec|secs|m|min|mins|h|hr|hrs|d|day|days|w|wk|wks|mo|mos|y|yr|yrs)|now|just now|today|yesterday)(?=$|\s|[•.,;:])/i);
          if (!match?.[1]) {
            return undefined;
          }

          return match[1].replace(/\s+/g, ' ').trim();
        };

        const isValidContentText = (text: string, authorName: string, postedAgo: string | undefined): boolean => {
          if (!text) {
            return false;
          }
          if (blockedStandaloneTextPattern.test(text) || blockedContentPattern.test(text)) {
            return false;
          }
          if (postedAgo && text === postedAgo) {
            return false;
          }
          if (relativeTimestampPattern.test(text)) {
            return false;
          }
          if (authorName && text === authorName) {
            return false;
          }
          return text.length >= 8;
        };

        const feedSection = document.querySelectorAll('section')[1];
        if (!feedSection) {
          return [];
        }

        const getFeedContainers = (): Array<{ container: Element; sourceIndex: number }> => Array
          .from(feedSection.querySelectorAll('[role="listitem"]'))
          .flatMap((container, sourceIndex) => {
            const headingTexts = Array.from(container.querySelectorAll('h2 span'))
              .map((element) => normalizeWhitespace(element.textContent ?? ''))
              .filter((text) => text.length > 0);

            return headingTexts.includes('Feed post') ? [{ container, sourceIndex }] : [];
          });

        const getProfileAnchor = (container: Element): HTMLAnchorElement | null => container
          .querySelector<HTMLAnchorElement>('a[href*="linkedin.com/in/"]')
          ?? container.querySelector<HTMLAnchorElement>('a[href^="/in/"]')
          ?? container.querySelector<HTMLAnchorElement>('a[href*="/in/"]')
          ?? container.querySelector<HTMLAnchorElement>('a[href*="linkedin.com/company/"]')
          ?? container.querySelector<HTMLAnchorElement>('a[href^="/company/"]')
          ?? container.querySelector<HTMLAnchorElement>('a[href*="/company/"]')
          ?? container.querySelector<HTMLAnchorElement>('a[href*="linkedin.com/school/"]')
          ?? container.querySelector<HTMLAnchorElement>('a[href^="/school/"]')
          ?? container.querySelector<HTMLAnchorElement>('a[href*="/school/"]');

        type ClipboardPermissionState = 'granted' | 'prompt' | 'denied';
        let inferredClipboardPermissionState: ClipboardPermissionState = 'prompt';

        const getClipboardPermissionState = async (): Promise<ClipboardPermissionState> => {
          try {
            if (typeof navigator.permissions?.query === 'function') {
              const permission = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
              if (permission.state === 'granted') {
                return 'granted';
              }
              if (permission.state === 'denied') {
                return 'denied';
              }
              return 'prompt';
            }
          } catch {
            // Fallback to inferred state from clipboard read failures.
          }

          return inferredClipboardPermissionState;
        };

        const readClipboardText = async (): Promise<string | null> => {
          try {
            inferredClipboardPermissionState = 'granted';
            return await navigator.clipboard.readText();
          } catch (error) {
            const name = error instanceof Error ? error.name : '';
            const message = error instanceof Error ? error.message.toLowerCase() : '';
            if (name === 'NotAllowedError' || message.includes('permission') || message.includes('denied')) {
              inferredClipboardPermissionState = message.includes('denied') ? 'denied' : 'prompt';
            }
            return null;
          }
        };

        const ensureClipboardPermission = async (): Promise<Record<string, unknown> | null> => {
          const initialPermissionState = await getClipboardPermissionState();
          if (initialPermissionState === 'granted') {
            return null;
          }

          if (initialPermissionState === 'denied') {
            return createClipboardPermissionDeniedError();
          }

          if (!allowClipboardPermissionWindow) {
            return createClipboardPermissionPromptPendingError();
          }

          const deadline = Date.now() + clipboardPermissionWaitWindowMs;
          while (Date.now() < deadline) {
            const permissionState = await getClipboardPermissionState();
            if (permissionState === 'granted') {
              return null;
            }
            if (permissionState === 'denied') {
              return createClipboardPermissionDeniedError();
            }

            // Touch clipboard read path too; permission state may update only after user action.
            await readClipboardText();
            const inferredState = await getClipboardPermissionState();
            if (inferredState === 'granted') {
              return null;
            }
            if (inferredState === 'denied') {
              return createClipboardPermissionDeniedError();
            }

            await sleep(250);
          }

          return createClipboardPermissionPromptPendingError();
        };

        const normalizeLinkedinPostUrl = (value: string | undefined): string | undefined => {
          if (!value || value.trim().length === 0) {
            return undefined;
          }

          const match = value.match(/https?:\/\/(?:[a-z0-9-]+\.)?linkedin\.com\/\S+/i);
          if (!match?.[0]) {
            return undefined;
          }

          try {
            const parsed = new URL(match[0]);
            if (!parsed.hostname.toLowerCase().endsWith('linkedin.com')) {
              return undefined;
            }

            parsed.protocol = 'https:';
            parsed.search = '';
            parsed.hash = '';
            return parsed.toString();
          } catch {
            return undefined;
          }
        };

        const deriveIdFromPostUrl = (postUrl: string): string | undefined => {
          try {
            const parsed = new URL(postUrl);
            const segments = parsed.pathname
              .split('/')
              .map((segment) => segment.trim())
              .filter(Boolean);
            const lastSegment = segments[segments.length - 1];
            if (!lastSegment) {
              return undefined;
            }

            return decodeURIComponent(lastSegment);
          } catch {
            return undefined;
          }
        };

        const waitForControlMenu = async (): Promise<HTMLDivElement | null> => {
          const deadline = Date.now() + 2_500;

          while (Date.now() < deadline) {
            const popovers = Array.from(document.querySelectorAll<HTMLDivElement>('div[popover="manual"]'));
            const activePopover = popovers.find((popover) => {
              const menuItems = popover.querySelectorAll('div[role="menuitem"]');
              if (menuItems.length < 2) {
                return false;
              }

              const rect = popover.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });

            if (activePopover) {
              return activePopover;
            }

            await sleep(100);
          }

          return null;
        };

        const copyPostUrlFromControlMenu = async (container: Element): Promise<string | undefined> => {
          const menuButton = container.querySelector<HTMLElement>('button[aria-label*="Open control menu for post"]');
          if (!menuButton) {
            return undefined;
          }

          const previousClipboard = (await readClipboardText()) ?? '';
          if (inferredClipboardPermissionState === 'denied') {
            return undefined;
          }

          if (menuButton instanceof HTMLElement) {
            menuButton.scrollIntoView({ block: 'center', inline: 'nearest' });
          }
          menuButton.click();

          const popover = await waitForControlMenu();
          if (!popover) {
            return undefined;
          }

          const menuItems = Array.from(popover.querySelectorAll<HTMLElement>('div[role="menuitem"]'));
          const copyLinkItem = menuItems[1];
          if (!copyLinkItem) {
            return undefined;
          }

          copyLinkItem.click();

          const clipboardDeadline = Date.now() + 2_000;
          while (Date.now() < clipboardDeadline) {
            const clipboardText = await readClipboardText();
            if ((await getClipboardPermissionState()) === 'denied') {
              return undefined;
            }

            if (!clipboardText || clipboardText === previousClipboard) {
              await sleep(100);
              continue;
            }

            const normalizedUrl = normalizeLinkedinPostUrl(clipboardText);
            if (normalizedUrl) {
              return normalizedUrl;
            }

            await sleep(100);
          }

          return undefined;
        };

        const extractPostCandidate = (
          container: Element,
          sourceIndex: number,
        ): { signature: string; post: Record<string, unknown> } | null => {
          const profileAnchor = getProfileAnchor(container);
          if (!profileAnchor) {
            return null;
          }

          const profileUrl = normalizeProfileUrl(profileAnchor.getAttribute('href'));
          if (!profileUrl) {
            return null;
          }

          const authorSlug = extractProfileSlug(profileUrl) ?? `post-${sourceIndex + 1}`;

          const spanTexts = Array.from(container.querySelectorAll('span'))
            .map((span) => normalizeWhitespace(span.textContent ?? ''))
            .filter((text) => text.length > 0);

          const authorNameCandidates = Array.from(
            container.querySelectorAll<HTMLSpanElement>('a[href*="/in/"] p span, a[href*="/in/"] strong'),
          )
            .map((element) => normalizeAuthorName(element.textContent ?? ''))
            .filter((text) => text.length > 0 && !relativeTimestampPattern.test(text) && !blockedStandaloneTextPattern.test(text));

          const authorName = authorNameCandidates[0]
            || spanTexts
              .map((text) => normalizeAuthorName(text))
              .find((text) => text.length > 0 && !blockedStandaloneTextPattern.test(text) && !relativeTimestampPattern.test(text))
            || authorSlug;

          const postedAgo = spanTexts
            .map((text) => extractRelativeTimestampToken(text))
            .find((text): text is string => typeof text === 'string' && text.length > 0);
          if (!postedAgo) {
            return null;
          }

          const visibleText = normalizeWhitespace(container.textContent ?? '');
          if (blockedContentPattern.test(visibleText)) {
            return null;
          }

          const expandableCandidates = Array.from(container.querySelectorAll<HTMLElement>('[data-testid="expandable-text-box"]')).map((element) => {
            const clone = element.cloneNode(true) as HTMLElement;
            for (const button of Array.from(clone.querySelectorAll('[data-testid="expandable-text-button"], button'))) {
              button.remove();
            }

            return {
              html: clone.innerHTML.trim(),
              text: normalizeWhitespace(clone.textContent ?? ''),
            };
          });

          const contentCandidate = expandableCandidates.find(({ text }) => isValidContentText(text, authorName, postedAgo));
          if (!contentCandidate) {
            return null;
          }

          const contentHtml = contentCandidate.html;
          const signatureText = contentCandidate.text.slice(0, 240);
          const signature = `${authorSlug}|${postedAgo}|${signatureText}`;

          return {
            signature,
            post: {
              kind: 'content.post',
              id: `linkedin:${authorSlug}:${sourceIndex + 1}`,
              title: '',
              url: profileUrl,
              author: {
                id: authorSlug,
                username: authorSlug,
                displayName: authorName,
                platform: 'linkedin',
                originalEntity: {
                  profileUrl,
                },
              },
              publishedAt: parseRelativePublishedAt(postedAgo),
              content: contentHtml,
              meta: {
                site: 'linkedin.com',
                source: 'linkedin.com/feed',
                authorProfileUrl: profileUrl,
                postedAgo,
              },
              originalEntity: {
                authorName,
                authorSlug,
                profileUrl,
                postedAgo,
                contentHtml,
              },
            },
          };
        };

        const updateSeenValidPostSignatures = (
          signatures: Set<string>,
          containers: Array<{ container: Element; sourceIndex: number }>,
        ): number => {
          let newCount = 0;

          for (const entry of containers) {
            const candidate = extractPostCandidate(entry.container, entry.sourceIndex);
            if (!candidate) {
              continue;
            }

            const signature = candidate.signature;
            if (signatures.has(signature)) {
              continue;
            }

            signatures.add(signature);
            newCount += 1;
          }

          return newCount;
        };

        const waitForFeedToRender = async (): Promise<void> => {
          const deadline = Date.now() + FEED_LOAD_TIMEOUT_MS;
          while (Date.now() < deadline) {
            const feedItems = Array.from(feedSection.querySelectorAll('[role="listitem"]'));
            const hasRenderablePost = feedItems.some((container) => {
              const headingTexts = Array.from(container.querySelectorAll('h2 span'))
                .map((element) => normalizeWhitespace(element.textContent ?? ''))
                .filter((text) => text.length > 0);
              const hasFeedHeading = headingTexts.includes('Feed post');
              const hasTimestamp = Array.from(container.querySelectorAll('span'))
                .map((element) => normalizeWhitespace(element.textContent ?? ''))
                .some((text) => relativeTimestampPattern.test(text));
              return hasFeedHeading && hasTimestamp;
            });

            if (hasRenderablePost) {
              return;
            }

            await sleep(FEED_LOAD_POLL_MS);
          }
        };

        await waitForFeedToRender();

        const clipboardPermissionError = await ensureClipboardPermission();
        if (clipboardPermissionError) {
          return clipboardPermissionError;
        }

        const waitForAdditionalFeedContainers = async (baselineCount: number): Promise<number> => {
          const deadline = Date.now() + postScrollLoadTimeoutMs;
          let latestCount = baselineCount;

          while (Date.now() < deadline) {
            latestCount = getFeedContainers().length;
            if (latestCount > baselineCount) {
              return latestCount;
            }

            await sleep(postScrollLoadPollMs);
          }

          return latestCount;
        };

        const scrollUntilTargetCount = async (): Promise<void> => {
          if (targetMinReturnedPosts <= 1) {
            return;
          }

          let previousDocumentHeight = document.documentElement.scrollHeight;
          const initialContainers = getFeedContainers();
          let previousContainerCount = initialContainers.length;
          let stagnantPasses = 0;
          const seenContainerSignatures = new Set<string>();
          updateSeenValidPostSignatures(seenContainerSignatures, initialContainers);

          if (seenContainerSignatures.size >= targetMinReturnedPosts) {
            return;
          }

          for (let pass = 0; pass <= maxScrollPasses; pass += 1) {
            const currentContainers = getFeedContainers();
            const newCurrentSignatures = updateSeenValidPostSignatures(seenContainerSignatures, currentContainers);
            if (seenContainerSignatures.size >= targetMinReturnedPosts) {
              return;
            }

            const lastContainer = currentContainers[currentContainers.length - 1]?.container ?? feedSection.lastElementChild;
            if (lastContainer instanceof HTMLElement) {
              lastContainer.scrollIntoView({ block: 'end', inline: 'nearest' });
            }
            window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: 'auto' });
            await sleep(scrollWaitMs);

            await waitForAdditionalFeedContainers(currentContainers.length);
            if (seenContainerSignatures.size >= targetMinReturnedPosts) {
              return;
            }

            const postScrollContainers = getFeedContainers();
            const postScrollCount = postScrollContainers.length;
            const newPostScrollSignatures = updateSeenValidPostSignatures(seenContainerSignatures, postScrollContainers);
            if (seenContainerSignatures.size >= targetMinReturnedPosts) {
              return;
            }

            const nextDocumentHeight = document.documentElement.scrollHeight;
            const madeProgress = postScrollCount > previousContainerCount
              || nextDocumentHeight > previousDocumentHeight
              || newCurrentSignatures > 0
              || newPostScrollSignatures > 0;

            previousDocumentHeight = nextDocumentHeight;
            previousContainerCount = postScrollCount;

            stagnantPasses = madeProgress ? 0 : stagnantPasses + 1;
            if (stagnantPasses >= stagnantPassesToStop) {
              return;
            }

            // LinkedIn often renders the next slice asynchronously after scroll settles.
            // Keep a small fixed gap between passes to avoid outrunning lazy feed hydration.
            await sleep(interScrollPauseMs);
          }
        };

        await scrollUntilTargetCount();

        const feedContainers = getFeedContainers();

        const posts: unknown[] = [];
        const emittedSignatures = new Set<string>();

        for (const entry of feedContainers) {
          const candidate = extractPostCandidate(entry.container, entry.sourceIndex);
          if (!candidate) {
            continue;
          }

          const postUrl = await copyPostUrlFromControlMenu(entry.container);
          if ((await getClipboardPermissionState()) === 'denied') {
            return createClipboardPermissionDeniedError();
          }
          if (!postUrl) {
            continue;
          }

          const derivedId = deriveIdFromPostUrl(postUrl);
          if (!derivedId) {
            continue;
          }

          if (emittedSignatures.has(candidate.signature)) {
            continue;
          }

          emittedSignatures.add(candidate.signature);
          candidate.post.id = `linkedin:${derivedId}`;
          candidate.post.url = postUrl;
          const candidateOriginalEntity = candidate.post.originalEntity;
          if (candidateOriginalEntity && typeof candidateOriginalEntity === 'object') {
            (candidateOriginalEntity as Record<string, unknown>).postUrl = postUrl;
          }
          posts.push(candidate.post);

          if (posts.length >= targetMinReturnedPosts) {
            break;
          }
        }

        return posts;
      },
      /* c8 ignore stop */
      [
        boundedMinReturnedPosts,
        MAX_SCROLL_PASSES,
        SCROLL_WAIT_MS,
        INTER_SCROLL_PAUSE_MS,
        STAGNANT_SCROLL_PASSES_TO_STOP,
        POST_SCROLL_LOAD_TIMEOUT_MS,
        POST_SCROLL_LOAD_POLL_MS,
        getClipboardPermission,
        CLIPBOARD_PERMISSION_WAIT_WINDOW_MS,
      ],
    );

    if (ctx.isSerializedScriptError(result)) {
      return result;
    }

    const posts = Array.isArray(result)
      ? result.filter((value): value is Post => {
        if (!value || typeof value !== 'object') {
          return false;
        }

        const post = value as { kind?: unknown; id?: unknown; title?: unknown; content?: unknown };
        return post.kind === 'content.post'
          && typeof post.id === 'string'
          && typeof post.title === 'string'
          && typeof post.content === 'string'
          && post.content.trim().length > 0;
      })
      : [];

    return { posts };
  },
  async test(_ctx, input, helpers) {
    return helpers.execute(input);
  },
};