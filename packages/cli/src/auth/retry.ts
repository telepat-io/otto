type RelayAuthErrorPayloadLike = {
  category?: string;
  code?: string;
  message?: string;
};

const RETRYABLE_AUTH_CODES = new Set([
  'invalid_access_token',
  'token_expired',
]);

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? '');
}

function hasRetryableAuthCodeInMessage(message: string): boolean {
  if (!message) {
    return false;
  }

  return (
    message.includes('"code":"invalid_access_token"')
    || message.includes('"code":"token_expired"')
  );
}

export function shouldAttemptAccessTokenRefreshOnAuthError(
  error: unknown,
  payload?: RelayAuthErrorPayloadLike,
): boolean {
  if (payload && payload.category === 'auth' && typeof payload.code === 'string') {
    return RETRYABLE_AUTH_CODES.has(payload.code);
  }

  return hasRetryableAuthCodeInMessage(readErrorMessage(error));
}
