import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { createBearerAuthMiddleware, createOriginValidator } from '../src/mcp/http-middleware.js';

interface FakeRes {
  statusCode: number;
  jsonData: unknown;
  status(code: number): FakeRes;
  json(data: unknown): FakeRes;
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 0,
    jsonData: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.jsonData = data;
      return res;
    },
  };
  return res;
}

function makeReq(headers: Record<string, string | undefined>): Request {
  return { headers } as unknown as Request;
}

function makeNext() {
  let called = false;
  const next = () => {
    called = true;
  };
  return { next, wasCalled: () => called };
}

test('bearer auth rejects missing Authorization header', () => {
  const middleware = createBearerAuthMiddleware('secret');
  const res = makeRes();
  const { next, wasCalled } = makeNext();

  middleware(makeReq({}), res as unknown as Response, next);

  assert.equal(res.statusCode, 401);
  assert.match((res.jsonData as { error: { message: string } }).error.message, /Unauthorized/);
  assert.equal(wasCalled(), false);
});

test('bearer auth rejects non-Bearer Authorization header', () => {
  const middleware = createBearerAuthMiddleware('secret');
  const res = makeRes();
  const { next, wasCalled } = makeNext();

  middleware(makeReq({ authorization: 'Basic abc' }), res as unknown as Response, next);

  assert.equal(res.statusCode, 401);
  assert.equal(wasCalled(), false);
});

test('bearer auth rejects empty Bearer token', () => {
  const middleware = createBearerAuthMiddleware('secret');
  const res = makeRes();
  const { next, wasCalled } = makeNext();

  middleware(makeReq({ authorization: 'Bearer ' }), res as unknown as Response, next);

  assert.equal(res.statusCode, 403);
  assert.equal(wasCalled(), false);
});

test('bearer auth rejects wrong API key', () => {
  const middleware = createBearerAuthMiddleware('secret');
  const res = makeRes();
  const { next, wasCalled } = makeNext();

  middleware(makeReq({ authorization: 'Bearer wrong' }), res as unknown as Response, next);

  assert.equal(res.statusCode, 403);
  assert.match((res.jsonData as { error: { message: string } }).error.message, /Forbidden/);
  assert.equal(wasCalled(), false);
});

test('bearer auth calls next on valid API key', () => {
  const middleware = createBearerAuthMiddleware('secret');
  const res = makeRes();
  const { next, wasCalled } = makeNext();

  middleware(makeReq({ authorization: 'Bearer secret' }), res as unknown as Response, next);

  assert.equal(res.statusCode, 0);
  assert.equal(wasCalled(), true);
});

test('origin validator passes when no Origin header', () => {
  const middleware = createOriginValidator('127.0.0.1', 3001);
  const res = makeRes();
  const { next, wasCalled } = makeNext();

  middleware(makeReq({}), res as unknown as Response, next);

  assert.equal(wasCalled(), true);
  assert.equal(res.statusCode, 0);
});

test('origin validator passes for an allowed origin', () => {
  const middleware = createOriginValidator('127.0.0.1', 3001);
  const res = makeRes();
  const { next, wasCalled } = makeNext();

  middleware(makeReq({ origin: 'http://127.0.0.1:3001' }), res as unknown as Response, next);

  assert.equal(wasCalled(), true);
  assert.equal(res.statusCode, 0);
});

test('origin validator rejects a disallowed origin', () => {
  const middleware = createOriginValidator('127.0.0.1', 3001);
  const res = makeRes();
  const { next, wasCalled } = makeNext();

  middleware(makeReq({ origin: 'http://evil.example.com' }), res as unknown as Response, next);

  assert.equal(res.statusCode, 403);
  assert.match((res.jsonData as { error: { message: string } }).error.message, /Origin not allowed/);
  assert.equal(wasCalled(), false);
});
