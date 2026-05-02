import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveHttpUrl, OttoHttpClient } from '../src/http.js';

test('deriveHttpUrl converts wss:// to https://', () => {
  const httpUrl = deriveHttpUrl('wss://relay.example.com:8787');
  assert.equal(httpUrl, 'https://relay.example.com:8787');
});

test('deriveHttpUrl converts ws:// to http://', () => {
  const httpUrl = deriveHttpUrl('ws://localhost:8787');
  assert.equal(httpUrl, 'http://localhost:8787');
});

test('deriveHttpUrl removes trailing slash', () => {
  const httpUrl = deriveHttpUrl('wss://relay.example.com/');
  assert.equal(httpUrl, 'https://relay.example.com');
});

test('deriveHttpUrl removes query params', () => {
  const httpUrl = deriveHttpUrl('wss://relay.example.com:8787?role=controller');
  assert.equal(httpUrl, 'https://relay.example.com:8787');
});

test('OttoHttpClient constructor stores HTTP URL', () => {
  const client = new OttoHttpClient('wss://relay.example.com');
  assert.ok(client);
});

test('OttoHttpClient.setAccessToken stores token', () => {
  const client = new OttoHttpClient('wss://relay.example.com');
  client.setAccessToken('test_token_123');
  assert.ok(client);
});
