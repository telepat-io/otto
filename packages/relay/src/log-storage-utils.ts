import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

type CreateLogStorageParams = {
  logDir: string;
  legacyFileName: string;
  windowPrefix: string;
  windowSuffix: string;
  maxFileBytes: number;
};

function logWindowDateKey(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function logWindowFileName(windowPrefix: string, windowSuffix: string, dateKey: string, spill: number): string {
  return spill <= 0
    ? `${windowPrefix}${dateKey}${windowSuffix}`
    : `${windowPrefix}${dateKey}-${spill}${windowSuffix}`;
}

function isWindowedLogFileName(fileName: string): boolean {
  return /^operations-\d{4}-\d{2}-\d{2}(?:-\d+)?\.jsonl$/.test(fileName);
}

export function createLogStorage(params: CreateLogStorageParams) {
  let activeLogWindowDate = '';
  let activeLogWindowSpill = 0;

  const isOperationLogFileName = (fileName: string): boolean => {
    return fileName === params.legacyFileName || isWindowedLogFileName(fileName);
  };

  const listOperationLogFiles = (): string[] => {
    if (!existsSync(params.logDir)) {
      return [];
    }

    const names = readdirSync(params.logDir).filter(isOperationLogFileName);
    return names
      .map((name) => ({ name, path: join(params.logDir, name), mtimeMs: statSync(join(params.logDir, name)).mtimeMs }))
      .sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name))
      .map((item) => item.path);
  };

  const parseTimestampMs = (timestamp: string): number | null => {
    const parsed = Date.parse(timestamp);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const resolveWriteLogFilePath = (eventLine: string): string => {
    const now = new Date();
    const dateKey = logWindowDateKey(now);
    if (activeLogWindowDate !== dateKey) {
      activeLogWindowDate = dateKey;
      activeLogWindowSpill = 0;
    }

    const nextBytes = Buffer.byteLength(eventLine, 'utf8');
    while (true) {
      const filePath = join(
        params.logDir,
        logWindowFileName(params.windowPrefix, params.windowSuffix, activeLogWindowDate, activeLogWindowSpill),
      );
      const currentSize = existsSync(filePath) ? statSync(filePath).size : 0;
      if (currentSize === 0 || currentSize + nextBytes <= params.maxFileBytes) {
        return filePath;
      }
      activeLogWindowSpill += 1;
    }
  };

  const cleanupLogFiles = (cutoffMs: number): void => {
    for (const filePath of listOperationLogFiles()) {
      try {
        const stats = statSync(filePath);
        if (stats.mtimeMs < cutoffMs) {
          unlinkSync(filePath);
        }
      } catch {
        // Ignore races where another process rotates/deletes between stat and unlink.
      }
    }
  };

  const totalLogBytes = (): number => {
    return listOperationLogFiles().reduce((total, filePath) => {
      try {
        return total + statSync(filePath).size;
      } catch {
        return total;
      }
    }, 0);
  };

  return {
    cleanupLogFiles,
    listOperationLogFiles,
    parseTimestampMs,
    resolveWriteLogFilePath,
    totalLogBytes,
  };
}