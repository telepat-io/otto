import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnvelope, type Envelope } from '@telepat/otto-protocol';
import { createCommandTestStreamRenderer } from '../src/test-stream/format.js';

function envelope(messageType: Envelope['messageType'], payload: unknown, requestId = 'req-1'): Envelope {
  return createEnvelope(messageType, 'controller', requestId, payload);
}

test('generic listener updates render readable summary lines', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'example.com',
    command: 'getData',
    jsonOutput: false,
    useColor: false,
  });

  const lines = renderer.renderListenerUpdate(
    envelope('event', {
      type: 'listener_update',
      updateType: 'network.response',
      emittedAt: '2026-04-07T12:00:00.000Z',
      data: {
        requestId: 'r-1',
        status: 200,
        url: 'https://example.com/api/messages',
      },
    }, 'command-req-1'),
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[12:00:00Z\]/);
  assert.match(lines[0], /update:network\.response/);
  assert.match(lines[0], /status=200/);
});

test('shared domain chat.message renders with from/to labels', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'example.com',
    command: 'getChatMessages',
    jsonOutput: false,
    useColor: false,
  });

  const lines = renderer.renderListenerUpdate(
    envelope('event', {
      type: 'listener_update',
      updateType: 'chat.message',
      emittedAt: '2026-04-09T12:00:00.000Z',
      data: {
        kind: 'chat.message',
        conversation: { id: '!room-a:reddit.com' },
        from: { id: 'peer', username: 'peer', displayName: 'Peer User' },
        to: { id: 'self', username: 'self', displayName: 'Self User' },
        message: 'hello shared contract',
        datetime: '2026-04-09T11:59:58.000Z',
      },
    }, 'command-req-shared-1'),
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0], /chat\.message/);
  assert.match(lines[0], /Peer User -> Self User: hello shared contract/);
});

test('shared domain chat.typing renders with from/to labels', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'example.com',
    command: 'getChatMessages',
    jsonOutput: false,
    useColor: false,
  });

  const lines = renderer.renderListenerUpdate(
    envelope('event', {
      type: 'listener_update',
      updateType: 'chat.typing',
      emittedAt: '2026-04-09T12:00:00.000Z',
      data: {
        kind: 'chat.typing',
        conversation: { id: '!room-a:reddit.com' },
        from: { id: 'peer', username: 'peer', displayName: 'Peer User' },
        to: { id: 'self', username: 'self', displayName: 'Self User' },
        datetime: '2026-04-09T11:59:59.000Z',
      },
    }, 'command-req-shared-typing-1'),
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0], /chat\.typing/);
  assert.match(lines[0], /Peer User -> Self User/);
});

test('shared domain chat.message_deleted renders actor and message id', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'example.com',
    command: 'getChatMessages',
    jsonOutput: false,
    useColor: false,
  });

  const lines = renderer.renderListenerUpdate(
    envelope('event', {
      type: 'listener_update',
      updateType: 'chat.message_deleted',
      emittedAt: '2026-04-09T12:00:00.000Z',
      data: {
        kind: 'chat.message_deleted',
        conversation: { id: '!room-a:reddit.com' },
        messageId: '$evt-3',
        datetime: '2026-04-09T11:59:59.000Z',
        deletedBy: { id: 'peer', username: 'peer', displayName: 'Peer User' },
      },
    }, 'command-req-shared-deleted-1'),
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0], /chat\.message_deleted/);
  assert.match(lines[0], /Peer User deleted \$evt-3/);
});

test('command result renders payload post lines in non-json mode', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'reddit.com',
    command: 'getFeed',
    jsonOutput: false,
    useColor: false,
  });

  const lines = renderer.renderCommandResponse(
    envelope('result', {
      ok: true,
      action: 'command.test',
      durationMs: 1391,
      commandOutcome: 'completed',
      data: {
        site: 'reddit.com',
        command: 'getFeed',
        posts: [
          {
            kind: 'content.post',
            id: 'abc123',
            title: 'A post title',
            community: 'r/example',
            author: { id: 'alice', username: 'alice', displayName: 'Alice' },
            score: 42,
            commentCount: 3,
            content: 'post preview text from reddit',
          },
        ],
      },
    }, 'command-req-4'),
    'command.test',
  );

  assert.equal(lines.length, 7);
  assert.match(lines[0], /command\.test completed/);
  assert.equal(lines[1], '[otto:test:data] posts=1');
  assert.match(lines[2], /^\+/);
  assert.match(lines[3], /title \/ preview/);
  assert.equal(lines[3].includes('#'), false);
  assert.match(lines[4], /^\+/);
  assert.match(lines[5], /A post title/);
  assert.match(lines[5], /Alice/);
  assert.match(lines[5], /r\/example/);
  assert.match(lines[5], /42/);
  assert.match(lines[5], /3/);
  assert.match(lines[5], /post preview text from reddit/);
  assert.match(lines[6], /^\+/);
});

