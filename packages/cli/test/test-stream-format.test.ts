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

test('reddit getChatMessages update renders network and chat lines with sender and text', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'reddit.com',
    command: 'getChatMessages',
    jsonOutput: false,
    useColor: false,
  });

  const syncBody = {
    rooms: {
      join: {
        '!room-a:matrix.redditspace.com': {
          timeline: {
            events: [
              {
                type: 'm.room.message',
                event_id: '$evt-1',
                room_id: '!room-a:matrix.redditspace.com',
                sender: '@alice:matrix.redditspace.com',
                origin_server_ts: 1_775_564_800_000,
                content: {
                  body: 'hello world from alice',
                },
              },
            ],
          },
        },
      },
    },
  };

  const updateFrame = envelope('event', {
    type: 'listener_update',
    updateType: 'network.response',
    emittedAt: '2026-04-07T12:01:00.000Z',
    data: {
      eventId: 'net-1',
      emittedAt: '2026-04-07T12:01:00.000Z',
      url: 'https://matrix.redditspace.com/_matrix/client/v3/sync?timeout=0',
      method: 'GET',
      status: 200,
      body: JSON.stringify(syncBody),
      captureSource: 'fetch',
      site: 'reddit.com',
      tabSessionId: 'tab-1',
      tabId: 1,
      requestId: 'req-abc',
    },
  }, 'command-req-2');

  const first = renderer.renderListenerUpdate(updateFrame);
  assert.equal(first.length, 2);
  assert.match(first[0], /net:network\.response/);
  assert.match(first[0], /GET \| 200/);
  assert.match(first[1], /alice: hello world from alice/);

  const second = renderer.renderListenerUpdate(updateFrame);
  assert.equal(second.length, 1);
  assert.match(second[0], /net:network\.response/);
});

test('reddit getChatMessages command-native new_message renders sender recipient and text', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'reddit.com',
    command: 'getChatMessages',
    jsonOutput: false,
    useColor: false,
  });

  const frame = envelope('event', {
    type: 'listener_update',
    updateType: 'new_message',
    emittedAt: '2026-04-08T16:25:23.236Z',
    data: {
      roomId: '!room-a:reddit.com',
      eventId: '$evt-2',
      text: 'poate acum?',
      sender: '@t2_wpm42hjrj:reddit.com',
      senderId: 'wpm42hjrj',
      from: 'peer',
      createdAt: '2026-04-08T16:25:10.687Z',
    },
  }, 'command-req-native-1');

  const lines = renderer.renderListenerUpdate(frame);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /chat:new_message/);
  assert.match(lines[0], /t2_wpm42hjrj -> user: poate acum\?/);
});

test('reddit getChatMessages command-native typing renders actor and recipient', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'reddit.com',
    command: 'getChatMessages',
    jsonOutput: false,
    useColor: false,
  });

  const frame = envelope('event', {
    type: 'listener_update',
    updateType: 'typing',
    emittedAt: '2026-04-08T16:25:23.236Z',
    data: {
      roomId: '!room-a:reddit.com',
      peerIds: ['wpm42hjrj'],
    },
  }, 'command-req-native-typing-1');

  const lines = renderer.renderListenerUpdate(frame);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /chat:typing/);
  assert.match(lines[0], /wpm42hjrj -> user/);
});

test('reddit getChatMessages command-native room_member renders actor and recipient', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'reddit.com',
    command: 'getChatMessages',
    jsonOutput: false,
    useColor: false,
  });

  const frame = envelope('event', {
    type: 'listener_update',
    updateType: 'room_member',
    emittedAt: '2026-04-08T16:25:23.236Z',
    data: {
      roomId: '!room-a:reddit.com',
      peerId: 'wpm42hjrj',
      peerUsername: 'CozyMantis',
      from: 'peer',
    },
  }, 'command-req-native-room-member-1');

  const lines = renderer.renderListenerUpdate(frame);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /chat:room_member/);
  assert.match(lines[0], /CozyMantis -> user joined/);
});

test('reddit getChatMessages command-native message_deleted renders actor recipient and target id', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'reddit.com',
    command: 'getChatMessages',
    jsonOutput: false,
    useColor: false,
  });

  const frame = envelope('event', {
    type: 'listener_update',
    updateType: 'message_deleted',
    emittedAt: '2026-04-08T16:25:23.236Z',
    data: {
      roomId: '!room-a:reddit.com',
      sender: '@t2_wpm42hjrj:reddit.com',
      from: 'peer',
      redacts: '$evt-3',
    },
  }, 'command-req-native-message-deleted-1');

  const lines = renderer.renderListenerUpdate(frame);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /chat:message_deleted/);
  assert.match(lines[0], /t2_wpm42hjrj -> user deleted \$evt-3/);
});

test('reddit getChatMessages uses room_member username for subsequent new_message sender label', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'reddit.com',
    command: 'getChatMessages',
    jsonOutput: false,
    useColor: false,
  });

  const memberFrame = envelope('event', {
    type: 'listener_update',
    updateType: 'room_member',
    emittedAt: '2026-04-08T16:25:23.236Z',
    data: {
      roomId: '!room-a:reddit.com',
      peerId: 'wpm42hjrj',
      peerUsername: 'CozyMantis',
    },
  }, 'command-req-native-seed-1');

  const messageFrame = envelope('event', {
    type: 'listener_update',
    updateType: 'new_message',
    emittedAt: '2026-04-08T16:25:30.000Z',
    data: {
      roomId: '!room-a:reddit.com',
      eventId: '$evt-4',
      text: 'heyhey',
      senderId: 'wpm42hjrj',
      from: 'peer',
    },
  }, 'command-req-native-seed-2');

  renderer.renderListenerUpdate(memberFrame);
  const lines = renderer.renderListenerUpdate(messageFrame);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /CozyMantis -> user: heyhey/);
});

test('reddit getChatMessages creator message renders as user to known peer', () => {
  const renderer = createCommandTestStreamRenderer({
    site: 'reddit.com',
    command: 'getChatMessages',
    jsonOutput: false,
    useColor: false,
  });

  const memberFrame = envelope('event', {
    type: 'listener_update',
    updateType: 'room_member',
    emittedAt: '2026-04-08T16:30:00.000Z',
    data: {
      roomId: '!room-a:reddit.com',
      peerId: 'wpm42hjrj',
      peerUsername: 'CozyMantis',
    },
  }, 'command-req-native-seed-creator-1');

  const creatorMessage = envelope('event', {
    type: 'listener_update',
    updateType: 'new_message',
    emittedAt: '2026-04-08T16:30:05.000Z',
    data: {
      roomId: '!room-a:reddit.com',
      eventId: '$evt-5',
      text: 'my reply',
      senderId: '14f0tp',
      sender: '@t2_14f0tp:reddit.com',
      from: 'creator',
    },
  }, 'command-req-native-seed-creator-2');

  renderer.renderListenerUpdate(memberFrame);
  const lines = renderer.renderListenerUpdate(creatorMessage);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /user -> CozyMantis: my reply/);
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
