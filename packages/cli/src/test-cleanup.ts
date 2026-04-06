export type CleanupSocketStrategy = 'reuse' | 'reconnect' | 'skip';

export type ResolveCleanupSocketStrategyInput = {
  socketReadyState: number;
  socketOpenState: number;
  hasOriginalError: boolean;
};

export function resolveCleanupSocketStrategy(input: ResolveCleanupSocketStrategyInput): CleanupSocketStrategy {
  if (input.socketReadyState === input.socketOpenState) {
    return 'reuse';
  }

  if (input.hasOriginalError) {
    return 'skip';
  }

  return 'reconnect';
}
