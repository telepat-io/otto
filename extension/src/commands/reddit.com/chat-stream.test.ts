import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPollingFallbackPlan,
  createRedditNetworkListenerOptions,
  extractEventsFromSync,
  parseSyncPayloadsFromBody,
  createRedditStreamDomainMapper,
  toStreamDomainObjects,
} from './chat-stream.js';

test('reddit chat stream returns generic network listener options', () => {
  const options = createRedditNetworkListenerOptions('tab_alpha');
  assert.deepEqual(options, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    streamAdapter: 'reddit.chat.v1',
    mode: 'hybrid',
    includeBody: true,
    includeHeaders: false,
    urlPatterns: ['https://matrix.redditspace.com/_matrix/client/v3/sync*'],
    requestHostAllowlist: ['matrix.redditspace.com'],
    mimeTypes: ['application/json', 'text/plain'],
    maxBodyBytes: 1_000_000,
  });
});

test('reddit chat stream parses data-prefixed payload lines', () => {
  const payloads = parseSyncPayloadsFromBody(
    'data: {"next_batch":"n1","rooms":{"join":{}}}\n'
      + 'data: {"next_batch":"n2","rooms":{"join":{}}}',
  );

  assert.equal(payloads.length, 2);
  assert.equal(payloads[0]?.next_batch, 'n1');
  assert.equal(payloads[1]?.next_batch, 'n2');
});

test('reddit chat stream parses CRLF chunked payloads', () => {
  const toChunk = (value: Record<string, unknown>): string => {
    const json = JSON.stringify(value);
    return `${json.length.toString(16)}\r\n${json}\r\n`;
  };

  const body = `${toChunk({ next_batch: 'n1', rooms: { join: {} } })}${toChunk({ next_batch: 'n2', rooms: { join: {} } })}`;
  const payloads = parseSyncPayloadsFromBody(body);

  assert.equal(payloads.length, 2);
  assert.equal(payloads[0]?.next_batch, 'n1');
  assert.equal(payloads[1]?.next_batch, 'n2');
});

test('reddit chat stream extracts matrix events from sync payload', () => {
  const sync = {
    next_batch: 'next_1',
    rooms: {
      join: {
        '!room:reddit.com': {
          state: {
            events: [
              {
                type: 'm.room.member',
                event_id: 'member_1',
                state_key: '@t2_peer:reddit.com',
                content: { displayname: 'Peer User' },
              },
            ],
          },
          timeline: {
            events: [
              {
                type: 'm.room.message',
                event_id: 'evt_1',
                sender: '@t2_self:reddit.com',
                origin_server_ts: 1710000000000,
                content: { body: 'hello' },
              },
            ],
          },
          ephemeral: {
            events: [
              {
                type: 'm.typing',
                content: { user_ids: ['@t2_peer:reddit.com'] },
              },
            ],
          },
        },
      },
    },
  } as Record<string, unknown>;

  const extracted = extractEventsFromSync(sync);
  assert.equal(extracted.nextBatch, 'next_1');
  assert.equal(extracted.events.length, 3);
  
   // Removed legacy listener-update shape assertions
});

test('reddit chat stream exposes command-owned polling fallback plan', () => {
  assert.deepEqual(createPollingFallbackPlan('room_1'), {
    enabled: true,
    mode: 'poll',
    strategy: 'command_poll',
    intervalMs: 7_000,
    maxPolls: 4,
    roomId: 'room_1',
  });
});

test('reddit chat stream maps matrix events into shared domain chat objects', () => {
  const sync = {
    rooms: {
      join: {
        '!room:reddit.com': {
          state: {
            events: [
              {
                type: 'm.room.member',
                event_id: 'member_self',
                state_key: '@t2_self:reddit.com',
                content: { displayname: 'Self User' },
              },
              {
                type: 'm.room.member',
                event_id: 'member_peer',
                state_key: '@t2_peer:reddit.com',
                content: { displayname: 'Peer User' },
              },
            ],
          },
          timeline: {
            events: [
              {
                type: 'm.room.message',
                event_id: 'evt_message',
                sender: '@t2_peer:reddit.com',
                origin_server_ts: 1710000000000,
                content: { body: 'hello from peer' },
              },
            ],
          },
          ephemeral: {
            events: [
              {
                type: 'm.typing',
                event_id: 'evt_typing',
                content: { user_ids: ['@t2_peer:reddit.com'] },
              },
            ],
          },
        },
      },
    },
  } as Record<string, unknown>;

  const extracted = extractEventsFromSync(sync);
  const domainObjects = toStreamDomainObjects(extracted.events, 'self');

  assert.equal(domainObjects.length, 3);

  assert.equal(domainObjects[0]?.kind, 'chat.participant');
  assert.equal(domainObjects[1]?.kind, 'chat.message');
  assert.equal(domainObjects[2]?.kind, 'chat.typing');

  const message = domainObjects[1] as {
    from: { id: string };
    to: { id: string };
    message: string;
    originalEntity?: unknown;
  };
  assert.equal(message.from.id, 'peer');
  assert.equal(message.to.id, 'self');
  assert.equal(message.message, 'hello from peer');
  assert.ok(message.originalEntity);
});

