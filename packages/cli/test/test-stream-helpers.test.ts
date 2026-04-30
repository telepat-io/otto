import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shortTimestamp,
  shorten,
  oneLine,
  extractListenerUpdate,
  decodeBody,
  parseMatrixMessagesFromBody,
  normalizeSender,
  inferRecipient,
  normalizeUserId,
  inferActor,
  summarizeUnknownData,
} from '../src/test-stream/helpers.js';

test('shortTimestamp formats ISO timestamp', () => {
  assert.equal(shortTimestamp('2024-01-01T12:34:56.789Z'), '12:34:56Z');
  assert.equal(shortTimestamp('invalid'), 'invalid');
  assert.equal(shortTimestamp(undefined), 'unknown-time');
});

test('shorten truncates long strings', () => {
  assert.equal(shorten('short'), 'short');
  assert.equal(shorten('a'.repeat(200), 10), 'a'.repeat(9) + '...');
});

test('oneLine collapses whitespace', () => {
  assert.equal(oneLine('  hello\n\n  world  '), 'hello world');
});

test('extractListenerUpdate returns payload for listener_update event', () => {
  const result = extractListenerUpdate({ messageType: 'event', payload: { type: 'listener_update', data: {} } } as import('@telepat/otto-protocol').Envelope);
  assert.ok(result);
  assert.equal(result?.payload.type, 'listener_update');
});

test('extractListenerUpdate returns null for non-event', () => {
  const result = extractListenerUpdate({ messageType: 'result', payload: { type: 'listener_update' } } as import('@telepat/otto-protocol').Envelope);
  assert.equal(result, null);
});

test('extractListenerUpdate returns null for wrong type', () => {
  const result = extractListenerUpdate({ messageType: 'event', payload: { type: 'other' } } as import('@telepat/otto-protocol').Envelope);
  assert.equal(result, null);
});

test('decodeBody decodes base64 when flagged', () => {
  assert.equal(decodeBody('hello', false), 'hello');
  assert.equal(decodeBody(Buffer.from('hello').toString('base64'), true), 'hello');
});

test('decodeBody returns empty string on bad base64', () => {
  assert.equal(decodeBody('!!!', true), '');
});

test('decodeBody returns empty string when Buffer.from throws', () => {
  assert.equal(decodeBody({} as unknown as string, true), '');
});

test('parseMatrixMessagesFromBody extracts messages from sync body', () => {
  const body = JSON.stringify({
    rooms: {
      join: {
        '!room:reddit.com': {
          timeline: {
            events: [
              { type: 'm.room.message', event_id: 'e1', sender: '@u1:reddit.com', origin_server_ts: 1710000000000, content: { body: 'hello' } },
              { type: 'm.room.member', event_id: 'e2', sender: '@u2:reddit.com' },
            ],
          },
        },
      },
    },
  });

  const messages = parseMatrixMessagesFromBody(body);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, 'hello');
  assert.equal(messages[0].eventId, 'e1');
});

test('parseMatrixMessagesFromBody extracts messages from chunk array', () => {
  const body = JSON.stringify({
    chunk: [
      { type: 'm.room.message', event_id: 'e1', sender: '@u1:reddit.com', origin_server_ts: 1710000000000, content: { body: 'chunk msg' } },
    ],
  });

  const messages = parseMatrixMessagesFromBody(body);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, 'chunk msg');
});

test('parseMatrixMessagesFromBody returns empty for invalid JSON', () => {
  assert.deepEqual(parseMatrixMessagesFromBody('not json'), []);
});

test('parseMatrixMessagesFromBody handles non-object timeline', () => {
  const body = JSON.stringify({
    rooms: {
      join: {
        '!room:reddit.com': {
          timeline: 'bad',
        },
      },
    },
  });
  assert.deepEqual(parseMatrixMessagesFromBody(body), []);
});

test('parseMatrixMessagesFromBody skips non-object event candidates in timeline', () => {
  const body = JSON.stringify({
    rooms: {
      join: {
        '!room:reddit.com': {
          timeline: {
            events: [null, 'string', { type: 'm.room.message', event_id: 'e1', sender: '@u1:reddit.com', origin_server_ts: 1710000000000, content: { body: 'hello' } }],
          },
        },
      },
    },
  });
  const messages = parseMatrixMessagesFromBody(body);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, 'hello');
});

test('parseMatrixMessagesFromBody skips non-object event candidates in chunk', () => {
  const body = JSON.stringify({
    chunk: [null, 'string', { type: 'm.room.message', event_id: 'e1', sender: '@u1:reddit.com', origin_server_ts: 1710000000000, content: { body: 'chunk msg' } }],
  });
  const messages = parseMatrixMessagesFromBody(body);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, 'chunk msg');
});

test('parseMatrixMessagesFromBody returns empty for non-object parsed body', () => {
  assert.deepEqual(parseMatrixMessagesFromBody('123'), []);
});

test('parseMatrixMessagesFromBody returns empty when rooms missing', () => {
  assert.deepEqual(parseMatrixMessagesFromBody(JSON.stringify({})), []);
});

test('parseMatrixMessagesFromBody returns empty when join missing', () => {
  assert.deepEqual(parseMatrixMessagesFromBody(JSON.stringify({ rooms: {} })), []);
});

test('parseMatrixMessagesFromBody handles non-object room value', () => {
  const body = JSON.stringify({
    rooms: {
      join: {
        '!room:reddit.com': 'bad',
      },
    },
  });
  assert.deepEqual(parseMatrixMessagesFromBody(body), []);
});

