import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveRelayEntrypoint,
  createRelayLaunchSpec,
} from '../src/relay-daemon.js';

test('resolveRelayEntrypoint returns override env when set', () => {
  const result = resolveRelayEntrypoint({
    env: { OTTO_RELAY_ENTRYPOINT: '/custom/relay.js' },
  });
  assert.equal(result, '/custom/relay.js');
});

test('resolveRelayEntrypoint resolves candidate module', () => {
  const result = resolveRelayEntrypoint({
    resolveModulePath: (specifier) => `/resolved/${specifier}`,
  });
  assert.equal(result, '/resolved/@telepat/otto-relay/dist/index.js');
});

test('resolveRelayEntrypoint throws when unable to resolve', () => {
  assert.throws(() => resolveRelayEntrypoint({
    resolveModulePath: () => { throw new Error('not found'); },
  }), /Unable to resolve relay runtime entrypoint/);
});

test('createRelayLaunchSpec returns correct spec', () => {
  const spec = createRelayLaunchSpec(8787, {
    env: { PATH: '/usr/bin' },
    resolveModulePath: (specifier) => `/resolved/${specifier}`,
  });
  assert.equal(spec.command, process.execPath);
  assert.deepEqual(spec.args, ['/resolved/@telepat/otto-relay/dist/index.js']);
  assert.equal(spec.env.OTTO_RELAY_PORT, '8787');
  assert.equal(spec.env.PATH, '/usr/bin');
});


