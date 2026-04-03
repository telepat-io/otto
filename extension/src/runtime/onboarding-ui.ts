import {
  DEFAULT_NODE_RELAY_URL,
  deriveOnboardingState,
  type OnboardingState,
  type OnboardingStorageSnapshot,
} from './onboarding-state.js';

type Surface = 'popup' | 'options';

const STORAGE_KEYS = [
  'relayUrl',
  'localDevLogStreamingEnabled',
  'nodeId',
  'pairingCode',
  'pairingChallengeId',
  'nodeAccessToken',
  'nodeRefreshToken',
  'relayConnectionStatus',
  'relayConnectionError',
] as const;

type DomRefs = {
  relayInput: HTMLInputElement;
  localDevLogToggle: HTMLInputElement;
  localDevLogRow: HTMLDivElement;
  refreshButton: HTMLButtonElement;
  statusChip: HTMLSpanElement;
  stateTitle: HTMLDivElement;
  stateDetail: HTMLDivElement;
  pairingCode: HTMLDivElement;
  pairingCommandToast: HTMLDivElement;
  pairingCommand: HTMLPreElement;
  nodeId: HTMLDivElement;
  relaySaveStatus: HTMLDivElement;
};

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing expected element: ${id}`);
  }
  return element as T;
}

function maybeById<T extends HTMLElement>(id: string): T | null {
  const element = document.getElementById(id);
  return element ? (element as T) : null;
}

function getDomRefs(): DomRefs {
  return {
    relayInput: byId<HTMLInputElement>('relayUrl'),
    localDevLogToggle: maybeById<HTMLInputElement>('localDevLogStreamingEnabled') ?? document.createElement('input'),
    localDevLogRow: maybeById<HTMLDivElement>('localDevLogRow') ?? document.createElement('div'),
    refreshButton: maybeById<HTMLButtonElement>('refreshStatus') ?? document.createElement('button'),
    statusChip: byId<HTMLSpanElement>('stateChip'),
    stateTitle: byId<HTMLDivElement>('stateTitle'),
    stateDetail: byId<HTMLDivElement>('stateDetail'),
    pairingCode: byId<HTMLDivElement>('pairingCode'),
    pairingCommandToast: maybeById<HTMLDivElement>('pairingCommandToast') ?? document.createElement('div'),
    pairingCommand: byId<HTMLPreElement>('pairingCommand'),
    nodeId: byId<HTMLDivElement>('nodeId'),
    relaySaveStatus: byId<HTMLDivElement>('relaySaveStatus'),
  };
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('Clipboard copy is not available in this browser context.');
  }
}

function normalizeRelayUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Relay URL is required.');
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol === 'http:') {
    parsed.protocol = 'ws:';
  } else if (parsed.protocol === 'https:') {
    parsed.protocol = 'wss:';
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('Relay URL must use ws:// or wss:// protocol.');
  }

  parsed.searchParams.set('role', 'node');
  return parsed.toString();
}

function shouldPoll(state: OnboardingState): boolean {
  return state === 'requesting_pairing_code'
    || state === 'waiting_for_pair_approval'
    || state === 'authenticated_connecting';
}

function isLocalRelayUrl(rawUrl?: string): boolean {
  if (!rawUrl) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

async function loadSnapshot(): Promise<OnboardingStorageSnapshot> {
  const snapshot = await chrome.storage.local.get([...STORAGE_KEYS]);
  return snapshot as OnboardingStorageSnapshot;
}

function render(snapshot: OnboardingStorageSnapshot, refs: DomRefs): OnboardingState {
  const view = deriveOnboardingState(snapshot);
  const showPairingStatus = Boolean(view.pairingCode)
    || view.state === 'requesting_pairing_code'
    || view.state === 'waiting_for_pair_approval';

  refs.relayInput.value = snapshot.relayUrl?.trim() || DEFAULT_NODE_RELAY_URL;
  const isLocal = isLocalRelayUrl(snapshot.relayUrl);
  refs.localDevLogRow.style.display = isLocal ? 'flex' : 'none';
  refs.localDevLogToggle.disabled = !isLocal;
  refs.localDevLogToggle.checked = isLocal && snapshot.localDevLogStreamingEnabled === true;
  refs.statusChip.textContent = view.badgeText;
  refs.statusChip.style.backgroundColor = view.badgeColor;
  refs.stateTitle.textContent = view.stateLabel;
  refs.stateTitle.style.color = '#111827';
  refs.stateDetail.textContent = view.detail;
  refs.nodeId.textContent = `Node ID: ${view.nodeId}`;
  refs.pairingCode.style.display = showPairingStatus ? 'block' : 'none';
  refs.pairingCode.textContent = view.pairingCode
    ? `Pairing code: ${view.pairingCode}`
    : 'Pairing code: waiting for challenge';

  refs.refreshButton.style.display = view.state === 'error' ? 'inline-block' : 'none';

  if (view.pairingCode) {
    refs.pairingCommand.style.display = 'block';
    refs.pairingCommand.textContent = `otto pair ${view.pairingCode}`;
    refs.pairingCommand.style.cursor = 'pointer';
    refs.pairingCommand.title = 'Click to copy command';
  } else {
    refs.pairingCommand.style.display = 'none';
    refs.pairingCommand.textContent = '';
    refs.pairingCommand.style.cursor = 'default';
    refs.pairingCommand.title = '';
    refs.pairingCommandToast.style.display = 'none';
    refs.pairingCommandToast.textContent = '';
  }

  return view.state;
}

async function refreshRuntime(surface: Surface): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: 'otto.refreshSetup', payload: { source: surface } }) as {
    ok?: boolean;
    error?: string;
  };

  if (!response?.ok) {
    throw new Error(response?.error || 'Failed to refresh runtime status.');
  }
}

async function saveRelayUrl(nextRelayUrlRaw: string, surface: Surface): Promise<void> {
  const relayUrl = normalizeRelayUrl(nextRelayUrlRaw);
  const current = await chrome.storage.local.get(['relayUrl', 'localDevLogStreamingEnabled']);
  const previousRelayUrl = typeof current.relayUrl === 'string' ? current.relayUrl : '';

  if (previousRelayUrl === relayUrl) {
    return;
  }

  await chrome.storage.local.set({
    relayUrl,
    relayConnectionStatus: 'idle',
    localDevLogStreamingEnabled: isLocalRelayUrl(relayUrl)
      ? current.localDevLogStreamingEnabled === true
      : false,
  });
  await chrome.storage.local.remove([
    'relayConnectionError',
    'nodeAccessToken',
    'nodeRefreshToken',
    'pairingChallengeId',
    'pairingCode',
    'pairingExpiresAt',
  ]);

  if (current.localDevLogStreamingEnabled === true) {
    try {
      await chrome.runtime.sendMessage({
        type: 'otto.extensionLog',
        payload: {
          level: 'debug',
          type: 'onboarding.relay_url_saved',
          status: 'connecting',
          data: {
            relayUrl,
            surface,
          },
        },
      });
    } catch {
      // Ignore logging pipeline failures while saving setup state.
    }
  }
}

async function sync(refs: DomRefs): Promise<void> {
  const snapshot = await loadSnapshot();
  const state = render(snapshot, refs);
  if (state !== 'error') {
    refs.relaySaveStatus.style.color = '#334155';
  }
}

export function mountOnboardingUi(surface: Surface): void {
  const refs = getDomRefs();
  let autosaveTimer: number | undefined;
  let refreshPollTimer: number | undefined;
  let copyToastTimer: number | undefined;
  let pollingInFlight = false;
  let lastSavedRelayUrl = '';

  const setBusy = (busy: boolean) => {
    if (refs.refreshButton.style.display !== 'none') {
      refs.refreshButton.disabled = busy;
    }
  };

  const showMessage = (message: string, color: string) => {
    refs.relaySaveStatus.textContent = message;
    refs.relaySaveStatus.style.color = color;
  };

  const showCopyToast = (message: string) => {
    refs.pairingCommandToast.textContent = message;
    refs.pairingCommandToast.style.display = 'block';
    if (copyToastTimer) {
      clearTimeout(copyToastTimer);
    }
    copyToastTimer = setTimeout(() => {
      refs.pairingCommandToast.style.display = 'none';
    }, 1400) as unknown as number;
  };

  const stopRefreshPolling = () => {
    if (refreshPollTimer) {
      clearInterval(refreshPollTimer);
      refreshPollTimer = undefined;
    }
  };

  const startRefreshPolling = () => {
    if (refreshPollTimer) {
      return;
    }
    refreshPollTimer = setInterval(() => {
      if (pollingInFlight) {
        return;
      }
      pollingInFlight = true;
      void (async () => {
        try {
          await refreshRuntime(surface);
          await sync(refs);
        } finally {
          pollingInFlight = false;
        }
      })();
    }, 4000) as unknown as number;
  };

  const updatePollingForCurrentState = async () => {
    const snapshot = await loadSnapshot();
    const state = deriveOnboardingState(snapshot).state;
    if (shouldPoll(state)) {
      startRefreshPolling();
      return;
    }
    stopRefreshPolling();
  };

  const attemptAutoSave = () => {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
    }

    autosaveTimer = setTimeout(() => {
      void (async () => {
        const rawInput = refs.relayInput.value.trim();
        if (!rawInput) {
          return;
        }

        try {
          const normalized = normalizeRelayUrl(rawInput);
          if (normalized === lastSavedRelayUrl) {
            return;
          }

          await saveRelayUrl(rawInput, surface);
          lastSavedRelayUrl = normalized;
          await refreshRuntime(surface);
          await sync(refs);
          await updatePollingForCurrentState();
          showMessage('Relay URL saved automatically', '#0f5132');
        } catch {
          // Ignore while user is still typing; manual refresh remains available.
        }
      })();
    }, 500) as unknown as number;
  };

  refs.relayInput.addEventListener('input', attemptAutoSave);
  refs.relayInput.addEventListener('blur', attemptAutoSave);
  refs.localDevLogToggle.addEventListener('change', () => {
    void (async () => {
      const relayUrl = refs.relayInput.value.trim();
      if (!isLocalRelayUrl(relayUrl)) {
        refs.localDevLogToggle.checked = false;
        await chrome.storage.local.set({ localDevLogStreamingEnabled: false });
        showMessage('Local-dev relay logging is available only for localhost/127.0.0.1 relay URLs', '#b42318');
        return;
      }

      await chrome.storage.local.set({ localDevLogStreamingEnabled: refs.localDevLogToggle.checked });
      if (refs.localDevLogToggle.checked) {
        await chrome.runtime.sendMessage({
          type: 'otto.extensionLog',
          payload: {
            level: 'debug',
            type: 'onboarding.local_dev_log_streaming_enabled',
            data: { surface },
          },
        });
      }
      showMessage(
        refs.localDevLogToggle.checked
          ? 'Local-dev relay log streaming enabled'
          : 'Local-dev relay log streaming disabled',
        '#334155',
      );
    })();
  });
  refs.relayInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      attemptAutoSave();
    }
  });

  refs.refreshButton.addEventListener('click', () => {
    void (async () => {
      setBusy(true);
      try {
        showMessage('Checking connection...', '#334155');
        await refreshRuntime(surface);
        await sync(refs);
        await updatePollingForCurrentState();
        showMessage('Status refreshed', '#0f5132');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to refresh status.';
        showMessage(message, '#b42318');
      } finally {
        setBusy(false);
      }
    })();
  });

  refs.pairingCommand.addEventListener('click', () => {
    void (async () => {
      const command = refs.pairingCommand.textContent?.trim();
      if (!command) {
        return;
      }

      try {
        await copyTextToClipboard(command);
        showCopyToast('Copied command');
      } catch {
        showCopyToast('Copy failed');
      }
    })();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return;
    }

    const shouldRefresh = STORAGE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(changes, key));
    if (shouldRefresh) {
      void (async () => {
        await sync(refs);
        await updatePollingForCurrentState();
      })();
    }
  });

  void (async () => {
    await sync(refs);
    const current = await chrome.storage.local.get(['relayUrl']);
    if (typeof current.relayUrl === 'string') {
      lastSavedRelayUrl = current.relayUrl;
    }
    try {
      await refreshRuntime(surface);
      await sync(refs);
      await updatePollingForCurrentState();
      showMessage('Relay URL saves automatically', '#334155');
    } catch {
      // Let storage-driven state surface the most recent known status.
    }
  })();
}