test('parseMatrixMessagesFromBody handles non-array timeline events', () => {
  const body = JSON.stringify({
    rooms: {
      join: {
        '!room:reddit.com': {
          timeline: { events: 'bad' },
        },
      },
    },
  });
  assert.deepEqual(parseMatrixMessagesFromBody(body), []);
});

test('parseMatrixMessagesFromBody skips events without m.room.message type', () => {
  const body = JSON.stringify({
    rooms: {
      join: {
        '!room:reddit.com': {
          timeline: {
            events: [
              { type: 'm.room.member', event_id: 'e1', sender: '@u1:reddit.com' },
            ],
          },
        },
      },
    },
  });
  assert.deepEqual(parseMatrixMessagesFromBody(body), []);
});

test('parseMatrixMessagesFromBody skips events with non-object content', () => {
  const body = JSON.stringify({
    rooms: {
      join: {
        '!room:reddit.com': {
          timeline: {
            events: [
              { type: 'm.room.message', event_id: 'e1', sender: '@u1:reddit.com', content: 'bad' },
            ],
          },
        },
      },
    },
  });
  assert.deepEqual(parseMatrixMessagesFromBody(body), []);
});

test('parseMatrixMessagesFromBody skips events with empty text', () => {
  const body = JSON.stringify({
    rooms: {
      join: {
        '!room:reddit.com': {
          timeline: {
            events: [
              { type: 'm.room.message', event_id: 'e1', sender: '@u1:reddit.com', content: { body: '   ' } },
            ],
          },
        },
      },
    },
  });
  assert.deepEqual(parseMatrixMessagesFromBody(body), []);
});

test('parseMatrixMessagesFromBody handles missing origin_server_ts', () => {
  const body = JSON.stringify({
    rooms: {
      join: {
        '!room:reddit.com': {
          timeline: {
            events: [
              { type: 'm.room.message', event_id: 'e1', sender: '@u1:reddit.com', content: { body: 'hello' } },
            ],
          },
        },
      },
    },
  });
  const messages = parseMatrixMessagesFromBody(body);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].createdAt, undefined);
});

test('parseMatrixMessagesFromBody handles missing event_id', () => {
  const body = JSON.stringify({
    chunk: [
      { type: 'm.room.message', sender: '@u1:reddit.com', origin_server_ts: 1710000000000, content: { body: 'hello' } },
    ],
  });
  const messages = parseMatrixMessagesFromBody(body);
  assert.equal(messages[0].eventId, undefined);
});

test('summarizeUnknownData handles object with array value', () => {
  assert.equal(summarizeUnknownData({ a: [1, 2] }), 'a=array(2)');
});

test('inferActor falls back to peerId', () => {
  assert.equal(inferActor({ peerId: 'pid' }), 'pid');
});

test('inferActor falls back to stateKey', () => {
  assert.equal(inferActor({ stateKey: '@user:reddit.com' }), 'user');
});

test('normalizeSender strips @ and domain', () => {
  assert.equal(normalizeSender('@user:reddit.com'), 'user');
  assert.equal(normalizeSender('user'), 'user');
  assert.equal(normalizeSender(''), 'unknown-sender');
  assert.equal(normalizeSender(undefined), 'unknown-sender');
});

test('inferRecipient maps from field', () => {
  assert.equal(inferRecipient({ from: 'peer' }), 'creator');
  assert.equal(inferRecipient({ from: 'creator' }), 'peer');
  assert.equal(inferRecipient({ peerId: 'p1' }), 'p1');
  assert.equal(inferRecipient({}), 'unknown-recipient');
});

test('normalizeUserId strips @ and domain', () => {
  assert.equal(normalizeUserId('@user:reddit.com'), 'user');
  assert.equal(normalizeUserId(''), 'unknown-sender');
});

test('inferActor resolves sender/senderId/peerId/stateKey', () => {
  assert.equal(inferActor({ sender: '@user:reddit.com' }), 'user');
  assert.equal(inferActor({ senderId: 'sid' }), 'sid');
  assert.equal(inferActor({ peerId: 'pid' }), 'pid');
  assert.equal(inferActor({ stateKey: '@user:reddit.com' }), 'user');
  assert.equal(inferActor({}), 'unknown-sender');
});

test('summarizeUnknownData handles all types', () => {
  assert.equal(summarizeUnknownData(undefined), 'no-data');
  assert.equal(summarizeUnknownData(null), 'null');
  assert.equal(summarizeUnknownData('hello'), 'hello');
  assert.equal(summarizeUnknownData(42), '42');
  assert.equal(summarizeUnknownData(true), 'true');
  assert.equal(summarizeUnknownData([1, 2, 3]), 'array(3)');
  assert.equal(summarizeUnknownData({ a: 1, b: 'text' }), 'a=1 b=text');
  assert.ok(summarizeUnknownData({ a: { nested: true } }).includes('object'));
});

test('parseMatrixMessagesFromBody handles non-object rooms', () => {
  const body = JSON.stringify({ rooms: 'bad' });
  assert.deepEqual(parseMatrixMessagesFromBody(body), []);
});

test('normalizeSender handles empty name after split', () => {
  assert.equal(normalizeSender('@:reddit.com'), 'unknown-sender');
});

test('normalizeUserId handles empty name after split', () => {
  assert.equal(normalizeUserId('@:reddit.com'), 'unknown-sender');
});

test('summarizeUnknownData handles object with null value', () => {
  assert.equal(summarizeUnknownData({ a: null }), 'a=null');
});
