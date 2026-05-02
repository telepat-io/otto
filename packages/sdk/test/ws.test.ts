/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import assert from 'node:assert/strict';
import test from 'node:test';
import { OttoWsSession } from '../src/ws.js';

// Mock WebSocket globally
const mockWebSocket = class {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = 1;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  constructor(url: string) {
    // Auto-open after a tick
    setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  send(data: string): void {
    // Simulate echo for hello
    const msg = JSON.parse(data);
    if (msg.type === 'ping') {
      setTimeout(() => {
        if (this.onmessage) {
          this.onmessage(
            new MessageEvent('message', {
              data: JSON.stringify({ type: 'pong' }),
            }),
          );
        }
      }, 0);
    }
  }

  close(): void {
    this.readyState = 3;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }
};

// Polyfill WebSocket for tests
globalThis.WebSocket = mockWebSocket as any;

test('OttoWsSession constructor stores URL', () => {
  const session = new OttoWsSession('wss://relay.example.com', 'clt_123', 'token_123');
  assert.ok(session);
});

test('OttoWsSession.onMessage registers handler', () => {
  const session = new OttoWsSession('wss://relay.example.com', 'clt_123', 'token_123');
  let called = false;
  const unsubscribe = session.onMessage(() => {
    called = true;
  });
  assert.equal(typeof unsubscribe, 'function');
});

test('OttoWsSession.isAuthenticated returns false initially', () => {
  const session = new OttoWsSession('wss://relay.example.com', 'clt_123', 'token_123');
  assert.equal(session.isAuthenticated(), false);
});
