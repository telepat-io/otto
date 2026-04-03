export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = 'relay' | 'controller' | 'node' | 'all';

export function parseLogLevelOption(value?: string): LogLevel | undefined {
  if (!value) return undefined;
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') {
    return value;
  }
  throw new Error('--level must be one of debug|info|warn|error');
}

export function parseLogSourceOption(value?: string): LogSource | undefined {
  if (!value) return undefined;
  if (value === 'relay' || value === 'controller' || value === 'node' || value === 'all') {
    return value;
  }
  throw new Error('--source must be one of relay|controller|node|all');
}

export function parseLatestOption(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('--latest must be a positive integer');
  }
  return parsed;
}
