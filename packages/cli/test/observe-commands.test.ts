import assert from 'node:assert/strict';
import test from 'node:test';
import { Command } from 'commander';
import { registerObserveCommands } from '../src/cli/observe-commands.js';

test('commands list accepts --json and applies site filter', async () => {
  const program = new Command();
  let output = '';
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    output = args.join(' ');
  };

  try {
    registerObserveCommands({
      program,
      loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787?role=controller' } as import('../src/config.js').OttoConfig),
      deriveHttpUrl: () => 'http://127.0.0.1:8787',
      resolveTargetNodeId: async () => 'node-1',
      runCommandOnce: async () => ({
        messageType: 'result',
        payload: {
          data: {
            commands: [
              { id: 'reddit.getFeed', site: 'reddit.com' },
              { id: 'hn.getFrontPage', site: 'news.ycombinator.com' },
            ],
          },
        },
      } as import('@telepat/otto-protocol').Envelope),
      parseMaybeNumber: () => 30_000,
      parsePositiveNumberOption: () => 1,
      parseNetworkMode: () => 'network',
      collectString: (value, previous) => [...previous, value],
      parseLogLevelOption: () => undefined,
      parseLogSourceOption: () => undefined,
      parseLatestOption: () => undefined,
      requestJson: async () => ({}),
      subscribeNetworkListenerAndFollow: async () => {},
      openControllerSocket: async () => {
        throw new Error('not used');
      },
      startControllerHeartbeat: () => () => {},
      runLogsFollowTui: async () => {},
      followLogsOnce: async () => {},
    });

    await program.parseAsync(['commands', 'list', '--json', '--site', 'reddit.com'], { from: 'user' });

    const parsed = JSON.parse(output) as {
      payload: {
        data: {
          commands: Array<{ id: string; site: string }>;
        };
      };
    };
    assert.equal(parsed.payload.data.commands.length, 1);
    assert.equal(parsed.payload.data.commands[0]?.site, 'reddit.com');
  } finally {
    console.log = originalLog;
  }
});
