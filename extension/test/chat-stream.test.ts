import assert from 'node:assert/strict';
import test from 'node:test';
import type { StreamDomainObject, UserRef } from '@telepat/otto-protocol';
import {
  createPollingFallbackPlan,
  createRedditNetworkListenerOptions,
  extractEventsFromSync,
  parseSyncPayloadsFromBody,
  createRedditStreamDomainMapper,
  toStreamDomainObjects,
  parseChunkedJson,
  domainDedupeKey,
  dedupeKey,
  compactDeduper,
  getUserId,
  decodeBase64Utf8,
  toIsoDate,
  toConversation,
  toUserRef,
  upsertRoomParticipant,
  getRoomParticipant,
  createFallbackUser,
  resolveRecipient,
} from '../src/commands/reddit.com/chat-stream.js';

test('reddit chat stream returns generic network listener options', () => {
  const options = createRedditNetworkListenerOptions('tab_alpha');
  assert.deepEqual(options, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    streamAdapter: 'reddit.chat.v1',
    mode: 'fetch',
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

test('parseSyncPayloadsFromBody returns empty for empty string', () => {
  assert.deepEqual(parseSyncPayloadsFromBody(''), []);
  assert.deepEqual(parseSyncPayloadsFromBody('   '), []);
});

test('parseSyncPayloadsFromBody falls back to single JSON object', () => {
  const payloads = parseSyncPayloadsFromBody('{"next_batch":"n1"}');
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0]?.next_batch, 'n1');
});

test('parseSyncPayloadsFromBody ignores non-object JSON', () => {
  assert.deepEqual(parseSyncPayloadsFromBody('123'), []);
  assert.deepEqual(parseSyncPayloadsFromBody('"string"'), []);
});

test('parseSyncPayloadsFromBody handles invalid JSON gracefully', () => {
  assert.deepEqual(parseSyncPayloadsFromBody('not json'), []);
});

test('parseChunkedJson handles invalid hex size', () => {
  const result = parseChunkedJson('zz\r\n{}');
  assert.deepEqual(result, []);
});

test('parseChunkedJson handles size larger than remaining data', () => {
  const result = parseChunkedJson('10\r\n{}');
  assert.deepEqual(result, []);
});

test('parseChunkedJson handles zero size terminator', () => {
  const result = parseChunkedJson('2\r\n{}\r\n0\r\n');
  assert.equal(result.length, 1);
});

test('extractEventsFromSync includes redaction events', () => {
  const extracted = extractEventsFromSync({
    rooms: {
      join: {
        '!room:reddit.com': {
          timeline: {
            events: [
              { type: 'm.room.redaction', event_id: 'redact_1', sender: '@t2_self:reddit.com', redacts: 'evt_1', origin_server_ts: 1710000000000 },
            ],
          },
        },
      },
    },
  });
  assert.equal(extracted.events.length, 1);
  assert.equal(extracted.events[0]?.kind, 'message_deleted');
  assert.equal(extracted.events[0]?.redacts, 'evt_1');
});

test('extractEventsFromSync skips typing events with empty userIds', () => {
  const extracted = extractEventsFromSync({
    rooms: {
      join: {
        '!room:reddit.com': {
          ephemeral: {
            events: [
              { type: 'm.typing', content: { user_ids: [] }, origin_server_ts: 1710000000000 },
            ],
          },
        },
      },
    },
  });
  assert.equal(extracted.events.length, 0);
});

test('extractEventsFromSync skips messages without body', () => {
  const extracted = extractEventsFromSync({
    rooms: {
      join: {
        '!room:reddit.com': {
          timeline: {
            events: [
              { type: 'm.room.message', event_id: 'evt_1', sender: '@t2_self:reddit.com', content: {}, origin_server_ts: 1710000000000 },
            ],
          },
        },
      },
    },
  });
  assert.equal(extracted.events.length, 0);
});

test('toStreamDomainObjects skips message_deleted without redacts', () => {
  const updates = toStreamDomainObjects([{ kind: 'message_deleted', roomId: 'room1' }]);
  assert.equal(updates.length, 0);
});

test('toStreamDomainObjects skips room_member when participant cannot be resolved', () => {
  const updates = toStreamDomainObjects([{ kind: 'room_member', roomId: 'room1' }]);
  assert.equal(updates.length, 0);
});

test('toStreamDomainObjects filters out self room_member events', () => {
  const updates = toStreamDomainObjects([
    { kind: 'room_member', roomId: 'room1', stateKey: '@t2_self:reddit.com', displayName: 'Self' },
  ], 'self');
  assert.equal(updates.length, 0);
});

test('toStreamDomainObjects includes room_member for others', () => {
  const updates = toStreamDomainObjects([
    { kind: 'room_member', roomId: 'room1', stateKey: '@t2_peer:reddit.com', displayName: 'Peer' },
  ], 'self');
  assert.equal(updates.length, 1);
  assert.equal((updates[0] as { kind: string }).kind, 'chat.participant');
});

test('mapNetworkUpdate returns empty for non-network.response', () => {
  const mapper = createRedditStreamDomainMapper('self');
  assert.deepEqual(mapper.mapNetworkUpdate('other', {}), []);
});

test('mapNetworkUpdate returns empty for non-object data', () => {
  const mapper = createRedditStreamDomainMapper('self');
  assert.deepEqual(mapper.mapNetworkUpdate('network.response', 'string'), []);
});

test('mapNetworkUpdate returns empty for empty body', () => {
  const mapper = createRedditStreamDomainMapper('self');
  assert.deepEqual(mapper.mapNetworkUpdate('network.response', { body: '' }), []);
});

test('mapNetworkUpdate returns empty for base64 decode failure', () => {
  const mapper = createRedditStreamDomainMapper('self');
  assert.deepEqual(mapper.mapNetworkUpdate('network.response', { body: '!!!', base64Encoded: true }), []);
});

test('mapNetworkUpdate returns empty when no payloads parsed', () => {
  const mapper = createRedditStreamDomainMapper('self');
  assert.deepEqual(mapper.mapNetworkUpdate('network.response', { body: 'not-valid-json', base64Encoded: false }), []);
});

test('domainDedupeKey handles chat.message', () => {
  const key = domainDedupeKey({
    kind: 'chat.message',
    conversation: { id: 'room1' },
    from: { id: 'a' },
    to: { id: 'b' },
    datetime: '2024-01-01',
    message: 'hello',
  } as StreamDomainObject);
  assert.ok(key.includes('chat.message'));
});

test('domainDedupeKey handles chat.typing', () => {
  const key = domainDedupeKey({
    kind: 'chat.typing',
    conversation: { id: 'room1' },
    from: { id: 'a' },
    to: { id: 'b' },
    datetime: '2024-01-01',
    isTyping: true,
  } as StreamDomainObject);
  assert.ok(key.includes('chat.typing'));
});

test('domainDedupeKey handles chat.participant', () => {
  const key = domainDedupeKey({
    kind: 'chat.participant',
    conversation: { id: 'room1' },
    participant: { id: 'a' },
    event: 'joined',
    datetime: '2024-01-01',
  } as StreamDomainObject);
  assert.ok(key.includes('chat.participant'));
});

test('domainDedupeKey handles chat.message_deleted', () => {
  const key = domainDedupeKey({
    kind: 'chat.message_deleted',
    conversation: { id: 'room1' },
    messageId: 'm1',
    deletedBy: { id: 'a' },
    datetime: '2024-01-01',
  } as StreamDomainObject);
  assert.ok(key.includes('chat.message_deleted'));
});

test('domainDedupeKey falls back to JSON.stringify for unknown kinds', () => {
  const key = domainDedupeKey({ kind: 'unknown', id: 'x' } as unknown as StreamDomainObject);
  assert.ok(key.includes('unknown'));
});

test('dedupeKey handles typing without eventId', () => {
  const key = dedupeKey({ kind: 'typing', roomId: 'room1', userIds: ['u1'] });
  assert.ok(key.startsWith('typing:'));
});

test('dedupeKey handles message_deleted without eventId', () => {
  const key = dedupeKey({ kind: 'message_deleted', roomId: 'room1', redacts: 'm1' });
  assert.ok(key.startsWith('message_deleted:'));
});

test('dedupeKey handles room_member without eventId', () => {
  const key = dedupeKey({ kind: 'room_member', roomId: 'room1', stateKey: '@t2_peer:reddit.com' });
  assert.ok(key.startsWith('room_member:'));
});

test('dedupeKey handles new_message without eventId', () => {
  const key = dedupeKey({ kind: 'new_message', roomId: 'room1', sender: '@t2_peer:reddit.com', originServerTs: 123, text: 'hi' });
  assert.ok(key.startsWith('new_message:'));
});

test('compactDeduper removes oldest entries when set exceeds max', () => {
  const set = new Set<string>();
  for (let i = 0; i < 2500; i++) {
    set.add(`key-${i}`);
  }
  compactDeduper(set);
  assert.ok(set.size <= 2000);
});

test('getUserId returns undefined for undefined input', () => {
  assert.equal(getUserId(undefined), undefined);
});

test('decodeBase64Utf8 decodes base64 utf8', () => {
  assert.equal(decodeBase64Utf8('aGk='), 'hi');
});

test('toIsoDate uses fallback for invalid originServerTs', () => {
  assert.equal(toIsoDate(undefined, 'fallback'), 'fallback');
  assert.equal(toIsoDate(NaN, 'fallback'), 'fallback');
});

test('toConversation uses unknown_room for empty roomId', () => {
  const conv = toConversation('');
  assert.equal(conv.id, 'unknown_room');
});

test('toUserRef returns undefined for undefined matrixUserId', () => {
  assert.equal(toUserRef(undefined), undefined);
});

test('upsertRoomParticipant does nothing for empty roomId', () => {
  const directory = new Map();
  upsertRoomParticipant(directory, '', { id: 'u1' } as UserRef);
  assert.equal(directory.size, 0);
});

test('getRoomParticipant returns undefined for missing roomId or userId', () => {
  assert.equal(getRoomParticipant(new Map(), 'room1', undefined), undefined);
  assert.equal(getRoomParticipant(new Map(), undefined, 'u1'), undefined);
});

test('createFallbackUser returns unknown for empty userId', () => {
  const user = createFallbackUser('');
  assert.equal(user.id, 'unknown');
});

test('resolveRecipient returns fallback with selfUserId when only sender exists in room', () => {
  const directory = new Map<string, Map<string, UserRef>>();
  directory.set('room1', new Map([['self', { id: 'self', username: 'self', platform: 'reddit' }]]));
  const recipient = resolveRecipient(directory, 'room1', 'self', 'self');
  assert.equal(recipient.id, 'self');
});
