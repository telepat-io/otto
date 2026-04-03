import { nanoid } from 'nanoid';
import { createSingleFlight } from './single-flight.js';

const OFFSCREEN_PATH = 'offscreen.html';
const DEFAULT_HEARTBEAT_MINUTES = 0.5;
const OFFSCREEN_SINGLE_FLIGHT_KEY = 'offscreen.ensure';
const STATUS_MAX_RETRIES = 2;
const STATUS_RETRY_BASE_DELAY_MS = 150;

const runtimeSingleFlight = createSingleFlight();

type ChromeLike = typeof chrome;
type TabSessionMap = Record<string, number>;

type PairingChallenge = {
  challengeId: string;
  code: string;
  expiresAt: number;
};

type RefreshAccessTokenResponse = {
  accessToken?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestPairingChallenge(
  chromeApi: ChromeLike,
  fetchImpl: typeof fetch,
  base: string,
  nodeId: string,
  log: (message: string) => void,
): Promise<void> {
  const response = await fetchImpl(`${base}/api/pairing/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId }),
  });
  if (!response.ok) {
    throw new Error(`Failed to request pairing challenge: ${response.status}`);
  }
  const challenge = (await response.json()) as PairingChallenge;
  await chromeApi.storage.local.set({
    pairingChallengeId: challenge.challengeId,
    pairingCode: challenge.code,
    pairingExpiresAt: challenge.expiresAt,
  });
  log(`[otto:bg] pairing code generated: ${challenge.code}`);
}

async function clearPairingChallenge(chromeApi: ChromeLike): Promise<void> {
  await chromeApi.storage.local.remove(['pairingChallengeId', 'pairingCode', 'pairingExpiresAt']);
}

async function validateNodeTokens(
  chromeApi: ChromeLike,
  fetchImpl: typeof fetch,
  base: string,
  refreshToken: string,
  log: (message: string) => void,
): Promise<boolean> {
  try {
    const refreshResp = await fetchImpl(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!refreshResp.ok) {
      log('[otto:bg] stored node refresh token was rejected; clearing node tokens');
      await chromeApi.storage.local.remove(['nodeAccessToken', 'nodeRefreshToken']);
      return false;
    }

    const refreshed = (await refreshResp.json()) as RefreshAccessTokenResponse;
    if (typeof refreshed.accessToken !== 'string' || refreshed.accessToken.length === 0) {
      log('[otto:bg] refresh endpoint returned invalid access token; clearing node tokens');
      await chromeApi.storage.local.remove(['nodeAccessToken', 'nodeRefreshToken']);
      return false;
    }

    await chromeApi.storage.local.set({ nodeAccessToken: refreshed.accessToken });
    return true;
  } catch {
    // Keep existing tokens on transient transport failures.
    log('[otto:bg] unable to validate stored node token due to network/transport error');
    return true;
  }
}

export function relayHttpFromWs(relayUrl: string): string {
  const parsed = new URL(relayUrl);
  parsed.search = '';
  parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  return parsed.toString().replace(/\/$/, '');
}

export async function ensureNodeId(chromeApi: ChromeLike): Promise<string> {
  const current = await chromeApi.storage.local.get(['nodeId']);
  if (current.nodeId) return current.nodeId as string;
  const nodeId = `node_${nanoid(10)}`;
  await chromeApi.storage.local.set({ nodeId });
  return nodeId;
}

export async function getRelayUrl(chromeApi: ChromeLike): Promise<string> {
  const config = await chromeApi.storage.local.get(['relayUrl']);
  return (config.relayUrl as string) || 'ws://127.0.0.1:8787?role=node';
}

function isDuplicateOffscreenDocumentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /only a single offscreen document may be created/i.test(error.message);
}

export async function ensureOffscreenDocument(chromeApi: ChromeLike): Promise<void> {
  await runtimeSingleFlight.run(OFFSCREEN_SINGLE_FLIGHT_KEY, async () => {
    const url = chromeApi.runtime.getURL(OFFSCREEN_PATH);
    const contexts = await chromeApi.runtime.getContexts({
      contextTypes: [chromeApi.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [url],
    });

    if (contexts.length === 0) {
      try {
        await chromeApi.offscreen.createDocument({
          url: OFFSCREEN_PATH,
          reasons: [chromeApi.offscreen.Reason.WORKERS],
          justification: 'Maintain persistent websocket connection for remote relay control.',
        });
      } catch (error) {
        if (!isDuplicateOffscreenDocumentError(error)) {
          throw error;
        }
      }
    }
  });
}

export async function ensurePairingState(
  chromeApi: ChromeLike,
  fetchImpl: typeof fetch,
  log: (message: string) => void,
): Promise<void> {
  const [nodeId, relayUrl] = await Promise.all([ensureNodeId(chromeApi), getRelayUrl(chromeApi)]);
  const base = relayHttpFromWs(relayUrl);
  log(`[otto:bg] ensurePairingState start (nodeId=${nodeId}, relay=${base})`);
  const stored = await chromeApi.storage.local.get([
    'nodeAccessToken',
    'nodeRefreshToken',
    'pairingChallengeId',
    'pairingCode',
    'pairingExpiresAt',
  ]);

  if ((stored.nodeAccessToken && !stored.nodeRefreshToken) || (!stored.nodeAccessToken && stored.nodeRefreshToken)) {
    log('[otto:bg] found partial node token state; clearing tokens to recover pairing flow');
    await chromeApi.storage.local.remove(['nodeAccessToken', 'nodeRefreshToken']);
  }

  if (stored.nodeAccessToken && stored.nodeRefreshToken) {
    const healthy = await validateNodeTokens(chromeApi, fetchImpl, base, String(stored.nodeRefreshToken), log);
    if (!healthy) {
      // Fall through into pairing recovery flow.
    } else {
      return;
    }
  }

  const tokenSnapshot = await chromeApi.storage.local.get(['nodeAccessToken', 'nodeRefreshToken']);
  if (tokenSnapshot.nodeAccessToken && tokenSnapshot.nodeRefreshToken) {
    return;
  }

  const pairingChallengeId = typeof stored.pairingChallengeId === 'string' ? stored.pairingChallengeId : undefined;
  const pairingCode = typeof stored.pairingCode === 'string' ? stored.pairingCode : undefined;
  const pairingExpiresAt = typeof stored.pairingExpiresAt === 'number' ? stored.pairingExpiresAt : undefined;

  if (pairingExpiresAt && pairingExpiresAt <= Date.now()) {
    log('[otto:bg] clearing expired local pairing challenge');
    await clearPairingChallenge(chromeApi);
    await requestPairingChallenge(chromeApi, fetchImpl, base, nodeId, log);
    return;
  }

  if (!pairingChallengeId) {
    await requestPairingChallenge(chromeApi, fetchImpl, base, nodeId, log);
    return;
  }

  if (!pairingCode) {
    log('[otto:bg] pairing challenge exists without pairing code; resetting challenge state');
    await clearPairingChallenge(chromeApi);
    await requestPairingChallenge(chromeApi, fetchImpl, base, nodeId, log);
    return;
  }

  let statusResp: Response | undefined;
  for (let attempt = 0; attempt <= STATUS_MAX_RETRIES; attempt += 1) {
    log(`[otto:bg] checking pairing challenge status (attempt ${attempt + 1}/${STATUS_MAX_RETRIES + 1})`);
    statusResp = await fetchImpl(`${base}/api/pairing/status?challengeId=${encodeURIComponent(pairingChallengeId)}`);
    if (statusResp.ok) {
      break;
    }

    if (statusResp.status === 404) {
      log('[otto:bg] relay reported missing pairing challenge; requesting a fresh challenge');
      await clearPairingChallenge(chromeApi);
      await requestPairingChallenge(chromeApi, fetchImpl, base, nodeId, log);
      return;
    }

    if (attempt < STATUS_MAX_RETRIES) {
      await sleep(STATUS_RETRY_BASE_DELAY_MS * (2 ** attempt));
    }
  }

  if (!statusResp?.ok) {
    log('[otto:bg] pairing status check failed repeatedly; resetting challenge state');
    await clearPairingChallenge(chromeApi);
    await requestPairingChallenge(chromeApi, fetchImpl, base, nodeId, log);
    return;
  }

  const status = (await statusResp.json()) as {
    status: 'pending' | 'approved' | 'expired';
    nodeAccessToken?: string;
    nodeRefreshToken?: string;
  };

  if (status.status === 'approved' && status.nodeAccessToken && status.nodeRefreshToken) {
    await chromeApi.storage.local.set({
      nodeAccessToken: status.nodeAccessToken,
      nodeRefreshToken: status.nodeRefreshToken,
    });
    await clearPairingChallenge(chromeApi);
    log('[otto:bg] node pairing approved and tokens stored');
    return;
  }

  if (status.status === 'expired') {
    log('[otto:bg] relay pairing challenge expired; requesting a fresh challenge');
    await clearPairingChallenge(chromeApi);
    await requestPairingChallenge(chromeApi, fetchImpl, base, nodeId, log);
  }
}

export async function reconcileAutomationState(chromeApi: ChromeLike, log: (message: string) => void): Promise<void> {
  const session = await chromeApi.storage.session.get(['automationGroupId', 'tabSessions']);
  const storedTabSessions = (session.tabSessions as Record<string, unknown> | undefined) ?? {};

  const nextTabSessions: TabSessionMap = {};
  const validTabs = new Map<number, chrome.tabs.Tab>();

  for (const [tabSessionId, rawTabId] of Object.entries(storedTabSessions)) {
    if (typeof rawTabId !== 'number' || !Number.isFinite(rawTabId)) continue;
    try {
      const tab = await chromeApi.tabs.get(rawTabId);
      if (tab?.id === undefined) continue;
      nextTabSessions[tabSessionId] = tab.id;
      validTabs.set(tab.id, tab);
    } catch {
      // Drop stale session mappings whose tabs no longer exist.
    }
  }

  const sameSize = Object.keys(storedTabSessions).length === Object.keys(nextTabSessions).length;
  const changed = !sameSize || Object.entries(nextTabSessions).some(([k, v]) => storedTabSessions[k] !== v);
  if (changed) {
    await chromeApi.storage.session.set({ tabSessions: nextTabSessions });
    log('[otto:bg] reconciled stale tab session mappings');
  }

  const validTabIds = Object.values(nextTabSessions);
  if (validTabIds.length === 0) {
    if (typeof session.automationGroupId === 'number') {
      await chromeApi.storage.session.remove(['automationGroupId']);
      log('[otto:bg] cleared stale automation group id (no tracked tabs)');
    }
    return;
  }

  let groupId = typeof session.automationGroupId === 'number' ? session.automationGroupId : undefined;
  if (groupId !== undefined) {
    try {
      await chromeApi.tabGroups.get(groupId);
    } catch {
      groupId = undefined;
    }
  }

  if (groupId === undefined) {
    const groupTabIds: [number, ...number[]] = [validTabIds[0] as number, ...validTabIds.slice(1)];
    const createdGroupId = await chromeApi.tabs.group({ tabIds: groupTabIds }) as unknown as number;
    await chromeApi.tabGroups.update(createdGroupId, {
      title: 'Otto',
      color: 'blue',
      collapsed: true,
    });
    await chromeApi.storage.session.set({ automationGroupId: createdGroupId });
    log('[otto:bg] rebuilt automation tab group after restart');
    return;
  }

  for (const tabId of validTabIds) {
    const tab = validTabs.get(tabId);
    if (tab && tab.groupId !== groupId) {
      await chromeApi.tabs.group({ groupId, tabIds: [tabId] as [number] });
    }
  }
}

export async function bootstrap(chromeApi: ChromeLike, fetchImpl: typeof fetch, log: (message: string) => void): Promise<void> {
  log('[otto:bg] bootstrap runtime start');
  await ensureNodeId(chromeApi);
  await ensurePairingState(chromeApi, fetchImpl, log);
  await reconcileAutomationState(chromeApi, log);
  await ensureOffscreenDocument(chromeApi);
  chromeApi.alarms.create('otto-keepwarm', { periodInMinutes: DEFAULT_HEARTBEAT_MINUTES });
  log('[otto:bg] bootstrap runtime complete');
}
