export type SocketCloseAlertPayload = {
  message: string;
  code: 'socket_closed';
  action?: string;
};

type SocketCloseError = Error & {
  code?: string;
  action?: string;
};

const LEGACY_SOCKET_CLOSE_PREFIX = 'Socket closed while waiting for ';

function extractActionFromLegacySocketCloseMessage(message: string): string | undefined {
  if (!message.startsWith(LEGACY_SOCKET_CLOSE_PREFIX) || !message.endsWith(' response')) {
    return undefined;
  }

  return message.slice(LEGACY_SOCKET_CLOSE_PREFIX.length, -' response'.length).trim() || undefined;
}

export function buildSocketCloseReasonSummary(action?: string): string {
  const actionSummary = action && action.trim().length > 0
    ? ` while waiting for ${action} response`
    : '';

  return `Controller connection closed${actionSummary}. The relay, network, or extension node may have disconnected. Verify relay health with otto status and retry after extension reconnection.`;
}

export function createSocketClosedWhileWaitingError(action?: string): Error {
  const message = buildSocketCloseReasonSummary(action);
  const error = new Error(message) as SocketCloseError;
  error.name = 'SocketClosedBeforeResponseError';
  error.code = 'socket_closed';
  if (action && action.trim().length > 0) {
    error.action = action;
  }
  return error;
}

export function toSocketCloseAlertPayload(error: unknown): SocketCloseAlertPayload | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const withMeta = error as SocketCloseError;
  if (withMeta.code === 'socket_closed') {
    return {
      code: 'socket_closed',
      action: withMeta.action,
      message: error.message,
    };
  }

  const action = extractActionFromLegacySocketCloseMessage(error.message);
  if (!action) {
    return undefined;
  }

  return {
    code: 'socket_closed',
    action,
    message: buildSocketCloseReasonSummary(action),
  };
}

export function isSocketClosedWhileWaitingError(error: unknown): boolean {
  return toSocketCloseAlertPayload(error) !== undefined;
}
