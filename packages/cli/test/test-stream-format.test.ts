import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommandTestStreamRenderer } from '../src/test-stream/format.js';

test('renderCommandResponse renders cancelled outcome', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, durationMs: 100, commandOutcome: 'cancelled' } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines[0].includes('cancelled'));
});

test('renderCommandResponse renders timed_out outcome', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: false, durationMs: 100, commandOutcome: 'timed_out' } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines[0].includes('timed_out'));
});

test('renderCommandResponse renders unknown outcome', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: false, durationMs: 100, commandOutcome: 'unknown' } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines[0].includes('unknown'));
});

test('renderCommandResponse renders warnings', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, durationMs: 100, warnings: ['warn1', '', 'warn2'] } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines.some((l) => l.includes('warn1')));
  assert.ok(lines.some((l) => l.includes('warn2')));
});

test('renderCommandResponse renders unknown message type', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'ping', payload: {} } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines[0].includes('ping'));
});

test('renderSubscribeResponse renders unknown message type', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderSubscribeResponse(
    { messageType: 'ping', payload: {} } as import('@telepat/otto-protocol').Envelope,
    'network.http_intercept',
  );
  assert.ok(lines[0].includes('network.http_intercept'));
  assert.ok(lines[0].includes('ping'));
});

test('renderListenerUpdate handles missing data', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'generic',
      data: undefined,
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines[0].includes('generic'));
});

test('renderListenerUpdate handles non-domain-object data', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'raw',
      data: { foo: 1 },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines[0].includes('raw'));
});

test('renderTerminalResponse renders unknown message type', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderTerminalResponse(
    { messageType: 'ping', payload: {} } as import('@telepat/otto-protocol').Envelope,
  );
  assert.ok(lines[0].includes('ping'));
});

test('renderCommandResponse with color disabled via NO_COLOR', () => {
  process.env.NO_COLOR = '1';
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, commandOutcome: 'completed' } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  delete process.env.NO_COLOR;
  assert.ok(lines[0].includes('completed'));
  assert.ok(!lines[0].includes('\u001b['));
});

test('renderCommandResponse with explicit useColor false', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false, useColor: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, commandOutcome: 'completed' } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(!lines[0].includes('\u001b['));
});

test('renderCommandResponse with explicit useColor true', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false, useColor: true });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, commandOutcome: 'completed' } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines[0].includes('\u001b['));
});

test('renderCommandResponse renders user profile data', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, data: { kind: 'entity.user', id: 'u1', platform: 'reddit', displayName: 'User', username: 'user', stats: { followers: 10, posts: 5 } } } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines.some((l) => l.includes('User')));
});

test('renderCommandResponse renders post collection', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, data: { posts: [{ title: 'Post 1', author: { id: 'a1' }, community: 'r/test', score: 42, commentCount: 3 }] } } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines.some((l) => l.includes('Post 1')));
});

test('renderCommandResponse renders array data', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, data: [1, 2, 3] } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines.some((l) => l.includes('array(3)')));
});

test('renderCommandResponse renders primitive data', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, data: 'hello' } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines.some((l) => l.includes('hello')));
});

test('renderListenerUpdate handles chat.message', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getChatMessages', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'chat',
      data: {
        kind: 'chat.message',
        id: 'm1',
        from: { id: 'u1', displayName: 'Alice' },
        to: { id: 'u2', displayName: 'Bob' },
        message: 'hello world',
        conversation: { id: 'room1' },
      },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('Alice')));
  assert.ok(lines.some((l) => l.includes('hello world')));
});

test('renderListenerUpdate handles chat.typing', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getChatMessages', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'chat',
      data: {
        kind: 'chat.typing',
        id: 't1',
        from: { id: 'u1', username: 'alice' },
        to: { id: 'u2', username: 'bob' },
      },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('chat.typing')));
  assert.ok(lines.some((l) => l.includes('alice')));
});

test('renderListenerUpdate handles chat.participant', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getChatMessages', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'chat',
      data: {
        kind: 'chat.participant',
        id: 'p1',
        event: 'joined',
        participant: { id: 'u1', displayName: 'Alice' },
        conversation: { id: 'room1' },
      },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('joined')));
  assert.ok(lines.some((l) => l.includes('Alice')));
});

