export type CleanupSocketStrategy = 'reuse' | 'reconnect';

export type ResolveCleanupSocketStrategyInput = {
  socketReadyState: number;
  socketOpenState: number;
  hasOriginalError: boolean;
};

export function resolveCleanupSocketStrategy(input: ResolveCleanupSocketStrategyInput): CleanupSocketStrategy {
  // Even when the primary test flow fails, attempt tab close cleanup by reconnecting.
  if (input.socketReadyState === input.socketOpenState) {
    return 'reuse';
  }
  return 'reconnect';
}
