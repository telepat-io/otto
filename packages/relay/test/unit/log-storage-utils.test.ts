import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogStorage } from '../../src/log-storage-utils.js';

test('createLogStorage listOperationLogFiles returns empty for missing dir', () => {
  const storage = createLogStorage({
    logDir: '/nonexistent/path',
    legacyFileName: 'operations.jsonl',
    windowPrefix: 'operations-',
    windowSuffix: '.jsonl',
    maxFileBytes: 1024,
  });

  assert.deepEqual(storage.listOperationLogFiles(), []);
});

test('createLogStorage listOperationLogFiles filters and sorts files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'otto-log-test-'));
  writeFileSync(join(dir, 'operations-2024-01-01.jsonl'), 'a');
  writeFileSync(join(dir, 'operations-2024-01-02.jsonl'), 'b');
  writeFileSync(join(dir, 'operations.jsonl'), 'c');
  writeFileSync(join(dir, 'other.txt'), 'd');

  try {
    const storage = createLogStorage({
      logDir: dir,
      legacyFileName: 'operations.jsonl',
      windowPrefix: 'operations-',
      windowSuffix: '.jsonl',
      maxFileBytes: 1024,
    });

    const files = storage.listOperationLogFiles();
    assert.equal(files.length, 3);
    assert.ok(files[0].includes('operations.jsonl') || files[0].includes('2024-01-01'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createLogStorage parseTimestampMs returns null for invalid timestamp', () => {
  const storage = createLogStorage({
    logDir: '/tmp',
    legacyFileName: 'operations.jsonl',
    windowPrefix: 'operations-',
    windowSuffix: '.jsonl',
    maxFileBytes: 1024,
  });

  assert.equal(storage.parseTimestampMs('invalid'), null);
  assert.equal(storage.parseTimestampMs('2024-01-01T00:00:00.000Z'), Date.parse('2024-01-01T00:00:00.000Z'));
});

test('createLogStorage resolveWriteLogFilePath rotates on spillover', () => {
  const dir = mkdtempSync(join(tmpdir(), 'otto-log-spill-'));

  try {
    const storage = createLogStorage({
      logDir: dir,
      legacyFileName: 'operations.jsonl',
      windowPrefix: 'operations-',
      windowSuffix: '.jsonl',
      maxFileBytes: 10,
    });

    const path1 = storage.resolveWriteLogFilePath('line1\n');
    writeFileSync(path1, 'line1\n');

    const path2 = storage.resolveWriteLogFilePath('line2-is-longer\n');
    assert.notEqual(path1, path2);
    assert.ok(path2.includes('-1'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createLogStorage cleanupLogFiles removes old files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'otto-log-cleanup-'));
  const oldFile = join(dir, 'operations-2020-01-01.jsonl');
  writeFileSync(oldFile, 'old');

  try {
    const storage = createLogStorage({
      logDir: dir,
      legacyFileName: 'operations.jsonl',
      windowPrefix: 'operations-',
      windowSuffix: '.jsonl',
      maxFileBytes: 1024,
    });

    storage.cleanupLogFiles(Date.now() + 1000);
    assert.equal(existsSync(oldFile), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createLogStorage totalLogBytes sums file sizes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'otto-log-total-'));
  writeFileSync(join(dir, 'operations-2024-01-01.jsonl'), 'abc');

  try {
    const storage = createLogStorage({
      logDir: dir,
      legacyFileName: 'operations.jsonl',
      windowPrefix: 'operations-',
      windowSuffix: '.jsonl',
      maxFileBytes: 1024,
    });

    assert.equal(storage.totalLogBytes(), 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