test('renderListenerUpdate handles chat.message_deleted', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getChatMessages', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'chat',
      data: {
        kind: 'chat.message_deleted',
        id: 'd1',
        messageId: 'm1',
        deletedBy: { id: 'u1', username: 'alice' },
      },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('deleted')));
  assert.ok(lines.some((l) => l.includes('m1')));
});

test('renderTerminalResponse renders result', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderTerminalResponse(
    { messageType: 'result', payload: { ok: true, commandOutcome: 'completed', durationMs: 100 } } as import('@telepat/otto-protocol').Envelope,
  );
  assert.ok(lines[0].includes('completed'));
  assert.ok(lines[0].includes('100ms'));
});

test('renderTerminalResponse renders error', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderTerminalResponse(
    { messageType: 'error', payload: { code: 'test_error', message: 'something went wrong' } } as import('@telepat/otto-protocol').Envelope,
  );
  assert.ok(lines[0].includes('test_error'));
  assert.ok(lines[0].includes('something went wrong'));
});

test('renderCommandResponse returns raw JSON when jsonOutput is true', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: true });
  const msg = { messageType: 'result', payload: { ok: true } } as import('@telepat/otto-protocol').Envelope;
  const lines = renderer.renderCommandResponse(msg, 'getFeed');
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('"ok": true'));
});

test('renderSubscribeResponse returns raw JSON when jsonOutput is true', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: true });
  const msg = { messageType: 'result', payload: { ok: true } } as import('@telepat/otto-protocol').Envelope;
  const lines = renderer.renderSubscribeResponse(msg, 'network.http_intercept');
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('"ok": true'));
});

test('renderSubscribeResponse renders result', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderSubscribeResponse(
    { messageType: 'result', payload: {} } as import('@telepat/otto-protocol').Envelope,
    'network.http_intercept',
  );
  assert.ok(lines[0].includes('subscribed'));
});

test('renderSubscribeResponse renders error', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderSubscribeResponse(
    { messageType: 'error', payload: { code: 'sub_err', message: 'failed' } } as import('@telepat/otto-protocol').Envelope,
    'network.http_intercept',
  );
  assert.ok(lines[0].includes('sub_err'));
  assert.ok(lines[0].includes('failed'));
});

test('renderListenerUpdate returns raw JSON when jsonOutput is true', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: true });
  const msg = {
    messageType: 'event',
    payload: { type: 'listener_update', data: { kind: 'chat.message' } },
  } as import('@telepat/otto-protocol').Envelope;
  const lines = renderer.renderListenerUpdate(msg);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('chat.message'));
});

test('renderListenerUpdate handles generic domain object', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'generic',
      data: { kind: 'custom.thing', id: 'x1' },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('custom.thing')));
});

test('renderListenerUpdate handles chat.message without conversation', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getChatMessages', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'chat',
      data: {
        kind: 'chat.message',
        id: 'm1',
        from: { id: 'u1' },
        to: { id: 'u2' },
        message: 'hello',
      },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('hello')));
});

test('renderListenerUpdate handles chat.typing without conversation', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getChatMessages', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'chat',
      data: {
        kind: 'chat.typing',
        id: 't1',
        from: { id: 'u1' },
        to: { id: 'u2' },
      },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('chat.typing')));
});

test('renderListenerUpdate handles chat.participant without displayName', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getChatMessages', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'chat',
      data: {
        kind: 'chat.participant',
        id: 'p1',
        event: 'left',
        participant: { id: 'u1' },
      },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('left')));
});

test('renderListenerUpdate handles chat.message_deleted without deletedBy', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getChatMessages', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'chat',
      data: {
        kind: 'chat.message_deleted',
        id: 'd1',
        messageId: 'm1',
      },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('unknown')));
  assert.ok(lines.some((l) => l.includes('m1')));
});

test('renderTerminalResponse returns raw JSON when jsonOutput is true', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: true });
  const msg = { messageType: 'result', payload: { ok: true } } as import('@telepat/otto-protocol').Envelope;
  const lines = renderer.renderTerminalResponse(msg);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('"ok": true'));
});

test('renderTerminalResponse renders unknown message type', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderTerminalResponse(
    { messageType: 'ping', payload: {} } as import('@telepat/otto-protocol').Envelope,
  );
  assert.ok(lines[0].includes('ping'));
});

