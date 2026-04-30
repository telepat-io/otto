import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseJsonObject,
  isJsonOutput,
  logJsonAware,
  parseMaybeNumber,
  parsePositiveNumberOption,
  parseNetworkMode,
  collectString,
  normalizeControllerName,
  normalizeControllerDescription,
  showAclMissingGrantHint,
} from '../src/cli/input-utils-pure.js';

test('parseJsonObject returns object for valid JSON', () => {
  assert.deepEqual(parseJsonObject('{"a":1}', 'payload'), { a: 1 });
});

test('parseJsonObject throws for non-object JSON', () => {
  assert.throws(() => parseJsonObject('[1,2]', 'payload'), /must be a JSON object/);
  assert.throws(() => parseJsonObject('"string"', 'payload'), /must be a JSON object/);
  assert.throws(() => parseJsonObject('null', 'payload'), /must be a JSON object/);
});

test('isJsonOutput returns true when config format is json', () => {
  assert.equal(isJsonOutput({ outputFormat: 'json' } as unknown as import('../src/config.js').OttoConfig), true);
  assert.equal(isJsonOutput({ outputFormat: 'text' } as unknown as import('../src/config.js').OttoConfig), false);
});

test('logJsonAware logs JSON when config is json', () => {
  const originalLog = console.log;
  let output = '';
  console.log = (...args: unknown[]) => { output = args.join(' '); };

  logJsonAware({ outputFormat: 'json' } as unknown as import('../src/config.js').OttoConfig, { a: 1 });
  assert.equal(output, JSON.stringify({ a: 1 }, null, 2));

  logJsonAware({ outputFormat: 'json' } as unknown as import('../src/config.js').OttoConfig, 'plain');
  assert.equal(output, '"plain"');

  console.log = originalLog;
});

test('parseMaybeNumber returns fallback for undefined/null/empty', () => {
  assert.equal(parseMaybeNumber(undefined, 42), 42);
  assert.equal(parseMaybeNumber(null, 42), 42);
  assert.equal(parseMaybeNumber('', 42), 42);
});

test('parseMaybeNumber returns parsed positive number', () => {
  assert.equal(parseMaybeNumber('10', 42), 10);
});

test('parseMaybeNumber throws for non-positive', () => {
  assert.throws(() => parseMaybeNumber('0', 42), /positive number/);
  assert.throws(() => parseMaybeNumber('abc', 42), /positive number/);
  assert.throws(() => parseMaybeNumber('-5', 42), /positive number/);
});

test('parsePositiveNumberOption validates positive number', () => {
  assert.equal(parsePositiveNumberOption('5', 'count'), 5);
  assert.throws(() => parsePositiveNumberOption('0', 'count'), /positive number/);
  assert.throws(() => parsePositiveNumberOption('NaN', 'count'), /positive number/);
});

test('parseNetworkMode validates mode', () => {
  assert.equal(parseNetworkMode('network'), 'network');
  assert.equal(parseNetworkMode('fetch'), 'fetch');
  assert.equal(parseNetworkMode('hybrid'), 'hybrid');
  assert.equal(parseNetworkMode(undefined), 'network');
  assert.throws(() => parseNetworkMode('invalid'), /network|fetch|hybrid/);
});

test('collectString accumulates strings', () => {
  assert.deepEqual(collectString('a', []), ['a']);
  assert.deepEqual(collectString('b', ['a']), ['a', 'b']);
});

test('normalizeControllerName trims and limits length', () => {
  assert.equal(normalizeControllerName('  hello  world  '), 'hello world');
  assert.equal(normalizeControllerName('a'.repeat(200)).length, 120);
});

test('normalizeControllerDescription trims and limits length', () => {
  assert.equal(normalizeControllerDescription('  desc  '), 'desc');
  assert.equal(normalizeControllerDescription('a'.repeat(600)).length, 500);
});

test('showAclMissingGrantHint logs hint for acl errors', () => {
  const originalError = console.error;
  let outputs: string[] = [];
  console.error = (...args: unknown[]) => { outputs.push(args.join(' ')); };

  showAclMissingGrantHint({ code: 'acl_missing_node_grant', nodeId: 'n1', clientId: 'c1', actionableHint: 'do this' });
  assert.ok(outputs.some((o) => o.includes('do this')));

  outputs = [];
  showAclMissingGrantHint({ code: 'other_error' });
  assert.equal(outputs.length, 0);

  console.error = originalError;
});


