import type { SiteCommand } from '../types.js';
import type { PageSerializeScriptError } from '../../runtime/page-dom-query.js';

type CommentOnPostInput = {
  postUrl?: string;
  commentBody?: string;
};

export function normalizeCommentOnPostInput(input: Record<string, unknown> | undefined): {
  postUrl: string;
  commentBody: string;
} {
  const parsed = (input ?? {}) as CommentOnPostInput;
  return {
    postUrl: typeof parsed.postUrl === 'string' ? parsed.postUrl.trim() : '',
    commentBody: typeof parsed.commentBody === 'string' ? parsed.commentBody.trim() : '',
  };
}

export function assertCommentOnPostInput(input: { postUrl: string; commentBody: string }): void {
  if (!input.postUrl) {
    throw new Error('commentOnPost requires input.postUrl');
  }
  if (!input.commentBody) {
    throw new Error('commentOnPost requires input.commentBody');
  }
}

export function normalizeLinkedInPostUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('commentOnPost requires input.postUrl to be a valid URL');
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) {
    throw new Error('commentOnPost requires input.postUrl to be a linkedin.com URL');
  }

  parsed.protocol = 'https:';
  parsed.hostname = 'www.linkedin.com';
  parsed.hash = '';
  return parsed.toString();
}

export const commentOnPostCommand: SiteCommand = {
  metadata: {
    site: 'linkedin.com',
    id: 'commentOnPost',
    displayName: 'Comment On LinkedIn Post',
    description: 'Navigates to a LinkedIn post and submits a comment.',
    tags: ['linkedin', 'comment', 'post'],
    requiresAuth: true,
    requiresDebuggerFocus: true,
    inputFields: [
      {
        name: 'postUrl',
        type: 'string',
        description: 'Full LinkedIn post URL.',
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

    const postUrl = normalizeLinkedInPostUrl(normalizedInput.postUrl);
    const { commentBody } = normalizedInput;

    await ctx.navigateTab(postUrl);

    const submitResult = await ctx.executeScriptWithDomHelpers(
      /* c8 ignore start */
      async (commentValue: string) => {
        const pageWindow = window as Window & {
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

          const findEditor = (): HTMLElement | null => {
            const editor = document.querySelector('.ql-editor[contenteditable="true"]');
            return editor instanceof HTMLElement ? editor : null;
          };

          const findSubmitButton = (): HTMLButtonElement | null => {
            const submit = document.querySelector(
              '.comments-comment-box__submit-button--cr, .comments-comment-box__submit-button, form.comments-comment-box__form button[type="submit"]',
            );
            return submit instanceof HTMLButtonElement ? submit : null;
          };

          const diagnostics = (): Record<string, unknown> => {
            const editor = findEditor();
            const submitButton = findSubmitButton();
            return {
              path: window.location.pathname,
              editorCount: document.querySelectorAll('.ql-editor[contenteditable="true"]').length,
              submitButtonCount: document.querySelectorAll(
                '.comments-comment-box__submit-button--cr, .comments-comment-box__submit-button, form.comments-comment-box__form button[type="submit"]',
              ).length,
              hasEditor: editor instanceof HTMLElement,
              hasSubmitButton: submitButton instanceof HTMLButtonElement,
              submitButtonDisabled: submitButton?.disabled,
              editorTextLength: (editor?.textContent ?? '').trim().length,
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

          const getEditorPlainTextLength = (editor: HTMLElement): number => {
            return (editor.textContent ?? '').replace(/\u200B/g, '').trim().length;
          };

          const normalizeCommentText = (value: string): string => {
            return value.replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
          };

          const dispatchEditorInputSignals = (editor: HTMLElement, insertedText: string): void => {
            editor.dispatchEvent(new Event('focus', { bubbles: true }));

            if (typeof InputEvent === 'function') {
              editor.dispatchEvent(new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: insertedText,
              }));
              editor.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: insertedText,
              }));
            } else {
              editor.dispatchEvent(new Event('input', { bubbles: true }));
            }

            editor.dispatchEvent(new KeyboardEvent('keyup', {
              bubbles: true,
              key: 'a',
            }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));
          };

          const injectCommentBody = (editor: HTMLElement, value: string): void => {
            const clickOptions: MouseEventInit = { bubbles: true, cancelable: true, view: window };
            editor.dispatchEvent(new MouseEvent('mousedown', clickOptions));
            editor.dispatchEvent(new MouseEvent('mouseup', clickOptions));
            editor.click();
            editor.focus();

            const insertViaExecCommand = (): boolean => {
              const selection = window.getSelection();
              if (!selection) {
                return false;
              }

              const range = document.createRange();
              range.selectNodeContents(editor);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);

              document.execCommand('selectAll');
              document.execCommand('delete');

              const lines = value.split(/\r?\n/);
              for (let index = 0; index < lines.length; index += 1) {
                if (index > 0) {
                  document.execCommand('insertParagraph');
                }

                const line = lines[index] ?? '';
                if (line.length > 0) {
                  document.execCommand('insertText', false, line);
                }
              }

              dispatchEditorInputSignals(editor, value);
              return getEditorPlainTextLength(editor) > 0;
            };

            const insertViaDom = (): boolean => {
              editor.replaceChildren();
              for (const line of value.split(/\r?\n/)) {
                const paragraph = document.createElement('p');
                paragraph.textContent = line.length > 0 ? line : '\u200B';
                editor.appendChild(paragraph);
              }

              dispatchEditorInputSignals(editor, value);
              return getEditorPlainTextLength(editor) > 0;
            };

            if (insertViaExecCommand()) {
              return;
            }

            if (insertViaDom()) {
              return;
            }

            editor.textContent = value;
            dispatchEditorInputSignals(editor, value);
          };

          const editorReady = await waitFor(() => Boolean(findEditor()), 10000, 150);
          if (!editorReady) {
            throw new Error(`linkedin_post_comment_editor_missing:${JSON.stringify(diagnostics())}`);
          }

          const editor = findEditor();
          if (!(editor instanceof HTMLElement)) {
            throw new Error(`linkedin_post_comment_editor_missing:${JSON.stringify(diagnostics())}`);
          }

          injectCommentBody(editor, commentValue);

          const editorPopulated = await waitFor(() => {
            const currentEditor = findEditor();
            return currentEditor instanceof HTMLElement
              && getEditorPlainTextLength(currentEditor) > 0;
          }, 2500, 100);
          if (!editorPopulated) {
            throw new Error(`linkedin_post_comment_editor_not_populated:${JSON.stringify(diagnostics())}`);
          }

          const submitEnabled = await waitFor(() => {
            const currentSubmitButton = findSubmitButton();
            return currentSubmitButton instanceof HTMLButtonElement && !currentSubmitButton.disabled;
          }, 6000, 100);
          if (!submitEnabled) {
            throw new Error(`linkedin_post_comment_submit_disabled:${JSON.stringify(diagnostics())}`);
          }

          await wait(500);
          const readySubmitButton = findSubmitButton();
          if (!(readySubmitButton instanceof HTMLButtonElement)) {
            throw new Error(`linkedin_post_comment_submit_missing:${JSON.stringify(diagnostics())}`);
          }

          readySubmitButton.click();

          const expectedCommentText = normalizeCommentText(commentValue);
          let matchedPostedComment = false;
          let observedCommentText = '';

          for (let attempt = 0; attempt < 12; attempt += 1) {
            const firstCommentContent = document.querySelector('.comments-comment-item__main-content');
            observedCommentText = firstCommentContent instanceof HTMLElement
              ? normalizeCommentText(firstCommentContent.textContent ?? '')
              : '';

            if (observedCommentText === expectedCommentText) {
              matchedPostedComment = true;
              break;
            }

            await wait(300);
          }

          if (!matchedPostedComment) {
            throw new Error(`linkedin_post_comment_send_unconfirmed:${JSON.stringify({
              ...diagnostics(),
              expectedCommentText,
              observedCommentText,
            })}`);
          }

          return {
            sent: true,
            postUrl: window.location.href,
          };
        } catch (error) {
          return serializeScriptError(error, 'linkedin_post_comment_script_failed');
        }
      },
      /* c8 ignore stop */
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
    throw new Error(`linkedin_post_comment_send_unconfirmed:missing_result_payload:${JSON.stringify({
      postUrl,
      currentUrl,
      submitResult,
      resultType: typeof submitResult,
    })}`);
  },
  async test(_ctx, input, helpers) {
    const normalizedInput = normalizeCommentOnPostInput(input);
    assertCommentOnPostInput(normalizedInput);
    const postUrl = normalizeLinkedInPostUrl(normalizedInput.postUrl);

    return helpers.execute({
      postUrl,
      commentBody: normalizedInput.commentBody,
    });
  },
};