import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deriveHttpUrl, loadConfig, saveConfig, DEFAULT_CONTROLLER_RELAY_URL } from '../src/config.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'otto-config-'));

function cleanup() {
  rmSync(tmpDir, { recursive: true, force: true });
}

process.on('exit', cleanup);

test('deriveHttpUrl converts ws to http', () => {
  assert.equal(deriveHttpUrl('ws://localhost:8787?role=controller'), 'http://localhost:8787');
});

test('deriveHttpUrl converts wss to https', () => {
  assert.equal(deriveHttpUrl('wss://relay.example.com/?role=controller'), 'https://relay.example.com');
});

test('deriveHttpUrl removes trailing slash', () => {
  assert.equal(deriveHttpUrl('ws://localhost:8787/'), 'http://localhost:8787');
});

test('loadConfig returns default when file missing', () => {
  const configPath = join(tmpDir, 'missing.json');
  const result = loadConfig(configPath);
  assert.deepEqual(result, { relayUrl: DEFAULT_CONTROLLER_RELAY_URL });
});

test('loadConfig returns parsed config when file exists', () => {
  const configPath = join(tmpDir, 'exists.json');
  writeFileSync(configPath, JSON.stringify({ relayUrl: 'ws://custom:9999' }));
  const result = loadConfig(configPath);
  assert.deepEqual(result, { relayUrl: 'ws://custom:9999' });
});

test('loadConfig returns default for invalid json (null)', () => {
  const configPath = join(tmpDir, 'null.json');
  writeFileSync(configPath, 'null');
  const result = loadConfig(configPath);
  assert.deepEqual(result, { relayUrl: DEFAULT_CONTROLLER_RELAY_URL });
});

test('loadConfig returns default for invalid json (array)', () => {
  const configPath = join(tmpDir, 'array.json');
  writeFileSync(configPath, '[1]');
  const result = loadConfig(configPath);
  assert.deepEqual(result, { relayUrl: DEFAULT_CONTROLLER_RELAY_URL });
});

test('loadConfig falls back relayUrl to default', () => {
  const configPath = join(tmpDir, 'fallback.json');
  writeFileSync(configPath, JSON.stringify({ outputFormat: 'json' }));
  const result = loadConfig(configPath);
  assert.deepEqual(result, { relayUrl: DEFAULT_CONTROLLER_RELAY_URL, outputFormat: 'json' });
});

test('saveConfig creates directory if missing', () => {
  const configDir = join(tmpDir, 'nested', 'dir');
  const configPath = join(configDir, 'config.json');
  const config = { relayUrl: 'ws://example.com' };
  saveConfig(config, configPath, configDir);
  assert.equal(existsSync(configPath), true);
  assert.deepEqual(loadConfig(configPath), config);
});
