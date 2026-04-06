import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnvelope, type Envelope } from '@telepat/otto-protocol';
import { createRecipeTestStreamRenderer } from '../src/test-stream-format.js';

function envelope(messageType: Envelope['messageType'], payload: unknown, requestId = 'req-1'): Envelope {
  return createEnvelope(messageType, 'controller', requestId, payload);
}

test('generic listener updates render readable summary lines', () => {
  const renderer = createRecipeTestStreamRenderer({
    site: 'example.com',
    recipe: 'getData',
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
    }, 'recipe-req-1'),
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[12:00:00Z\]/);
  assert.match(lines[0], /update:network\.response/);
  assert.match(lines[0], /status=200/);
});

test('reddit getChatMessages update renders network and chat lines with sender and text', () => {
  const renderer = createRecipeTestStreamRenderer({
    site: 'reddit.com',
    recipe: 'getChatMessages',
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
  }, 'recipe-req-2');

  const first = renderer.renderListenerUpdate(updateFrame);
  assert.equal(first.length, 2);
  assert.match(first[0], /net:network\.response/);
  assert.match(first[0], /GET \| 200/);
  assert.match(first[1], /alice: hello world from alice/);

  const second = renderer.renderListenerUpdate(updateFrame);
  assert.equal(second.length, 1);
  assert.match(second[0], /net:network\.response/);
});

test('json output mode preserves full frame object output', () => {
  const renderer = createRecipeTestStreamRenderer({
    site: 'reddit.com',
    recipe: 'getChatMessages',
    jsonOutput: true,
    useColor: false,
  });

  const frame = envelope('result', {
    ok: true,
    action: 'recipe.test',
    durationMs: 50,
    commandOutcome: 'completed',
  }, 'recipe-req-3');

  const lines = renderer.renderTerminalResponse(frame);
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]) as { messageType: string; requestId: string };
  assert.equal(parsed.messageType, 'result');
  assert.equal(parsed.requestId, 'recipe-req-3');
});
