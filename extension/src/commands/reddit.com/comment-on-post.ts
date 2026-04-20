import type { SiteCommand } from '../types.js';
import type { PageDeepQuerySelector } from '../../runtime/page-dom-query.js';

type CommentOnPostInput = {
  postUrl?: string;
  commentBody?: string;
};

function normalizeCommentOnPostInput(input: Record<string, unknown> | undefined): {
  postUrl: string;
  commentBody: string;
} {
  const parsed = (input ?? {}) as CommentOnPostInput;
  return {
    postUrl: typeof parsed.postUrl === 'string' ? parsed.postUrl.trim() : '',
    commentBody: typeof parsed.commentBody === 'string' ? parsed.commentBody.trim() : '',
  };
}

function assertCommentOnPostInput(input: { postUrl: string; commentBody: string }): void {
  if (!input.postUrl) {
    throw new Error('commentOnPost requires input.postUrl');
  }
  if (!input.commentBody) {
    throw new Error('commentOnPost requires input.commentBody');
  }
}

function normalizeRedditPostUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('commentOnPost requires input.postUrl to be a valid URL');
  }

  const host = parsed.hostname.toLowerCase();
  if (!host.endsWith('reddit.com')) {
    throw new Error('commentOnPost requires input.postUrl to be a reddit.com URL');
  }

  if (!parsed.pathname.includes('/comments/')) {
    throw new Error('commentOnPost requires input.postUrl to be a Reddit post comments URL');
  }

  parsed.protocol = 'https:';
  parsed.hostname = 'www.reddit.com';
  parsed.hash = '';
  return parsed.toString();
}

export const commentOnPostCommand: SiteCommand = {
  metadata: {
    site: 'reddit.com',
    id: 'commentOnPost',
    displayName: 'Comment On Reddit Post',
    description: 'Navigates to a Reddit post and submits a top-level comment.',
    tags: ['reddit', 'comment', 'post'],
    requiresAuth: true,
    requiresDebuggerFocus: true,
    inputFields: [
      {
        name: 'postUrl',
        type: 'string',
        description: 'Full Reddit post comments URL.',
      },
      {
        name: 'commentBody',
        type: 'string',
        description: 'Comment body text to submit.',
      },
    ],
  },
  async execute(ctx, input) {
    const normalizedInput = normalizeCommentOnPostInput(input);
    assertCommentOnPostInput(normalizedInput);

    const postUrl = normalizeRedditPostUrl(normalizedInput.postUrl);
    const { commentBody } = normalizedInput;

    await ctx.navigateTab(postUrl);

    const submitResult = await ctx.executeScriptWithDomHelpers(
      async (commentValue: string) => {
        const wait = (ms: number) => new Promise((resolve) => {
          setTimeout(resolve, ms);
        });

        const pageWindow = window as Window & {
          __ottoDeepQuerySelector?: PageDeepQuerySelector;
        };
        const deepQuerySelector = pageWindow.__ottoDeepQuerySelector;
        if (typeof deepQuerySelector !== 'function') {
          throw new Error('otto_dom_query_helper_missing');
        }

        const queryDeep = (root: ParentNode, selector: string): Element | null => {
          return deepQuerySelector(root, selector);
        };

        const findComposerHost = (): HTMLElement | null => {
          const host = queryDeep(document, 'shreddit-composer');
          return host instanceof HTMLElement ? host : null;
        };

        const findTextbox = (): HTMLElement | null => {
          const host = findComposerHost();
          if (!(host instanceof HTMLElement) || !host.shadowRoot) {
            return null;
          }

          const textbox = queryDeep(host.shadowRoot, 'div[role="textbox"], [role="textbox"]');
          return textbox instanceof HTMLElement ? textbox : null;
        };

        const findSubmitButton = (): HTMLButtonElement | null => {
          const host = findComposerHost();
          if (!(host instanceof HTMLElement) || !host.shadowRoot) {
            return null;
          }

          const submit = queryDeep(host.shadowRoot, 'button[slot="submit-button"]');
          return submit instanceof HTMLButtonElement ? submit : null;
        };

        const diagnostics = (): Record<string, unknown> => {
          const host = findComposerHost();
          const textbox = findTextbox();
          const submit = findSubmitButton();
          return {
            path: window.location.pathname,
            hasComposer: host instanceof HTMLElement,
            hasTextbox: textbox instanceof HTMLElement,
            hasSubmitButton: submit instanceof HTMLButtonElement,
          };
        };

        const waitFor = async (predicate: () => boolean, timeoutMs: number, intervalMs: number): Promise<boolean> => {
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            if (predicate()) {
              return true;
            }
            await wait(intervalMs);
          }
          return false;
        };

        console.log('Waiting for comment composer to be ready...', diagnostics());
        const composerReady = await waitFor(() => Boolean(findTextbox()) && Boolean(findSubmitButton()), 10000, 150);
        if (!composerReady) {
          throw new Error(`reddit_post_comment_composer_missing:${JSON.stringify(diagnostics())}`);
        }

        const textbox = findTextbox();
        if (!(textbox instanceof HTMLElement)) {
          throw new Error(`reddit_post_comment_textbox_missing:${JSON.stringify(diagnostics())}`);
        }

        const submitButton = findSubmitButton();
        if (!(submitButton instanceof HTMLButtonElement)) {
          throw new Error(`reddit_post_comment_submit_missing:${JSON.stringify(diagnostics())}`);
        }

        textbox.click();
        textbox.focus();
        textbox.textContent = commentValue;
        textbox.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        textbox.dispatchEvent(new Event('change', { bubbles: true }));

        await wait(150);
        submitButton.click();

        const cleared = await waitFor(() => {
          const currentTextbox = findTextbox();
          return currentTextbox instanceof HTMLElement
            ? (currentTextbox.textContent ?? '').trim().length === 0
            : false;
        }, 8000, 200);

        if (!cleared) {
          throw new Error(`reddit_post_comment_send_unconfirmed:${JSON.stringify(diagnostics())}`);
        }

        return {
          sent: true,
          postUrl: window.location.href,
        };
      },
      [commentBody],
    );

    if (submitResult && typeof submitResult === 'object' && (submitResult as { sent?: unknown }).sent === true) {
      const resultPostUrl = typeof (submitResult as { postUrl?: unknown }).postUrl === 'string'
        ? (submitResult as { postUrl: string }).postUrl
        : postUrl;
      return {
        sent: true,
        postUrl: resultPostUrl,
      };
    }

    const currentUrl = await ctx.getTabUrl();
    throw new Error(`reddit_post_comment_send_unconfirmed:missing_result_payload:${JSON.stringify({
      postUrl,
      currentUrl,
      submitResult,
      resultType: typeof submitResult,
    })}`);
  },
  async test(_ctx, input, helpers) {
    const normalizedInput = normalizeCommentOnPostInput(input);
    assertCommentOnPostInput(normalizedInput);
    const postUrl = normalizeRedditPostUrl(normalizedInput.postUrl);

    return helpers.execute({
      postUrl,
      commentBody: normalizedInput.commentBody,
    });
  },
};
