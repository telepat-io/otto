import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEnvInt } from '../../src/relay-config.js';

test('parseEnvInt returns fallback when env var missing', () => {
  assert.equal(parseEnvInt('OTTO_TEST_MISSING_VAR_XYZ', 42), 42);
});

test('parseEnvInt returns parsed value when valid', () => {
  process.env.OTTO_TEST_PARSE_INT = '99';
  assert.equal(parseEnvInt('OTTO_TEST_PARSE_INT', 42), 99);
  delete process.env.OTTO_TEST_PARSE_INT;
});

test('parseEnvInt returns fallback for non-integer', () => {
  process.env.OTTO_TEST_PARSE_INT = '3.14';
  assert.equal(parseEnvInt('OTTO_TEST_PARSE_INT', 42), 42);
  delete process.env.OTTO_TEST_PARSE_INT;
});

test('parseEnvInt returns fallback for non-numeric', () => {
  process.env.OTTO_TEST_PARSE_INT = 'abc';
  assert.equal(parseEnvInt('OTTO_TEST_PARSE_INT', 42), 42);
  delete process.env.OTTO_TEST_PARSE_INT;
});

test('parseEnvInt returns fallback for value below min', () => {
  process.env.OTTO_TEST_PARSE_INT = '0';
  assert.equal(parseEnvInt('OTTO_TEST_PARSE_INT', 42, 1), 42);
  delete process.env.OTTO_TEST_PARSE_INT;
});

test('parseEnvInt returns fallback for value above max', () => {
  process.env.OTTO_TEST_PARSE_INT = '200';
  assert.equal(parseEnvInt('OTTO_TEST_PARSE_INT', 42, 1, 100), 42);
  delete process.env.OTTO_TEST_PARSE_INT;
});

test('parseEnvInt returns value within min/max range', () => {
  process.env.OTTO_TEST_PARSE_INT = '50';
  assert.equal(parseEnvInt('OTTO_TEST_PARSE_INT', 42, 1, 100), 50);
  delete process.env.OTTO_TEST_PARSE_INT;
});

test('parseEnvInt handles Infinity', () => {
  process.env.OTTO_TEST_PARSE_INT = 'Infinity';
  assert.equal(parseEnvInt('OTTO_TEST_PARSE_INT', 42), 42);
  delete process.env.OTTO_TEST_PARSE_INT;
});
