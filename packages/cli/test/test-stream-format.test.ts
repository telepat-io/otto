import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnvelope, type Envelope } from '@telepat/otto-protocol';
import { createCommandTestStreamRenderer } from '../src/test-stream-format.js';

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
