type ChromeLike = typeof chrome;

type KeepaliveScriptMode = 'start' | 'stop';

type KeepaliveScriptPayload = {
  __ottoAudioKeepalive: KeepaliveScriptMode;
  tabSessionId?: string;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readTabSessionIdByTabId(chromeApi: ChromeLike, tabId: number): Promise<string | null> {
  const snapshot = await chromeApi.storage.session.get(['tabSessions']);
  const tabSessions = (snapshot.tabSessions as Record<string, unknown> | undefined) ?? {};

  for (const [tabSessionId, rawTabId] of Object.entries(tabSessions)) {
    if (rawTabId === tabId) {
      return tabSessionId;
    }
  }

  return null;
}

async function readTabIdByTabSessionId(chromeApi: ChromeLike, tabSessionId: string): Promise<number | null> {
  const snapshot = await chromeApi.storage.session.get(['tabSessions']);
  const tabSessions = (snapshot.tabSessions as Record<string, unknown> | undefined) ?? {};
  const rawTabId = tabSessions[tabSessionId];
  return typeof rawTabId === 'number' ? rawTabId : null;
}

function isTabUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes('no tab with id') || message.includes('the tab was closed');
}

function isInjectionRestrictedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('cannot access contents of the page')
    || message.includes('cannot access a chrome:// url')
    || message.includes('cannot access contents of url')
    || message.includes('extensions gallery');
}

async function executeKeepaliveScript(
  chromeApi: ChromeLike,
  tabId: number,
  mode: KeepaliveScriptMode,
  tabSessionId?: string,
): Promise<void> {
  await chromeApi.scripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    args: [{ __ottoAudioKeepalive: mode, tabSessionId } satisfies KeepaliveScriptPayload],
    func: async (payload: KeepaliveScriptPayload) => {
      const runtimeRoundTrip = async () => {
        const runtime = (globalThis as {
          chrome?: {
            runtime?: {
              sendMessage?: (message: unknown, callback?: () => void) => void;
            };
          };
        }).chrome?.runtime;

        const sendMessage = runtime?.sendMessage;
        if (!sendMessage) {
          return;
        }

        await new Promise<void>((resolve) => {
          let settled = false;
          const complete = () => {
            if (settled) {
              return;
            }
            settled = true;
            resolve();
          };

          const timer = setTimeout(complete, 200);

          try {
            sendMessage(
              {
                type: 'otto.audioKeepalive.ping',
                payload: {
                  tabSessionId: payload.tabSessionId,
                  sentAt: Date.now(),
                },
              },
              () => {
                clearTimeout(timer);
                complete();
              },
            );
          } catch {
            clearTimeout(timer);
            complete();
          }
        });
      };

      const attemptResume = async (context: AudioContext) => {
        try {
          await context.resume();
        } catch {
          // Resume can fail in some page contexts; keep best-effort behavior.
        }

        if (context.state === 'suspended') {
          await runtimeRoundTrip();
          try {
            await context.resume();
          } catch {
            // Keepalive remains best-effort when autoplay policies still block resume.
          }
        }
      };

      const stateKey = '__otto_audio_keepalive_state_v1';
      const root = globalThis as Record<string, unknown>;
      const state = root[stateKey] as {
        context?: AudioContext;
        oscillator?: OscillatorNode;
        gain?: GainNode;
        resume?: () => void;
        visibilityListener?: () => void;
      } | undefined;

      if (payload.__ottoAudioKeepalive === 'stop') {
        if (!state) {
          return { active: false, stopped: false };
        }

        if (state.visibilityListener) {
          document.removeEventListener('visibilitychange', state.visibilityListener, true);
        }

        try {
          state.oscillator?.stop();
        } catch {
          // Ignore oscillator stop errors during teardown.
        }

        try {
          state.oscillator?.disconnect();
          state.gain?.disconnect();
        } catch {
          // Ignore disconnect errors for already-disposed nodes.
        }

        try {
          await state.context?.close();
        } catch {
          // Ignore context close errors for already-closed contexts.
        }

        delete root[stateKey];
        return { active: false, stopped: true };
      }

      if (state?.context) {
        if (state.context.state === 'suspended') {
          await attemptResume(state.context);
        }
        return { active: true, reused: true };
      }

      const AudioContextCtor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext
        ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextCtor) {
        return { active: false, reason: 'audio_context_unavailable' };
      }

      const context = new AudioContextCtor();
      await attemptResume(context);

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 20000;
      gain.gain.value = 0.001;

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();

      const resume = () => {
        if (context.state === 'suspended') {
          void attemptResume(context);
        }
      };

      const visibilityListener = () => {
        resume();
      };

      document.addEventListener('visibilitychange', visibilityListener, true);

      root[stateKey] = {
        context,
        oscillator,
        gain,
        resume,
        visibilityListener,
      };

      return {
        active: true,
        reused: false,
        tabSessionId: payload.tabSessionId,
      };
    },
  });
}

