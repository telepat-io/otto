import type { SiteCommand } from '../types.js';
import type { PageDeepQuerySelector, PageDeepQuerySelectorAll } from '../../runtime/page-dom-query.js';

type SendChatMessageInput = {
  username?: string;
  roomId?: string;
  message?: string;
};

function normalizeSendChatMessageInput(input: Record<string, unknown> | undefined): {
  username: string;
  roomId: string;
  message: string;
} {
  const parsed = (input ?? {}) as SendChatMessageInput;
  return {
    username: typeof parsed.username === 'string' ? parsed.username.trim().replace(/^u\//, '') : '',
    roomId: typeof parsed.roomId === 'string' ? parsed.roomId.trim() : '',
    message: typeof parsed.message === 'string' ? parsed.message.trim() : '',
  };
}

function assertSendChatMessageInput(input: { username: string; roomId: string; message: string }): void {
  if (!input.message) {
    throw new Error('sendChatMessage requires input.message');
  }
  if (!input.username && !input.roomId) {
    throw new Error('sendChatMessage requires input.username or input.roomId');
  }
}

export const sendChatMessageCommand: SiteCommand = {
  metadata: {
    site: 'reddit.com',
    id: 'sendChatMessage',
    preloadHost: 'reddit.com/chat',
    displayName: 'Send Reddit Chat Message',
    description: 'Creates or opens a Reddit chat room and sends a message.',
    tags: ['chat', 'reddit'],
    requiresAuth: true,
    requiresDebuggerFocus: true,
    inputAtLeastOneOf: ['username', 'roomId'],
    inputFields: [
      {
        name: 'username',
        type: 'string',
        description: 'Username to start a direct chat with (without u/).',
        optional: true,
      },
      {
        name: 'roomId',
        type: 'string',
        description: 'Existing room id to send to; skips room creation flow.',
        optional: true,
      },
      {
        name: 'message',
        type: 'string',
        description: 'Message content to send.',
      },
    ],
  },
  async execute(ctx, input) {
    const { username, roomId, message } = normalizeSendChatMessageInput(input);
    assertSendChatMessageInput({ username, roomId, message });
    const createRoomByUsername = async (targetUsername: string): Promise<string> => {
      const roomSeed = await ctx.executeScriptWithDomHelpers(
        async (usernameValue: string, debugEnabled: boolean) => {
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

          const logDebug = (phase: string, data: Record<string, unknown> = {}): void => {
            if (!debugEnabled) {
              return;
            }

            console.log('[otto:reddit:send-chat:create-room]', {
              phase,
              path: window.location.pathname,
              ...data,
            });
          };

          const getRoomCreateShadow = (): ShadowRoot | null => {
            const roomCreate = deepQuerySelector(document, 'rs-direct-chat-creation');
            return roomCreate?.shadowRoot ?? null;
          };

          const queryDeep = (selector: string): Element | null => {
            return deepQuerySelector(document, selector);
          };

          const queryUsersMultiselectInput = (): HTMLInputElement | null => {
            const usersMultiselect = deepQuerySelector(document, 'rs-users-multiselect');
            if (!(usersMultiselect instanceof HTMLElement)) {
              return null;
            }

            const shadowRoot = usersMultiselect.shadowRoot;
            if (!shadowRoot) {
              return null;
            }

            const input = deepQuerySelector(shadowRoot, 'input');
            return input instanceof HTMLInputElement ? input : null;
          };

          const waitFor = async (predicate: () => boolean, timeoutMs: number, intervalMs: number) => {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
              if (predicate()) {
                return true;
              }
              await wait(intervalMs);
            }
            return false;
          };

          const roomCreationLink = queryDeep('a[href="/room/create"]');
          logDebug('room_create_link_lookup', { found: roomCreationLink instanceof HTMLAnchorElement });
          if (!(roomCreationLink instanceof HTMLAnchorElement)) {
            throw new Error('reddit_chat_room_create_link_missing');
          }
          roomCreationLink.click();
          logDebug('room_create_clicked');

          const hasUserSearch = await waitFor(() => Boolean(queryUsersMultiselectInput()), 15000, 150);
          logDebug('user_search_ready', { hasUserSearch });
          if (!hasUserSearch) {
            throw new Error('reddit_chat_user_search_timeout');
          }

          const userInput = queryUsersMultiselectInput();
          if (!(userInput instanceof HTMLInputElement)) {
            throw new Error('reddit_chat_user_search_input_missing');
          }

          const usersMultiselectHost = queryDeep('rs-users-multiselect');

          userInput.focus();
          userInput.value = usernameValue;
          userInput.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));

          let selected = false;
          const selectDeadline = Date.now() + 15000;
          while (!selected && Date.now() < selectDeadline) {
            const searchResult = usersMultiselectHost instanceof HTMLElement
              ? usersMultiselectHost.shadowRoot?.querySelector('.search-results li div')
              : queryDeep('.search-results li div');
            if (searchResult instanceof HTMLElement) {
              if (searchResult.getAttribute('aria-disabled') === 'true') {
                await wait(1000);
                const retryResult = usersMultiselectHost instanceof HTMLElement
                  ? usersMultiselectHost.shadowRoot?.querySelector('.search-results li div')
                  : queryDeep('.search-results li div');
                if (retryResult instanceof HTMLElement && retryResult.getAttribute('aria-disabled') === 'true') {
                  throw new Error('reddit_user_unmessageable');
                }
              }
              searchResult.click();
              selected = true;
              break;
            }
            await wait(250);
          }
          logDebug('user_selection_complete', { selected });

          if (!selected) {
            throw new Error('reddit_chat_user_not_found_in_create_flow');
          }

          const openedExistingRoom = await waitFor(() => window.location.pathname.startsWith('/room/'), 2000, 100);
          if (!openedExistingRoom) {
            const roomCreateShadow = getRoomCreateShadow();
            const roomButtons = Array.from(roomCreateShadow?.querySelectorAll('button') ?? []);
            const buttonSnapshot = roomButtons.map((button, index) => ({
              index,
              text: (button.textContent ?? '').trim().toLowerCase(),
              disabled: button.disabled,
              ariaDisabled: button.getAttribute('aria-disabled'),
            }));

            const submit = (roomButtons[1] instanceof HTMLButtonElement
              ? roomButtons[1]
              : roomButtons.find((button) => {
                if (!(button instanceof HTMLButtonElement)) {
                  return false;
                }
                const text = (button.textContent ?? '').trim().toLowerCase();
                return text.includes('create') || text.includes('chat') || text.includes('start');
              })) as HTMLButtonElement | undefined;

            if (!(submit instanceof HTMLButtonElement)) {
              throw new Error(`reddit_chat_create_submit_missing:${JSON.stringify({ path: window.location.pathname, buttonSnapshot })}`);
            }

            submit.click();
            logDebug('create_submit_clicked', { buttonCount: roomButtons.length });

            await wait(250);
          }

          const hasTextarea = await waitFor(() => Boolean(queryDeep('textarea')), 30000, 150);
          logDebug('room_textarea_ready', { hasTextarea });
          if (!hasTextarea) {
            throw new Error(`reddit_chat_textarea_timeout:${JSON.stringify({ path: window.location.pathname })}`);
          }

          // Return the current path so we know which room was opened
          const finalPath = window.location.pathname;
          const roomId = finalPath.startsWith('/chat/room/') ? finalPath.replace('/chat/room/', '') : 'unknown';
          logDebug('create_room_complete', { finalPath, roomId });
          return {
            roomId,
            finalPath,
            openedExistingRoom,
          };
        },
        [targetUsername, ctx.debug.enabled],
      );

      const tabUrl = await ctx.getTabUrl();
      const roomResult = roomSeed as {
        roomId?: unknown;
        finalPath?: unknown;
        openedExistingRoom?: unknown;
      } | undefined;
      const resolvedRoomId = typeof roomSeed === 'string'
        ? roomSeed
        : (typeof roomResult?.roomId === 'string' ? roomResult.roomId : '');

      await ctx.debug.log('reddit.send_chat.create_room_result', {
        targetUsername,
        tabUrl,
        roomSeed,
        resultType: typeof roomSeed,
        resolvedRoomIdLength: resolvedRoomId.length,
        finalPath: typeof roomResult?.finalPath === 'string' ? roomResult.finalPath : undefined,
      });

      if (!resolvedRoomId) {
        throw new Error(`reddit_chat_create_submit_unconfirmed:missing_result_payload:${JSON.stringify({
          tabUrl,
          roomSeed,
          resultType: typeof roomSeed,
          finalPath: typeof roomResult?.finalPath === 'string' ? roomResult.finalPath : undefined,
        })}`);
      }

      return resolvedRoomId;
    };

    const sendInOpenRoom = async (outboundMessage: string, targetUsername: string): Promise<Record<string, unknown>> => {
      const runSendAttempt = async (): Promise<unknown> => {
        return await ctx.executeScriptWithDomHelpers(
          async (messageValue: string, usernameValue: string) => {
          const wait = (ms: number) => new Promise((resolve) => {
            setTimeout(resolve, ms);
          });

          const pageWindow = window as Window & {
            __ottoDeepQuerySelector?: PageDeepQuerySelector;
            __ottoDeepQuerySelectorAll?: PageDeepQuerySelectorAll;
          };
          const deepQuerySelector = pageWindow.__ottoDeepQuerySelector;
          const deepQuerySelectorAll = pageWindow.__ottoDeepQuerySelectorAll;
          if (typeof deepQuerySelector !== 'function' || typeof deepQuerySelectorAll !== 'function') {
            throw new Error('otto_dom_query_helper_missing');
          }

          const queryAny = (selector: string): Element | null => {
            return deepQuerySelector(document, selector);
          };

          const findComposer = (): HTMLTextAreaElement | HTMLElement | null => {
            const textarea = queryAny('textarea');
            if (textarea instanceof HTMLTextAreaElement) {
              return textarea;
            }

            const contentEditable = queryAny('[contenteditable="true"], [role="textbox"]');
            if (contentEditable instanceof HTMLElement) {
              return contentEditable;
            }

            return null;
          };

          const findSendButton = (): HTMLButtonElement | null => {
            const buttons = deepQuerySelectorAll(document, 'button')
              .filter((candidate): candidate is HTMLButtonElement => candidate instanceof HTMLButtonElement);

            for (const button of buttons) {
              const text = (button.textContent ?? '').trim().toLowerCase();
              const label = (button.getAttribute('aria-label') ?? '').trim().toLowerCase();
              if (text === 'send' || label.includes('send')) {
                return button;
              }
            }

            return null;
          };

          const setComposerValue = (composer: HTMLTextAreaElement | HTMLElement): void => {
            composer.focus();
            if (composer instanceof HTMLTextAreaElement) {
              composer.value = messageValue;
              composer.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
              return;
            }
            composer.textContent = messageValue;
            composer.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
            composer.dispatchEvent(new Event('change', { bubbles: true }));
          };

          const pressEnter = (composer: HTMLTextAreaElement | HTMLElement): void => {
            composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            composer.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true }));
            composer.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
          };

          const diagnostics = (): Record<string, unknown> => {
            const composer = findComposer();
            return {
              path: window.location.pathname,
              composerTag: composer instanceof HTMLElement ? composer.tagName.toLowerCase() : undefined,
              hasSendButton: Boolean(findSendButton()),
            };
          };

          const waitForComposer = async (): Promise<HTMLTextAreaElement | HTMLElement> => {
            const deadline = Date.now() + 20000;
            while (Date.now() < deadline) {
              const composer = findComposer();
              if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLElement) {
                return composer;
              }
              await wait(150);
            }
            throw new Error(`reddit_chat_composer_missing:${JSON.stringify(diagnostics())}`);
          };

          const composer = await waitForComposer();
          setComposerValue(composer);
          pressEnter(composer);
          await wait(250);

          const sendButton = findSendButton();
          if (sendButton) {
            sendButton.click();
            await wait(300);
          }

          const currentComposer = findComposer();
          const cleared = currentComposer instanceof HTMLTextAreaElement
            ? currentComposer.value.trim().length === 0
            : (currentComposer instanceof HTMLElement
              ? (currentComposer.textContent ?? '').trim().length === 0
              : false);

          if (!cleared) {
            throw new Error(`reddit_chat_send_unconfirmed:${JSON.stringify(diagnostics())}`);
          }

          const banner = queryAny('faceplate-banner');
          if (banner instanceof HTMLElement) {
            const appearance = banner.getAttribute('appearance');
            const messageText = banner.getAttribute('msg') ?? '';
            if (appearance === 'error') {
              if (messageText.includes(`you've sent a lot of invites`)) {
                throw new Error('reddit_rate_limited');
              }
              throw new Error(messageText || 'reddit_chat_send_failed');
            }
          }

          const currentRoomId = window.location.pathname.startsWith('/chat/room/')
            ? window.location.pathname.replace('/chat/room/', '')
            : undefined;

            return {
              sent: true,
              roomId: currentRoomId,
              username: usernameValue || undefined,
              attempts: 1,
            };
          },
          [outboundMessage, targetUsername],
        );
      };

      const maxAttempts = 3;
      let lastKnownUrl: string | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        lastKnownUrl = await ctx.getTabUrl();
        const sendResult = await runSendAttempt();
        if (sendResult && typeof sendResult === 'object' && (sendResult as { sent?: unknown }).sent === true) {
          return {
            ...(sendResult as Record<string, unknown>),
            attempts: attempt,
          };
        }

        if (attempt < maxAttempts) {
          await new Promise((resolve) => {
            setTimeout(resolve, 250);
          });
        }
      }

      throw new Error(`reddit_chat_send_unconfirmed:${JSON.stringify({ reason: 'missing_result_payload', url: lastKnownUrl })}`);
    };

    let activeRoomId = roomId;
    if (activeRoomId) {
      await ctx.navigateTab(`https://reddit.com/chat/room/${encodeURIComponent(activeRoomId)}`);
    } else {
      const createdRoomId = await createRoomByUsername(username);
      activeRoomId = createdRoomId;
    }

    const sent = await sendInOpenRoom(message, username);
    const resolvedUsername = (typeof sent.username === 'string' && sent.username.length > 0)
      ? sent.username
      : (username || undefined);
    return {
      ...sent,
      roomId: (typeof sent.roomId === 'string' && sent.roomId.length > 0) ? sent.roomId : activeRoomId,
      ...(resolvedUsername ? { username: resolvedUsername } : {}),
    };
  },
  async test(_ctx, input, helpers) {
    const { username, roomId, message } = normalizeSendChatMessageInput(input);
    assertSendChatMessageInput({ username, roomId, message });

    return helpers.execute({
      ...(username ? { username } : {}),
      ...(roomId ? { roomId } : {}),
      message,
    });
  },
};
