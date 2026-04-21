import type { SiteCommand } from '../types.js';
import type {
  PageDeepQuerySelector,
  PageSerializeScriptError,
} from '../../runtime/page-dom-query.js';

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
        const pageWindow = window as Window & {
          __ottoDeepQuerySelector?: PageDeepQuerySelector;
          __ottoSerializeScriptError?: PageSerializeScriptError;
        };
        const serializeScriptError = pageWindow.__ottoSerializeScriptError;

        if (typeof serializeScriptError !== 'function') {
          throw new Error('otto_serialize_script_error_helper_missing');
        }

        try {
          const wait = (ms: number) => new Promise((resolve) => {
            setTimeout(resolve, ms);
          });

          const deepQuerySelector = pageWindow.__ottoDeepQuerySelector;
          if (typeof deepQuerySelector !== 'function') {
            throw new Error('otto_dom_query_helper_missing');
          }

          const queryDeep = (root: ParentNode, selector: string): Element | null => {
            return deepQuerySelector(root, selector);
          };

          const buildLexicalNodes = (value: string): DocumentFragment => {
            const fragment = document.createDocumentFragment();
            const paragraphs = value.split(/\r?\n/);
            for (const paragraph of paragraphs) {
              const p = document.createElement('p');
              p.className = 'first:mt-0 last:mb-0';

              const span = document.createElement('span');
              span.setAttribute('data-lexical-text', 'true');
              span.textContent = paragraph.length > 0 ? paragraph : '\u200B';

              p.appendChild(span);
              fragment.appendChild(p);
            }

            return fragment;
          };

          const injectTextboxValue = (textbox: HTMLElement, value: string): void => {
            type LexicalEditorLike = {
              parseEditorState?: (state: string) => unknown;
              setEditorState?: (state: unknown, options?: Record<string, unknown>) => void;
            };

            const insertViaNativeEditing = (): boolean => {
              textbox.click();
              textbox.focus();

              const selection = window.getSelection();
              if (!selection) {
                return false;
              }

              const range = document.createRange();
              range.selectNodeContents(textbox);
              selection.removeAllRanges();
              selection.addRange(range);

              document.execCommand('delete');

              const lines = value.split(/\r?\n/);
              let insertedAny = false;
              for (let index = 0; index < lines.length; index += 1) {
                if (index > 0) {
                  document.execCommand('insertParagraph');
                }

                const line = lines[index] ?? '';
                if (line.length > 0) {
                  const lineInserted = document.execCommand('insertText', false, line);
                  insertedAny = insertedAny || lineInserted;
                }
              }

              return insertedAny || lines.every((line) => line.length === 0);
            };

            if (insertViaNativeEditing()) {
              return;
            }

            const lexicalHost = textbox as HTMLElement & { __lexicalEditor?: LexicalEditorLike };
            const lexicalEditor = lexicalHost.__lexicalEditor;

            if (
              lexicalEditor
              && typeof lexicalEditor.parseEditorState === 'function'
              && typeof lexicalEditor.setEditorState === 'function'
            ) {
              const lines = value.split(/\r?\n/);
              const editorState = {
                root: {
                  type: 'root',
                  version: 1,
                  format: '',
                  indent: 0,
                  direction: null,
                  children: lines.map((line) => ({
                    type: 'paragraph',
                    version: 1,
                    format: '',
                    indent: 0,
                    direction: null,
                    textFormat: 0,
                    textStyle: '',
                    children: [
                      {
                        type: 'text',
                        version: 1,
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        text: line.length > 0 ? line : '\u200B',
                      },
                    ],
                  })),
                },
              };

              const parsedState = lexicalEditor.parseEditorState(JSON.stringify(editorState));
              lexicalEditor.setEditorState(parsedState, { tag: 'history-merge' });
              return;
            }

            textbox.replaceChildren(buildLexicalNodes(value));
          };

          const findComposerHost = (): HTMLElement | null => {
            const host = queryDeep(document, 'shreddit-composer');
            return host instanceof HTMLElement ? host : null;
          };

          const findCommentButton = (): HTMLElement | null => {
            const button = queryDeep(document, 'button[name="comments-action-button"]');
            return button instanceof HTMLElement ? button : null;
          };

          const findTextbox = (): HTMLElement | null => {
            const host = findComposerHost();
            if (!(host instanceof HTMLElement)) {
              return null;
            }

            const textbox = queryDeep(host, 'div[role="textbox"], [role="textbox"]');
            return textbox instanceof HTMLElement ? textbox : null;
          };

          const findSubmitButton = (): HTMLButtonElement | null => {
            const host = findComposerHost();
            if (!(host instanceof HTMLElement)) {
              return null;
            }

            const submit = queryDeep(host, 'button[slot="submit-button"]');
            return submit instanceof HTMLButtonElement ? submit : null;
          };

          const diagnostics = (): Record<string, unknown> => {
            const host = findComposerHost();
            const commentButton = findCommentButton();
            const textbox = findTextbox();
            const submit = findSubmitButton();
            const lexicalEditorAttached = textbox instanceof HTMLElement
              && '__lexicalEditor' in (textbox as HTMLElement & Record<string, unknown>);
            return {
              path: window.location.pathname,
              hasComposer: host instanceof HTMLElement,
              hasCommentButton: commentButton instanceof HTMLElement,
              hasTextbox: textbox instanceof HTMLElement,
              hasSubmitButton: submit instanceof HTMLButtonElement,
              lexicalEditorAttached,
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

          await wait(500);
          const commentButton = findCommentButton();
          if (!(commentButton instanceof HTMLElement)) {
            throw new Error(`reddit_post_comment_button_missing:${JSON.stringify(diagnostics())}`);
          }
          commentButton.click();

          const composerReady = await waitFor(() => Boolean(findTextbox()) && Boolean(findSubmitButton()), 10000, 150);
          if (!composerReady) {
            throw new Error(`reddit_post_comment_composer_missing:${JSON.stringify(diagnostics())}`);
          }

          await wait(500);
          const textbox = findTextbox();
          if (!(textbox instanceof HTMLElement)) {
            throw new Error(`reddit_post_comment_textbox_missing:${JSON.stringify(diagnostics())}`);
          }

          const submitButton = findSubmitButton();
          if (!(submitButton instanceof HTMLButtonElement)) {
            throw new Error(`reddit_post_comment_submit_missing:${JSON.stringify(diagnostics())}`);
          }

          injectTextboxValue(textbox, commentValue);

          await wait(150);
          submitButton.click();
          await wait(500);

          const submitErrorAlert = queryDeep(document, '.text-alert-negative');
          if (submitErrorAlert) {
            const submitErrorMessageRoot = queryDeep(document, '#comment-composer-message-root');
            const submitErrorMessage = submitErrorMessageRoot?.textContent?.trim() ?? '';
            throw new Error(
              submitErrorMessage.length > 0
                ? submitErrorMessage
                : `reddit_post_comment_submit_error:${JSON.stringify(diagnostics())}`,
            );
          }

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
        } catch (error) {
          return serializeScriptError(error, 'reddit_post_comment_script_failed');
        }
      },
      [commentBody],
    );

    if (ctx.isSerializedScriptError(submitResult)) {
      return submitResult;
    }

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
