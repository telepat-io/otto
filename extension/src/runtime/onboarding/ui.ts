import {
  DEFAULT_NODE_RELAY_URL,
  deriveOnboardingState,
  type OnboardingState,
  type OnboardingStorageSnapshot,
} from './state.js';

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
  aclCard: HTMLDivElement;
  aclRefresh: HTMLButtonElement;
  aclStatus: HTMLDivElement;
  aclList: HTMLDivElement;
};

type ControllerAclClientRow = {
  clientId: string;
  name: string;
  description: string;
  avatarSeed?: string;
  createdAt: number;
  lastUsedAt?: number;
  revoked: boolean;
  granted: boolean;
  grantExpiresAt?: number;
};

type ControllerAclResponse = {
  nodeId: string;
  clients: ControllerAclClientRow[];
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
    aclCard: maybeById<HTMLDivElement>('aclCard') ?? document.createElement('div'),
    aclRefresh: maybeById<HTMLButtonElement>('aclRefresh') ?? document.createElement('button'),
    aclStatus: maybeById<HTMLDivElement>('aclStatus') ?? document.createElement('div'),
    aclList: maybeById<HTMLDivElement>('aclList') ?? document.createElement('div'),
  };
}

function relayHttpFromWs(relayUrl: string): string {
  const parsed = new URL(relayUrl);
  parsed.search = '';
  parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  return parsed.toString().replace(/\/$/, '');
}

function formatTime(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'never';
  }
  return new Date(value).toLocaleString();
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function avatarStyle(seed: string): { background: string; initials: string } {
  const normalized = seed.trim() || 'otto';
  const hash = hashSeed(normalized);
  const hue = hash % 360;
  const bg = `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 65% 38%))`;
  const initials = normalized
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'OT';

  return {
    background: bg,
    initials,
  };
}

function renderAclRows(clients: ControllerAclClientRow[], refs: DomRefs): void {
  refs.aclList.innerHTML = '';
  if (clients.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'acl-meta';
    empty.textContent = 'No registered controller clients yet.';
    refs.aclList.appendChild(empty);
    return;
  }

  for (const client of clients) {
    const row = document.createElement('div');
    row.className = 'acl-row';

    const top = document.createElement('div');
    top.className = 'acl-row-top';

    const left = document.createElement('div');
    left.className = 'acl-left';

    const avatar = document.createElement('div');
    avatar.className = 'acl-avatar';
    const avatarData = avatarStyle(client.avatarSeed || client.name);
    avatar.style.background = avatarData.background;
    avatar.textContent = avatarData.initials;

    const textWrap = document.createElement('div');
    textWrap.className = 'acl-text';

    const label = document.createElement('div');
    label.className = 'acl-label';
    label.textContent = `${client.name} (${client.clientId})`;

    const description = document.createElement('div');
    description.className = 'acl-description';
    description.textContent = client.description;

    textWrap.appendChild(label);
    textWrap.appendChild(description);
    left.appendChild(avatar);
    left.appendChild(textWrap);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = `acl-action ${client.granted ? 'revoke' : 'grant'}`;
    action.dataset.clientId = client.clientId;
    action.dataset.grant = String(!client.granted);
    action.disabled = client.revoked;
    action.textContent = client.revoked
      ? 'Revoked'
      : (client.granted ? 'Revoke access' : 'Grant access');

    top.appendChild(left);
    top.appendChild(action);

    const meta = document.createElement('div');
    meta.className = 'acl-meta';
    const grantState = client.granted
      ? `granted${client.grantExpiresAt ? ` until ${formatTime(client.grantExpiresAt)}` : ''}`
      : 'awaiting approval';
    meta.textContent = `Last used ${formatTime(client.lastUsedAt)} • ${grantState}`;

    row.appendChild(top);
    row.appendChild(meta);
    refs.aclList.appendChild(row);
  }
}

