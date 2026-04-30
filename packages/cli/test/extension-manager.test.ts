import assert from 'node:assert/strict';
import test from 'node:test';
import { parseChecksum } from '../src/extension-manager.js';

test('parseChecksum extracts hex from text', () => {
  const hex = 'a'.repeat(64);
  assert.equal(parseChecksum(`  ${hex}  `), hex);
});

test('parseChecksum throws for empty input', () => {
  assert.throws(() => parseChecksum(''), /Checksum file is empty/);
  assert.throws(() => parseChecksum('   '), /Checksum file is empty/);
});

test('parseChecksum throws for invalid input', () => {
  assert.throws(() => parseChecksum('not-a-hex'), /does not contain a valid sha256 value/);
});

test('parseChecksum lowercases result', () => {
  const hex = 'a'.repeat(64);
  assert.equal(parseChecksum('  ' + hex.toUpperCase() + '  '), hex);
});