test('command result renders generic object summary when posts are absent', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'example.com',
    command: 'getData',
    jsonOutput: false,
    useColor: false,
  });

  const lines = renderer.renderCommandResponse(
    envelope('result', {
      ok: true,
      action: 'command.test',
      durationMs: 12,
      commandOutcome: 'completed',
      data: {
        records: 2,
        status: 'ok',
      },
    }, 'command-req-5'),
    'command.test',
  );

  assert.equal(lines.length, 2);
  assert.match(lines[0], /command\.test completed/);
  assert.match(lines[1], /otto:test:data/);
  assert.match(lines[1], /records=2/);
});

test('command result renders normalized user profile details', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'reddit.com',
    command: 'getUserInfo',
    jsonOutput: false,
    useColor: false,
  });

  const lines = renderer.renderCommandResponse(
    envelope('result', {
      ok: true,
      action: 'command.test',
      durationMs: 24,
      commandOutcome: 'completed',
      data: {
        user: {
          kind: 'entity.user',
          id: 't2_abc123',
          platform: 'reddit',
          username: 'alice',
          displayName: 'Alice',
          profileUrl: 'https://www.reddit.com/user/alice/',
          createdAt: '2026-04-12T00:00:00.000Z',
          flags: ['verified', 'moderator'],
          stats: {
            followers: 123,
            reputation: 456,
          },
        },
      },
    }, 'command-req-user-1'),
    'command.test',
  );

  assert.equal(lines.length, 7);
  assert.match(lines[0], /command\.test completed/);
  assert.equal(lines[1], '[otto:test:user] Alice | alice | t2_abc123');
  assert.equal(lines[2], '[otto:test:user] platform=reddit');
  assert.equal(lines[3], '[otto:test:user] profileUrl=https://www.reddit.com/user/alice/');
  assert.equal(lines[4], '[otto:test:user] createdAt=2026-04-12T00:00:00.000Z');
  assert.equal(lines[5], '[otto:test:user] flags=verified,moderator');
  assert.equal(lines[6], '[otto:test:user] followers=123 reputation=456');
});

test('command result colorizes post lines when color output is enabled', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'reddit.com',
    command: 'getFeed',
    jsonOutput: false,
    useColor: true,
  });

  const lines = renderer.renderCommandResponse(
    envelope('result', {
      ok: true,
      action: 'command.test',
      durationMs: 120,
      commandOutcome: 'completed',
      data: {
        posts: [
          {
            kind: 'content.post',
            id: 'abc123',
            title: 'A post title',
            community: 'r/example',
            author: { id: 'alice', username: 'alice', displayName: 'Alice' },
            score: 42,
            commentCount: 3,
            content: 'preview line',
          },
        ],
      },
    }, 'command-req-color-1'),
    'command.test',
  );

  assert.equal(lines.length, 7);
  assert.equal(lines[1].includes('\u001b[34mposts=1\u001b[0m'), true);
  assert.equal(lines[5].includes('\u001b[32mA post title'), true);
  assert.equal(lines[5].includes('\u001b[36mAlice'), true);
  assert.equal(lines[5].includes('\u001b[33mr/example'), true);
});

test('json output mode preserves full frame object output', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'reddit.com',
    command: 'getChatMessages',
    jsonOutput: true,
    useColor: false,
  });

  const frame = envelope('result', {
    ok: true,
    action: 'command.test',
    durationMs: 50,
    commandOutcome: 'completed',
  }, 'command-req-3');

  const lines = renderer.renderTerminalResponse(frame);
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]) as { messageType: string; requestId: string };
  assert.equal(parsed.messageType, 'result');
  assert.equal(parsed.requestId, 'command-req-3');
});
