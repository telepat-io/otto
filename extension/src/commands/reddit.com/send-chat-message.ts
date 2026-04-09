import type { SiteCommand } from '../types.js';

type SendChatMessageInput = {
  username?: string;
  roomId?: string;
  message?: string;
};

const CHAT_HOME_URL = 'https://chat.reddit.com/';

export const sendChatMessageCommand: SiteCommand = {
  metadata: {
    site: 'reddit.com',
    id: 'sendChatMessage',
    displayName: 'Send Reddit Chat Message',
    description: 'Creates or opens a Reddit chat room and sends a message.',
    tags: ['chat', 'reddit'],
    requiresAuth: true,
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
    const parsed = (input ?? {}) as SendChatMessageInput;
    const username = typeof parsed.username === 'string' ? parsed.username.trim().replace(/^u\//, '') : '';
    const roomId = typeof parsed.roomId === 'string' ? parsed.roomId.trim() : '';
    const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';

    if (!message) {
      throw new Error('sendChatMessage requires input.message');
    }
    if (!username && !roomId) {
      throw new Error('sendChatMessage requires input.username or input.roomId');
    }

    if (roomId) {
      await ctx.navigateTab(`https://chat.reddit.com/room/${encodeURIComponent(roomId)}`);
    } else {
      await ctx.navigateTab(CHAT_HOME_URL);
    }

    const result = await ctx.executeScript(
      async (targetUsername: string, targetRoomId: string, outboundMessage: string) => {
        const wait = (ms: number) => new Promise((resolve) => {
          setTimeout(resolve, ms);
        });

        const queryDeep = (selector: string): Element | null => {
          const app = document.querySelector('rs-app');
          const appShadow = app?.shadowRoot;
          const roomCreation = appShadow?.querySelector('rs-room-creation');
          const roomCreationShadow = roomCreation?.shadowRoot;
          const roomCreate = roomCreationShadow?.querySelector('rs-direct-chat-creation');
          const roomCreateShadow = roomCreate?.shadowRoot;

          return (
            document.querySelector(selector) ||
            appShadow?.querySelector(selector) ||
            roomCreationShadow?.querySelector(selector) ||
            roomCreateShadow?.querySelector(selector) ||
            null
          );
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

        const ensureRoom = async (): Promise<void> => {
          if (targetRoomId) {
            return;
          }

          const app = document.querySelector('rs-app');
          const roomCreationLink = app?.shadowRoot?.querySelector('a[href="/room/create"]');
          if (!(roomCreationLink instanceof HTMLAnchorElement)) {
            throw new Error('reddit_chat_room_create_link_missing');
          }
          roomCreationLink.click();

          const hasUserSearch = await waitFor(() => Boolean(queryDeep('rs-users-multiselect input')), 15000, 150);
          if (!hasUserSearch) {
            throw new Error('reddit_chat_user_search_timeout');
          }

          const userInput = queryDeep('rs-users-multiselect input');
          if (!(userInput instanceof HTMLInputElement)) {
            throw new Error('reddit_chat_user_search_input_missing');
          }

          userInput.focus();
          userInput.value = targetUsername;
          userInput.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));

          let selected = false;
          const selectDeadline = Date.now() + 15000;
          while (!selected && Date.now() < selectDeadline) {
            const searchResult = queryDeep('.search-results li div');
            if (searchResult instanceof HTMLElement) {
              if (searchResult.getAttribute('aria-disabled') === 'true') {
                await wait(1000);
                const retryResult = queryDeep('.search-results li div');
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

          if (!selected) {
            throw new Error('reddit_chat_user_not_found_in_create_flow');
          }

          const createButtons = Array.from(document.querySelectorAll('rs-app'))
            .flatMap((host) => {
              const shadow = (host as HTMLElement).shadowRoot;
              const roomCreation = shadow?.querySelector('rs-room-creation');
              const roomShadow = roomCreation?.shadowRoot;
              const roomCreate = roomShadow?.querySelector('rs-direct-chat-creation');
              return Array.from(roomCreate?.shadowRoot?.querySelectorAll('button') ?? []);
            });

          const submit = createButtons.find((button) => {
            const text = (button.textContent ?? '').trim().toLowerCase();
            return text.includes('create') || text.includes('chat') || text.includes('start');
          }) ?? createButtons[createButtons.length - 1];
          if (!(submit instanceof HTMLButtonElement)) {
            throw new Error('reddit_chat_create_submit_missing');
          }
          submit.click();
        };

        await ensureRoom();

        const hasTextarea = await waitFor(() => Boolean(queryDeep('textarea')), 30000, 150);
        if (!hasTextarea) {
          throw new Error('reddit_chat_textarea_timeout');
        }

        let lastError = '';
        let attempts = 0;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          attempts = attempt + 1;
          try {
            const textarea = queryDeep('textarea');
            if (!(textarea instanceof HTMLTextAreaElement)) {
              throw new Error('reddit_chat_textarea_missing');
            }

            textarea.focus();
            textarea.value = outboundMessage;
            textarea.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
            textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            textarea.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true }));
            textarea.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
            await wait(300);
            break;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            if (attempt === 2) {
              throw error;
            }
            await wait(500);
          }
        }

        const alertsBanner = queryDeep('rs-alerts-banner');
        const banner = alertsBanner instanceof HTMLElement
          ? alertsBanner.shadowRoot?.querySelector('faceplate-banner')
          : null;
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

        const currentRoomId = window.location.pathname.startsWith('/room/')
          ? window.location.pathname.replace('/room/', '')
          : undefined;

        return {
          sent: true,
          roomId: currentRoomId,
          username: targetUsername || undefined,
          attempts,
          lastError: lastError || undefined,
        };
      },
      [username, roomId, message],
    );

    return result && typeof result === 'object'
      ? result as Record<string, unknown>
      : { sent: true };
  },
  async test(ctx, input) {
    const parsed = (input ?? {}) as SendChatMessageInput;
    const username = typeof parsed.username === 'string' ? parsed.username.trim().replace(/^u\//, '') : '';
    const roomId = typeof parsed.roomId === 'string' ? parsed.roomId.trim() : '';

    if (roomId) {
      await ctx.navigateTab(`https://chat.reddit.com/room/${encodeURIComponent(roomId)}`);
    } else {
      await ctx.navigateTab(CHAT_HOME_URL);
    }

    const readiness = await ctx.executeScript(
      async (targetRoomId: string) => {
        const wait = (ms: number) => new Promise((resolve) => {
          setTimeout(resolve, ms);
        });

        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          if (targetRoomId) {
            if (document.querySelector('textarea')) {
              return { ready: true, mode: 'existing-room' };
            }
          } else {
            const app = document.querySelector('rs-app');
            const roomCreationLink = app?.shadowRoot?.querySelector('a[href="/room/create"]');
            if (roomCreationLink instanceof HTMLAnchorElement) {
              return { ready: true, mode: 'create-room' };
            }
          }
          await wait(150);
        }

        return { ready: false };
      },
      [roomId],
    );

    return {
      ready: Boolean(readiness && typeof readiness === 'object' && (readiness as { ready?: unknown }).ready),
      username: username || undefined,
      roomId: roomId || undefined,
      ...((readiness && typeof readiness === 'object' && !Array.isArray(readiness))
        ? readiness as Record<string, unknown>
        : {}),
    };
  },
};