test('reddit chat stream mapper preserves room participant context across network updates', () => {
  const mapper = createRedditStreamDomainMapper('self');

  const memberSync = {
    rooms: {
      join: {
        '!room:reddit.com': {
          state: {
            events: [
              {
                type: 'm.room.member',
                event_id: 'member_self',
                state_key: '@t2_self:reddit.com',
                content: { displayname: 'Self User' },
              },
              {
                type: 'm.room.member',
                event_id: 'member_peer',
                state_key: '@t2_peer:reddit.com',
                content: { displayname: 'Peer User' },
              },
            ],
          },
          timeline: { events: [] },
          ephemeral: { events: [] },
        },
      },
    },
  };

  const messageSync = {
    rooms: {
      join: {
        '!room:reddit.com': {
          state: { events: [] },
          timeline: {
            events: [
              {
                type: 'm.room.message',
                event_id: 'evt_message',
                sender: '@t2_peer:reddit.com',
                origin_server_ts: 1710000000000,
                content: { body: 'later message' },
              },
            ],
          },
          ephemeral: { events: [] },
        },
      },
    },
  };

  const memberMapped = mapper.mapNetworkUpdate('network.response', {
    body: JSON.stringify(memberSync),
    base64Encoded: false,
  });
  assert.equal(memberMapped.length, 1);
  assert.equal(memberMapped[0]?.updateType, 'chat.participant');

  const messageMapped = mapper.mapNetworkUpdate('network.response', {
    body: JSON.stringify(messageSync),
    base64Encoded: false,
  });
  assert.equal(messageMapped.length, 1);
  assert.equal(messageMapped[0]?.updateType, 'chat.message');

  const message = messageMapped[0]?.data as {
    from: { id: string };
    to: { id: string };
    message: string;
    originalEntity?: unknown;
  };
  assert.equal(message.from.id, 'peer');
  assert.equal(message.to.id, 'self');
  assert.equal(message.message, 'later message');
  assert.ok(message.originalEntity);
});

test('reddit chat stream mapper suppresses duplicate events across repeated sync payloads', () => {
  const mapper = createRedditStreamDomainMapper('self');

  const sync = {
    rooms: {
      join: {
        '!room:reddit.com': {
          state: {
            events: [
              {
                type: 'm.room.member',
                event_id: 'member_peer',
                state_key: '@t2_peer:reddit.com',
                content: { displayname: 'Peer User' },
              },
            ],
          },
          timeline: {
            events: [
              {
                type: 'm.room.message',
                event_id: 'evt_message_dup',
                sender: '@t2_peer:reddit.com',
                origin_server_ts: 1710000000000,
                content: { body: 'duplicate me once only' },
              },
            ],
          },
          ephemeral: { events: [] },
        },
      },
    },
  };

  const firstMapped = mapper.mapNetworkUpdate('network.response', {
    body: JSON.stringify(sync),
    base64Encoded: false,
  });
  assert.equal(firstMapped.length, 2);

  const secondMapped = mapper.mapNetworkUpdate('network.response', {
    body: JSON.stringify(sync),
    base64Encoded: false,
  });
  assert.equal(secondMapped.length, 0);
});

test('reddit chat stream mapper suppresses semantic duplicate messages with different event ids', () => {
  const mapper = createRedditStreamDomainMapper('self');

  const first = {
    rooms: {
      join: {
        '!room:reddit.com': {
          state: { events: [] },
          timeline: {
            events: [
              {
                type: 'm.room.message',
                event_id: 'evt_a',
                sender: '@t2_peer:reddit.com',
                origin_server_ts: 1710000000000,
                content: { body: 'same payload' },
              },
            ],
          },
          ephemeral: { events: [] },
        },
      },
    },
  };

  const second = {
    rooms: {
      join: {
        '!room:reddit.com': {
          state: { events: [] },
          timeline: {
            events: [
              {
                type: 'm.room.message',
                event_id: 'evt_b',
                sender: '@t2_peer:reddit.com',
                origin_server_ts: 1710000000000,
                content: { body: 'same payload' },
              },
            ],
          },
          ephemeral: { events: [] },
        },
      },
    },
  };

  const firstMapped = mapper.mapNetworkUpdate('network.response', {
    body: JSON.stringify(first),
    base64Encoded: false,
  });
  assert.equal(firstMapped.length, 1);
  assert.equal(firstMapped[0]?.updateType, 'chat.message');

  const secondMapped = mapper.mapNetworkUpdate('network.response', {
    body: JSON.stringify(second),
    base64Encoded: false,
  });
  assert.equal(secondMapped.length, 0);
});
