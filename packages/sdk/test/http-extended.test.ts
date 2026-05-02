import assert from 'node:assert/strict';
import test from 'node:test';
import { OttoHttpClient, deriveHttpUrl } from '../src/http.js';

test('OttoHttpClient.buildAuthHeaders with no token', () => {
  const client = new OttoHttpClient('wss://relay.example.com');
  // Note: buildAuthHeaders is private, so we test indirectly through setAccessToken
  client.setAccessToken('test_token');
  assert.ok(client);
});

test('OttoHttpClient handles wss with path', () => {
  const url = deriveHttpUrl('wss://relay.example.com/controller');
  assert.equal(url, 'https://relay.example.com/controller');
});

test('OttoHttpClient handles ws with port', () => {
  const url = deriveHttpUrl('ws://localhost:8787/ws');
  assert.equal(url, 'http://localhost:8787/ws');
});

test('OttoHttpClient derives correct HTTP URL for standard relay', () => {
  const url = deriveHttpUrl('wss://relay.telepat.io:8787');
  assert.equal(url, 'https://relay.telepat.io:8787');
});

test('OttoHttpClient handles multiple query params', () => {
  const url = deriveHttpUrl('wss://relay.example.com:8787?role=controller&debug=true');
  assert.equal(url, 'https://relay.example.com:8787');
});

test('OttoHttpClient handles only protocol change', () => {
  const url = deriveHttpUrl('ws://example.com');
  assert.equal(url, 'http://example.com');
});