export function createTabAudioKeepaliveManager(chromeApi: ChromeLike) {
  const tabSessionByTabId = new Map<number, string>();
  const tabIdByTabSession = new Map<string, number>();

  const remember = (tabId: number, tabSessionId: string) => {
    tabSessionByTabId.set(tabId, tabSessionId);
    tabIdByTabSession.set(tabSessionId, tabId);
  };

  const forgetByTabId = (tabId: number) => {
    const tabSessionId = tabSessionByTabId.get(tabId);
    if (tabSessionId) {
      tabIdByTabSession.delete(tabSessionId);
    }
    tabSessionByTabId.delete(tabId);
  };

  const forgetByTabSessionId = (tabSessionId: string) => {
    const tabId = tabIdByTabSession.get(tabSessionId);
    if (typeof tabId === 'number') {
      tabSessionByTabId.delete(tabId);
    }
    tabIdByTabSession.delete(tabSessionId);
  };

  const runWithTimeout = async (
    operation: Promise<void>,
    timeoutMs?: number,
  ): Promise<boolean> => {
    if (!timeoutMs || timeoutMs <= 0) {
      try {
        await operation;
        return true;
      } catch {
        return false;
      }
    }

    const guarded = operation.then(
      () => true,
      () => false,
    );

    return await Promise.race([
      guarded,
      delay(timeoutMs).then(() => false),
    ]);
  };

  const startForManagedTab = async (
    tabSessionId: string,
    tabId: number,
    options?: { timeoutMs?: number },
  ): Promise<boolean> => {
    remember(tabId, tabSessionId);

    const success = await runWithTimeout(
      executeKeepaliveScript(chromeApi, tabId, 'start', tabSessionId),
      options?.timeoutMs,
    );

    if (!success) {
      try {
        await chromeApi.tabs.get(tabId);
      } catch (error) {
        if (isTabUnavailableError(error)) {
          forgetByTabId(tabId);
        }
      }
    }

    return success;
  };

  const ensureForManagedTab = async (
    tabSessionId: string,
    tabId: number,
    options?: { timeoutMs?: number },
  ): Promise<boolean> => {
    return await startForManagedTab(tabSessionId, tabId, options);
  };

  const ensureForTabId = async (tabId: number, options?: { timeoutMs?: number }): Promise<boolean> => {
    let tabSessionId = tabSessionByTabId.get(tabId) ?? null;
    if (!tabSessionId) {
      tabSessionId = await readTabSessionIdByTabId(chromeApi, tabId);
      if (!tabSessionId) {
        return false;
      }
      remember(tabId, tabSessionId);
    }

    return await ensureForManagedTab(tabSessionId, tabId, options);
  };

  const stopForManagedTab = async (tabSessionId: string, tabId: number): Promise<boolean> => {
    forgetByTabId(tabId);
    forgetByTabSessionId(tabSessionId);

    try {
      await executeKeepaliveScript(chromeApi, tabId, 'stop', tabSessionId);
      return true;
    } catch (error) {
      if (isInjectionRestrictedError(error) || isTabUnavailableError(error)) {
        return false;
      }
      return false;
    }
  };

  const stopByTabSessionId = async (tabSessionId: string): Promise<boolean> => {
    const knownTabId = tabIdByTabSession.get(tabSessionId);
    if (typeof knownTabId === 'number') {
      return await stopForManagedTab(tabSessionId, knownTabId);
    }

    const tabId = await readTabIdByTabSessionId(chromeApi, tabSessionId);
    if (typeof tabId !== 'number') {
      forgetByTabSessionId(tabSessionId);
      return false;
    }

    return await stopForManagedTab(tabSessionId, tabId);
  };

  const onTabRemoved = (tabId: number): void => {
    forgetByTabId(tabId);
  };

  return {
    startForManagedTab,
    ensureForManagedTab,
    ensureForTabId,
    stopForManagedTab,
    stopByTabSessionId,
    onTabRemoved,
  };
}
