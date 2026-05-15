export const DEFAULT_NODE_RELAY_URL = 'ws://127.0.0.1:8787';

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
  | 'authenticated_disconnected'
  | 'authenticated_connecting'
  | 'authenticated_connected'
  | 'version_mismatch'
  | 'error';

export type OnboardingStorageSnapshot = {
  relayUrl?: string;
  localDevLogStreamingEnabled?: boolean;
  nodeId?: string;
  pairingCode?: string;
  nodeAccessToken?: string;
  relayConnectionStatus?: RelayConnectionStatus;
  relayConnectionError?: string;
  relayVersion?: string;
  extensionVersion?: string;
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
  const relayVersion = snapshot.relayVersion?.trim();
  const extensionVersion = snapshot.extensionVersion?.trim();

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
      if (relayVersion && extensionVersion && relayVersion !== extensionVersion) {
        const relayIsOlder = relayVersion.localeCompare(extensionVersion, undefined, { numeric: true, sensitivity: 'base' }) < 0;
        const stateLabel = relayIsOlder ? 'Relay update required' : 'Extension update required';
        const detail = relayIsOlder
          ? `Version mismatch: extension v${extensionVersion} and relay v${relayVersion}. Action required: run "npm i -g @telepat/otto" in terminal to update the relay daemon.`
          : `Version mismatch: extension v${extensionVersion} and relay v${relayVersion}. Action required: run "otto extension update" in terminal, then reload Otto in chrome://extensions or restart your browser.`;
        return {
          state: 'version_mismatch',
          stateLabel,
          detail,
          nodeId,
          relayUrl,
          badgeText: 'UPDT',
          badgeColor: '#b45309',
        };
      }

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

    if (relayConnectionStatus === 'connecting') {
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

    return {
      state: 'authenticated_disconnected',
      stateLabel: 'Ready to connect',
      detail: 'Node token is available. Click Connect to open relay socket.',
      nodeId,
      relayUrl,
      badgeText: 'SET',
      badgeColor: '#4b5563',
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