test('renderCommandResponse handles missing commandOutcome and durationMs', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines[0].includes('completed'));
  assert.ok(!lines[0].includes('ms'));
});

test('renderCommandResponse handles non-array warnings', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, warnings: 'bad' } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(!lines.some((l) => l.includes('warning')));
});

test('renderCommandResponse renders empty post collection', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, data: { posts: [] } } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines.some((l) => l.includes('posts=0')));
});

test('renderCommandResponse renders post collection with non-record post', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, data: { posts: ['bad'] } } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines.some((l) => l.includes('bad')));
});

test('renderCommandResponse renders post with minimal fields', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, data: { posts: [{}] } } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines.some((l) => l.includes('(untitled)')));
});

test('renderCommandResponse renders user profile with minimal fields', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, data: { kind: 'entity.user', id: 'u1', platform: 'reddit' } } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines.some((l) => l.includes('u1')));
});

test('renderListenerUpdate ignores non-listener-update event', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderListenerUpdate(
    { messageType: 'event', payload: { type: 'other' } } as import('@telepat/otto-protocol').Envelope,
  );
  assert.deepEqual(lines, []);
});

test('renderListenerUpdate uses default updateType', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: { type: 'listener_update', data: { kind: 'chat.message', id: 'm1', from: { id: 'u1' }, to: { id: 'u2' }, message: 'hi' } },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('[chat.message]')));
});

test('renderListenerUpdate handles chat.message with no displayName on from/to', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getChatMessages', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'chat',
      data: {
        kind: 'chat.message',
        id: 'm1',
        from: { id: 'u1', username: 'alice' },
        to: { id: 'u2', username: 'bob' },
        message: 'hello',
      },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('alice')));
  assert.ok(lines.some((l) => l.includes('bob')));
});

test('renderListenerUpdate handles chat.typing with conversation', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getChatMessages', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'chat',
      data: {
        kind: 'chat.typing',
        id: 't1',
        from: { id: 'u1', displayName: 'Alice' },
        to: { id: 'u2', displayName: 'Bob' },
        conversation: { id: 'room1' },
      },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('room1')));
});

test('renderListenerUpdate handles chat.participant without displayName', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getChatMessages', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'chat',
      data: {
        kind: 'chat.participant',
        id: 'p1',
        event: 'joined',
        participant: { id: 'u1', username: 'alice' },
      },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('alice')));
});

test('renderListenerUpdate handles chat.message_deleted with conversation and no deletedBy', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getChatMessages', jsonOutput: false });
  const lines = renderer.renderListenerUpdate({
    messageType: 'event',
    payload: {
      type: 'listener_update',
      updateType: 'chat',
      data: {
        kind: 'chat.message_deleted',
        id: 'd1',
        messageId: 'm1',
        conversation: { id: 'room1' },
      },
    },
  } as import('@telepat/otto-protocol').Envelope);
  assert.ok(lines.some((l) => l.includes('room1')));
  assert.ok(lines.some((l) => l.includes('unknown')));
});

test('renderTerminalResponse handles missing durationMs', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderTerminalResponse(
    { messageType: 'result', payload: { ok: true, commandOutcome: 'completed' } } as import('@telepat/otto-protocol').Envelope,
  );
  assert.ok(lines[0].includes('completed'));
  assert.ok(!lines[0].includes('ms'));
});

test('renderCommandResponse renders user profile with all fields', () => {
  const renderer = createCommandTestStreamRenderer({ site: 'reddit.com', command: 'getFeed', jsonOutput: false });
  const lines = renderer.renderCommandResponse(
    { messageType: 'result', payload: { ok: true, data: { kind: 'entity.user', id: 'u1', platform: 'reddit', displayName: 'User', profileUrl: 'http://example.com', createdAt: '2024-01-01', flags: ['mod'], stats: { followers: 10, posts: 5 } } } } as import('@telepat/otto-protocol').Envelope,
    'getFeed',
  );
  assert.ok(lines.some((l) => l.includes('profileUrl')));
  assert.ok(lines.some((l) => l.includes('createdAt')));
  assert.ok(lines.some((l) => l.includes('flags')));
  assert.ok(lines.some((l) => l.includes('followers')));
});
