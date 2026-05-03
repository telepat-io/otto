import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildExtractContentRequest,
  parseDistillMode,
  parseExtractContentFormat,
} from '../src/content-extraction.js';

test('parseExtractContentFormat defaults to markdown', () => {
  assert.equal(parseExtractContentFormat(undefined), 'markdown');
});

test('parseExtractContentFormat rejects unsupported values', () => {
  assert.throws(() => parseExtractContentFormat('xml'), /--format must be one of/);
});

test('parseDistillMode defaults to readability', () => {
  assert.equal(parseDistillMode(undefined), 'readability');
});

test('parseDistillMode rejects unsupported values', () => {
  assert.throws(() => parseDistillMode('fast'), /--distill-mode must be one of/);
});

test('buildExtractContentRequest maps markdown format to markdown primitive', () => {
  const request = buildExtractContentRequest({ format: 'markdown', url: 'https://example.com' });
  assert.equal(request.action, 'primitive.dom.extract_markdown');
  assert.equal(request.requiresTemporaryTextTab, false);
  assert.equal(request.payload.mode, 'readability');
});

test('buildExtractContentRequest maps distilled_html format to distilled primitive', () => {
  const request = buildExtractContentRequest({ format: 'distilled_html', url: 'https://example.com', distillMode: 'dom-distiller' });
  assert.equal(request.action, 'primitive.dom.extract_distilled_html');
  assert.equal(request.payload.mode, 'dom-distiller');
});

test('buildExtractContentRequest maps raw_html format with selector', () => {
  const request = buildExtractContentRequest({ format: 'raw_html', tabSessionId: 'tab_1', selector: '#root' });
  assert.equal(request.action, 'primitive.dom.extract_html');
  assert.equal(request.payload.selector, '#root');
});

test('buildExtractContentRequest maps text format and requires temp tab when no tab session is provided', () => {
  const request = buildExtractContentRequest({ format: 'text', url: 'https://example.com' });
  assert.equal(request.action, 'primitive.dom.extract_text');
  assert.equal(request.requiresTemporaryTextTab, true);
  assert.equal(request.payload.selector, 'body');
});

test('buildExtractContentRequest rejects when url and tabSession are both missing', () => {
  assert.throws(
    () => buildExtractContentRequest({ format: 'markdown' }),
    /Provide a URL argument or --tab-session/,
  );
});

test('buildExtractContentRequest rejects selector for markdown extraction', () => {
  assert.throws(
    () => buildExtractContentRequest({ format: 'markdown', url: 'https://example.com', selector: '#main' }),
    /--selector is only supported/,
  );
});

test('buildExtractContentRequest rejects maxChars for text extraction', () => {
  assert.throws(
    () => buildExtractContentRequest({ format: 'text', tabSessionId: 'tab_1', maxChars: 2000 }),
    /--max-chars is not supported for text extraction/,
  );
});

test('buildExtractContentRequest maps distilled_html with maxChars', () => {
  const request = buildExtractContentRequest({
    format: 'distilled_html',
    url: 'https://example.com',
    maxChars: 5000,
  });
  assert.equal(request.action, 'primitive.dom.extract_distilled_html');
  assert.equal(request.payload.maxChars, 5000);
  assert.equal(request.payload.fallbackToReadability, true);
});

test('buildExtractContentRequest maps markdown with maxChars', () => {
  const request = buildExtractContentRequest({
    format: 'markdown',
    tabSessionId: 'tab_1',
    maxChars: 3000,
  });
  assert.equal(request.action, 'primitive.dom.extract_markdown');
  assert.equal(request.payload.maxChars, 3000);
});

test('buildExtractContentRequest maps raw_html with maxChars', () => {
  const request = buildExtractContentRequest({
    format: 'raw_html',
    url: 'https://example.com',
    selector: '#content',
    maxChars: 10000,
  });
  assert.equal(request.action, 'primitive.dom.extract_html');
  assert.equal(request.payload.maxChars, 10000);
  assert.equal(request.payload.selector, '#content');
});

test('buildExtractContentRequest defaults raw_html selector to body when selector is omitted', () => {
  const request = buildExtractContentRequest({
    format: 'raw_html',
    tabSessionId: 'tab_1',
  });
  assert.equal(request.payload.selector, 'body');
});

test('buildExtractContentRequest normalizes empty selector string to undefined', () => {
  const request = buildExtractContentRequest({
    format: 'raw_html',
    tabSessionId: 'tab_1',
    selector: '   ',
  });
  assert.equal(request.payload.selector, 'body');
});

test('buildExtractContentRequest maps text format with tabSessionId', () => {
  const request = buildExtractContentRequest({
    format: 'text',
    tabSessionId: 'tab_1',
  });
  assert.equal(request.action, 'primitive.dom.extract_text');
  assert.equal(request.requiresTemporaryTextTab, false);
  assert.equal(request.payload.tabSessionId, 'tab_1');
});

test('buildExtractContentRequest rejects distill-mode for raw_html', () => {
  assert.throws(
    () => buildExtractContentRequest({
      format: 'raw_html',
      url: 'https://example.com',
      distillMode: 'readability',
    }),
    /--distill-mode is only supported/,
  );
});

test('buildExtractContentRequest rejects fallback-to-readability for text format', () => {
  assert.throws(
    () => buildExtractContentRequest({
      format: 'text',
      url: 'https://example.com',
      fallbackToReadability: true,
    }),
    /--fallback-to-readability is only supported/,
  );
});

test('parseDistillMode accepts readability mode', () => {
  assert.equal(parseDistillMode('readability'), 'readability');
});

test('parseExtractContentFormat handles lowercase input', () => {
  assert.equal(parseExtractContentFormat('markdown'), 'markdown');
});