async function listControllerAcl(snapshot: OnboardingStorageSnapshot): Promise<ControllerAclResponse> {
  const relayUrl = snapshot.relayUrl?.trim();
  const nodeAccessToken = snapshot.nodeAccessToken?.trim();
  if (!relayUrl || !nodeAccessToken) {
    throw new Error('Node is not authenticated.');
  }

  const base = relayHttpFromWs(relayUrl);
  const response = await fetch(`${base}/api/controller/access`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${nodeAccessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list ACL clients (${response.status})`);
  }

  return await response.json() as ControllerAclResponse;
}

async function mutateControllerAcl(
  snapshot: OnboardingStorageSnapshot,
  clientId: string,
  grant: boolean,
): Promise<void> {
  const relayUrl = snapshot.relayUrl?.trim();
  const nodeAccessToken = snapshot.nodeAccessToken?.trim();
  if (!relayUrl || !nodeAccessToken) {
    throw new Error('Node is not authenticated.');
  }

  const base = relayHttpFromWs(relayUrl);
  const response = await fetch(`${base}/api/controller/access`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${nodeAccessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ clientId, grant }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update ACL (${response.status})`);
  }
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
    refs.pairingCommandToast.classList.remove('is-visible');
    refs.pairingCommandToast.setAttribute('aria-hidden', 'true');
    refs.pairingCommandToast.textContent = '';
    delete refs.pairingCommandToast.dataset.variant;
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

  const aclVisible = Boolean(snapshot.nodeAccessToken);
  refs.aclCard.style.display = aclVisible ? 'block' : 'none';
  if (aclVisible) {
    try {
      refs.aclStatus.textContent = 'Loading controller access list...';
      const acl = await listControllerAcl(snapshot);
      refs.aclStatus.style.color = '#334155';
      refs.aclStatus.textContent = `Node ${acl.nodeId}: ${acl.clients.filter((client) => client.granted).length} granted / ${acl.clients.length} total`;
      renderAclRows(acl.clients, refs);
    } catch (error) {
      refs.aclStatus.textContent = error instanceof Error ? error.message : 'Failed to load controller access list.';
      refs.aclStatus.style.color = '#b42318';
      refs.aclList.innerHTML = '';
    }
  }

  if (state !== 'error') {
    refs.relaySaveStatus.style.color = '#334155';
  }
}

export function mountOnboardingUi(surface: Surface): void {
  const refs = getDomRefs();
  let autosaveTimer: number | undefined;
  let refreshPollTimer: number | undefined;
  let refreshSuccessTimer: number | undefined;
  let copyToastHideTimer: number | undefined;
  let copyToastResetTimer: number | undefined;
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

  const flashRefreshSuccess = () => {
    refs.refreshButton.classList.add('refresh-success');
    if (refreshSuccessTimer) {
      clearTimeout(refreshSuccessTimer);
    }
    refreshSuccessTimer = setTimeout(() => {
      refs.refreshButton.classList.remove('refresh-success');
    }, 1200) as unknown as number;
  };

  const showCopyToast = (message: string, variant: 'success' | 'error') => {
    refs.pairingCommandToast.textContent = message;
    refs.pairingCommandToast.dataset.variant = variant;
    refs.pairingCommandToast.setAttribute('aria-hidden', 'false');
    refs.pairingCommandToast.classList.add('is-visible');

    if (copyToastHideTimer) {
      clearTimeout(copyToastHideTimer);
    }
    if (copyToastResetTimer) {
      clearTimeout(copyToastResetTimer);
    }

    copyToastHideTimer = setTimeout(() => {
      refs.pairingCommandToast.classList.remove('is-visible');
      refs.pairingCommandToast.setAttribute('aria-hidden', 'true');
      copyToastResetTimer = setTimeout(() => {
        refs.pairingCommandToast.textContent = '';
        delete refs.pairingCommandToast.dataset.variant;
      }, 200) as unknown as number;
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
        flashRefreshSuccess();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to refresh status.';
        showMessage(message, '#b42318');
      } finally {
        setBusy(false);
      }
    })();
  });

  refs.aclRefresh.addEventListener('click', () => {
    void sync(refs);
  });

  refs.aclList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const clientId = target.dataset.clientId;
    const grant = target.dataset.grant === 'true';
    if (!clientId) {
      return;
    }

    target.disabled = true;
    void (async () => {
      try {
        const snapshot = await loadSnapshot();
        await mutateControllerAcl(snapshot, clientId, grant);
        await sync(refs);
      } catch (error) {
        refs.aclStatus.textContent = error instanceof Error ? error.message : 'Failed to update controller access.';
        refs.aclStatus.style.color = '#b42318';
      } finally {
        target.disabled = false;
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
        showCopyToast('Copied command', 'success');
      } catch {
        showCopyToast('Copy failed', 'error');
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
