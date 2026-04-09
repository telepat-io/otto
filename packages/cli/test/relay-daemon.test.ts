import assert from 'node:assert/strict';
import test from 'node:test';
import { createRelayLaunchSpec, resolveRelayEntrypoint } from '../src/relay-daemon.js';

test('resolveRelayEntrypoint prefers explicit environment override', () => {
  const entrypoint = resolveRelayEntrypoint({
    env: {
      OTTO_RELAY_ENTRYPOINT: '/tmp/custom-relay/index.js',
    },
    resolveModulePath: () => {
      throw new Error('should not resolve module when override exists');
    },
  });

  assert.equal(entrypoint, '/tmp/custom-relay/index.js');
});

test('resolveRelayEntrypoint resolves relay package dist entrypoint', () => {
  const resolved = resolveRelayEntrypoint({
    env: {},
    resolveModulePath: (specifier) => {
      assert.equal(specifier, '@telepat/otto-relay/dist/index.js');
      return '/Users/user/.npm-global/lib/node_modules/@telepat/otto-relay/dist/index.js';
    },
  });

  assert.equal(resolved, '/Users/user/.npm-global/lib/node_modules/@telepat/otto-relay/dist/index.js');
});

test('resolveRelayEntrypoint throws actionable error when package entrypoint cannot be resolved', () => {
  assert.throws(
    () =>
      resolveRelayEntrypoint({
        env: {},
        resolveModulePath: () => {
          throw new Error('not found');
        },
      }),
    /Unable to resolve relay runtime entrypoint/i,
  );
});

test('createRelayLaunchSpec starts relay with node executable and OTTO_RELAY_PORT', () => {
  const launch = createRelayLaunchSpec(8899, {
    env: {
      PATH: '/usr/bin:/bin',
    },
    resolveModulePath: () => '/tmp/otto-relay/dist/index.js',
  });

  assert.equal(launch.command, process.execPath);
  assert.deepEqual(launch.args, ['/tmp/otto-relay/dist/index.js']);
  assert.equal(launch.env.OTTO_RELAY_PORT, '8899');
  assert.equal(launch.env.PATH, '/usr/bin:/bin');
});
