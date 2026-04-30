import assert from 'node:assert/strict';
import test from 'node:test';
import {
  logJsonAware,
  resolveControllerRegistrationMetadata,
  parseJsonObject,
  isJsonOutput,
  parseMaybeNumber,
  parsePositiveNumberOption,
  parseNetworkMode,
  collectString,
  normalizeControllerName,
  normalizeControllerDescription,
  showAclMissingGrantHint,
} from '../src/cli/input-utils-pure.js';

test('logJsonAware stringifies objects in non-json mode', () => {
  const originalLog = console.log;
  let output = '';
  console.log = (...args: unknown[]) => { output = args.join(' '); };

  logJsonAware({ outputFormat: 'pretty' } as unknown as import('../src/config.js').OttoConfig, { a: 1 });
  assert.equal(output, JSON.stringify({ a: 1 }, null, 2));

  console.log = originalLog;
});

test('logJsonAware logs plain string directly in non-json mode', () => {
  const originalLog = console.log;
  let output = '';
  console.log = (...args: unknown[]) => { output = args.join(' '); };

  logJsonAware({ outputFormat: 'pretty' } as unknown as import('../src/config.js').OttoConfig, 'hello');
  assert.equal(output, 'hello');

  console.log = originalLog;
});

test('logJsonAware logs json in json mode', () => {
  const originalLog = console.log;
  let output = '';
  console.log = (...args: unknown[]) => { output = args.join(' '); };

  logJsonAware({ outputFormat: 'json' } as unknown as import('../src/config.js').OttoConfig, { a: 1 });
  assert.equal(output, JSON.stringify({ a: 1 }, null, 2));

  console.log = originalLog;
});

test('resolveControllerRegistrationMetadata returns flags when both provided', async () => {
  const result = await resolveControllerRegistrationMetadata(
    { name: 'Test', description: 'Desc' },
    {},
    { promptIfMissing: false },
  );
  assert.equal(result.name, 'Test');
  assert.equal(result.description, 'Desc');
});

test('resolveControllerRegistrationMetadata throws in non-interactive mode', async () => {
  await assert.rejects(
    resolveControllerRegistrationMetadata({ name: 'Test' }, {}, { promptIfMissing: false }),
    /Non-interactive registration requires/,
  );
});

test('resolveControllerRegistrationMetadata uses defaults', async () => {
  const result = await resolveControllerRegistrationMetadata(
    {},
    { name: 'Default', description: 'Default Desc' },
    { promptIfMissing: false },
  );
  assert.equal(result.name, 'Default');
  assert.equal(result.description, 'Default Desc');
});

test('resolveControllerRegistrationMetadata includes avatarSeed', async () => {
  const result = await resolveControllerRegistrationMetadata(
    { name: 'Test', description: 'Desc', avatarSeed: 'seed-123' },
    {},
    { promptIfMissing: false },
  );
  assert.equal(result.avatarSeed, 'seed-123');
});

test('parseJsonObject returns object', () => {
  assert.deepEqual(parseJsonObject('{"a":1}', 'payload'), { a: 1 });
});

test('parseJsonObject throws for non-object', () => {
  assert.throws(() => parseJsonObject('"string"', 'payload'), /must be a JSON object/);
});

test('parseJsonObject throws for array', () => {
  assert.throws(() => parseJsonObject('[1]', 'payload'), /must be a JSON object/);
});

test('parseJsonObject throws for null', () => {
  assert.throws(() => parseJsonObject('null', 'payload'), /must be a JSON object/);
});

test('isJsonOutput returns true for json', () => {
  assert.equal(isJsonOutput({ outputFormat: 'json' } as import('../src/config.js').OttoConfig), true);
});

test('isJsonOutput returns false for pretty', () => {
  assert.equal(isJsonOutput({ outputFormat: 'pretty' } as import('../src/config.js').OttoConfig), false);
});

test('parseMaybeNumber returns fallback for undefined', () => {
  assert.equal(parseMaybeNumber(undefined, 10), 10);
});

test('parseMaybeNumber returns fallback for null', () => {
  assert.equal(parseMaybeNumber(null, 10), 10);
});

test('parseMaybeNumber returns fallback for empty string', () => {
  assert.equal(parseMaybeNumber('', 10), 10);
});

test('parseMaybeNumber returns parsed number', () => {
  assert.equal(parseMaybeNumber('5', 10), 5);
});

test('parseMaybeNumber throws for non-finite', () => {
  assert.throws(() => parseMaybeNumber('abc', 10), /positive number/);
});

test('parseMaybeNumber throws for non-positive', () => {
  assert.throws(() => parseMaybeNumber('-1', 10), /positive number/);
});

test('parsePositiveNumberOption returns number', () => {
  assert.equal(parsePositiveNumberOption('42', 'opt'), 42);
});

test('parsePositiveNumberOption throws for non-finite', () => {
  assert.throws(() => parsePositiveNumberOption('abc', 'opt'), /opt must be a positive number/);
});

test('parsePositiveNumberOption throws for non-positive', () => {
  assert.throws(() => parsePositiveNumberOption('0', 'opt'), /opt must be a positive number/);
});

test('parseNetworkMode defaults to network', () => {
  assert.equal(parseNetworkMode(undefined), 'network');
});

test('parseNetworkMode returns valid mode', () => {
  assert.equal(parseNetworkMode('fetch'), 'fetch');
});

test('parseNetworkMode throws for invalid', () => {
  assert.throws(() => parseNetworkMode('invalid'), /must be one of/);
});

test('collectString appends value', () => {
  assert.deepEqual(collectString('b', ['a']), ['a', 'b']);
});

