export const DEFAULT_NODE_RELAY_URL = 'ws://127.0.0.1:8787?role=node';

export type RelayConnectionStatus =
  | 'idle'
  | 'waiting_for_pairing'
  | 'connecting'
  | 'authenticated_connected'
  | 'disconnected'
  | 'error';

export type OnboardingState =
  | 'needs_relay_url'
  | 'requesting_pairing_code'
  | 'waiting_for_pair_approval'
  | 'authenticated_connecting'
  | 'authenticated_connected'
  | 'error';

export type OnboardingStorageSnapshot = {
  relayUrl?: string;
  localDevLogStreamingEnabled?: boolean;
  nodeId?: string;
  pairingCode?: string;
  nodeAccessToken?: string;
  relayConnectionStatus?: RelayConnectionStatus;
  relayConnectionError?: string;
};

export type OnboardingViewModel = {
  state: OnboardingState;
  stateLabel: string;
  detail: string;
  nodeId: string;
  relayUrl: string;
  pairingCode?: string;
  badgeText: string;
  badgeColor: string;
};

function sanitizeRelayUrl(relayUrl?: string): string {
  return relayUrl?.trim() || '';
}

export function deriveOnboardingState(snapshot: OnboardingStorageSnapshot): OnboardingViewModel {
  const relayUrl = sanitizeRelayUrl(snapshot.relayUrl);
  const nodeId = snapshot.nodeId?.trim() || 'not-generated-yet';
  const relayConnectionStatus = snapshot.relayConnectionStatus ?? 'idle';
  const relayConnectionError = snapshot.relayConnectionError?.trim();

  if (!relayUrl) {
    return {
      state: 'needs_relay_url',
      stateLabel: 'Relay URL required',
      detail: 'Set the node relay URL to begin pairing and relay connectivity.',
      nodeId,
      relayUrl: DEFAULT_NODE_RELAY_URL,
      badgeText: 'SET',
      badgeColor: '#4b5563',
    };
  }

  if (relayConnectionStatus === 'error' || relayConnectionError) {
    return {
      state: 'error',
      stateLabel: 'Connection error',
      detail: relayConnectionError || 'Unable to reach relay. Verify URL and relay daemon status.',
      nodeId,
      relayUrl,
      pairingCode: snapshot.pairingCode,
      badgeText: 'ERR',
      badgeColor: '#b42318',
    };
  }

  if (snapshot.nodeAccessToken) {
    if (relayConnectionStatus === 'authenticated_connected') {
      return {
        state: 'authenticated_connected',
        stateLabel: 'Connected',
        detail: 'Node is authenticated and connected to relay.',
        nodeId,
        relayUrl,
        badgeText: 'OK',
        badgeColor: '#0f766e',
      };
    }

    return {
      state: 'authenticated_connecting',
      stateLabel: 'Authenticating',
      detail: 'Node token is available. Waiting for active relay socket. Auto-refreshing every 4s.',
      nodeId,
      relayUrl,
      badgeText: 'AUTH',
      badgeColor: '#1d4ed8',
    };
  }

  if (snapshot.pairingCode) {
    return {
      state: 'waiting_for_pair_approval',
      stateLabel: 'Pairing approval required',
      detail: 'Approve this node from CLI using the command below. Auto-refreshing every 4s.',
      nodeId,
      relayUrl,
      pairingCode: snapshot.pairingCode,
      badgeText: 'PAIR',
      badgeColor: '#b45309',
    };
  }

  return {
    state: 'requesting_pairing_code',
    stateLabel: 'Requesting pairing code',
    detail: 'Background runtime is requesting a fresh pairing code from relay. Auto-refreshing every 4s.',
    nodeId,
    relayUrl,
    badgeText: 'PAIR',
    badgeColor: '#92400e',
  };
}