test('normalizeControllerName trims and collapses whitespace', () => {
  assert.equal(normalizeControllerName('  hello   world  '), 'hello world');
});

test('normalizeControllerName truncates to 120', () => {
  const long = 'a'.repeat(200);
  assert.equal(normalizeControllerName(long).length, 120);
});

test('normalizeControllerDescription trims', () => {
  assert.equal(normalizeControllerDescription('  desc  '), 'desc');
});

test('normalizeControllerDescription truncates to 500', () => {
  const long = 'a'.repeat(600);
  assert.equal(normalizeControllerDescription(long).length, 500);
});

test('showAclMissingGrantHint logs for acl_missing_node_grant', () => {
  const originalError = console.error;
  let output = '';
  console.error = (...args: unknown[]) => { output += args.join(' ') + '\n'; };

  showAclMissingGrantHint({ code: 'acl_missing_node_grant', nodeId: 'node-1', clientId: 'client-1' });
  assert.ok(output.includes('not granted'));
  assert.ok(output.includes('node-1'));

  console.error = originalError;
});

test('showAclMissingGrantHint logs for forbidden_node_access', () => {
  const originalError = console.error;
  let output = '';
  console.error = (...args: unknown[]) => { output += args.join(' ') + '\n'; };

  showAclMissingGrantHint({ code: 'forbidden_node_access' });
  assert.ok(output.includes('not granted'));

  console.error = originalError;
});

test('showAclMissingGrantHint does nothing for other codes', () => {
  const originalError = console.error;
  let called = false;
  console.error = () => { called = true; };

  showAclMissingGrantHint({ code: 'other' });
  assert.equal(called, false);

  console.error = originalError;
});

test('resolveControllerRegistrationMetadata returns flags when name and description provided with promptIfMissing true', async () => {
  const result = await resolveControllerRegistrationMetadata(
    { name: 'Test', description: 'Desc' },
    {},
    { promptIfMissing: true },
  );
  assert.equal(result.name, 'Test');
  assert.equal(result.description, 'Desc');
});

test('resolveControllerRegistrationMetadata returns flags with avatarSeed trimmed and sliced', async () => {
  const result = await resolveControllerRegistrationMetadata(
    { name: 'Test', description: 'Desc', avatarSeed: '   abcdef   ' },
    {},
    { promptIfMissing: false },
  );
  assert.equal(result.avatarSeed, 'abcdef');
});

test('resolveControllerRegistrationMetadata returns undefined avatarSeed for empty string', async () => {
  const result = await resolveControllerRegistrationMetadata(
    { name: 'Test', description: 'Desc', avatarSeed: '' },
    {},
    { promptIfMissing: false },
  );
  assert.equal(result.avatarSeed, undefined);
});

test('resolveControllerRegistrationMetadata returns undefined avatarSeed for whitespace', async () => {
  const result = await resolveControllerRegistrationMetadata(
    { name: 'Test', description: 'Desc', avatarSeed: '   ' },
    {},
    { promptIfMissing: false },
  );
  assert.equal(result.avatarSeed, undefined);
});

test('resolveControllerRegistrationMetadata truncates long avatarSeed', async () => {
  const result = await resolveControllerRegistrationMetadata(
    { name: 'Test', description: 'Desc', avatarSeed: 'a'.repeat(100) },
    {},
    { promptIfMissing: false },
  );
  assert.equal(result.avatarSeed!.length, 64);
});

test('resolveControllerRegistrationMetadata uses description only from defaults when name missing', async () => {
  const result = await resolveControllerRegistrationMetadata(
    { description: 'My Desc' },
    { name: 'DefaultName' },
    { promptIfMissing: false },
  );
  assert.equal(result.name, 'DefaultName');
  assert.equal(result.description, 'My Desc');
});

test('logJsonAware stringifies non-string values in non-json mode', () => {
  const originalLog = console.log;
  let output = '';
  console.log = (...args: unknown[]) => { output = args.join(' '); };

  logJsonAware({ outputFormat: 'pretty' } as unknown as import('../src/config.js').OttoConfig, 42);
  assert.equal(output, JSON.stringify(42, null, 2));

  console.log = originalLog;
});

test('showAclMissingGrantHint logs with custom actionableHint', () => {
  const originalError = console.error;
  const messages: string[] = [];
  console.error = (...args: unknown[]) => { messages.push(args.join(' ')); };

  showAclMissingGrantHint({ code: 'acl_missing_node_grant', actionableHint: 'Click here to approve' });
  assert.ok(messages.some(m => m.includes('Click here to approve')));

  console.error = originalError;
});

test('showAclMissingGrantHint logs without nodeId and clientId', () => {
  const originalError = console.error;
  const messages: string[] = [];
  console.error = (...args: unknown[]) => { messages.push(args.join(' ')); };

  showAclMissingGrantHint({ code: 'acl_missing_node_grant' });
  assert.ok(messages.some(m => m.includes('not granted')));

  console.error = originalError;
});

test('resolveControllerRegistrationMetadata throws when only name provided in non-interactive mode', async () => {
  await assert.rejects(
    resolveControllerRegistrationMetadata({ description: 'Only desc' }, {}, { promptIfMissing: false }),
    /Non-interactive registration requires/,
  );
});

test('resolveControllerRegistrationMetadata with number avatarSeed returns undefined', async () => {
  const result = await resolveControllerRegistrationMetadata(
    { name: 'Test', description: 'Desc', avatarSeed: 123 as unknown as string },
    {},
    { promptIfMissing: false },
  );
  assert.equal(result.avatarSeed, undefined);
});
