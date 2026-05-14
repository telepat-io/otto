import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  ottoStatusToolInputSchema,
  ottoCommandsListToolInputSchema,
  ottoCmdToolInputSchema,
  ottoTestToolInputSchema,
  ottoScreenshotToolInputSchema,
  ottoExtractContentToolInputSchema,
  ottoLogsListToolInputSchema,
  ottoLogsFollowToolInputSchema,
  ottoLogsExportToolInputSchema,
  ottoListenerSubscribeNetworkToolInputSchema,
  ottoListenerUnsubscribeToolInputSchema,
  ottoSetupToolInputSchema,
  ottoStartToolInputSchema,
  ottoStopToolInputSchema,
  ottoConfigToolInputSchema,
  ottoPairToolInputSchema,
  ottoAuthcodeToolInputSchema,
  ottoRevokeToolInputSchema,
  ottoClientRegisterToolInputSchema,
  ottoClientLoginToolInputSchema,
  ottoClientStatusToolInputSchema,
  ottoClientForgetToolInputSchema,
  ottoClientRemoveToolInputSchema,
  ottoExtensionUpdateToolInputSchema,
  ottoExtensionInfoToolInputSchema,
  ottoToolContracts,
} from '../src/mcp/tools.js';

function validateSchema(schema: Record<string, unknown>, input: Record<string, unknown>): boolean {
  const zodSchema = z.object(schema as Record<string, z.ZodTypeAny>);
  const result = zodSchema.safeParse(input);
  return result.success;
}

test('otto_status schema accepts empty input', () => {
  assert.equal(validateSchema(ottoStatusToolInputSchema, {}), true);
});

test('otto_status schema accepts nodes flag', () => {
  assert.equal(validateSchema(ottoStatusToolInputSchema, { nodes: true }), true);
});

test('otto_commands_list schema accepts empty input', () => {
  assert.equal(validateSchema(ottoCommandsListToolInputSchema, {}), true);
});

test('otto_commands_list schema accepts optional fields', () => {
  assert.equal(validateSchema(ottoCommandsListToolInputSchema, { nodeId: 'node_1', site: 'reddit.com', timeout: 5000 }), true);
});

test('otto_cmd schema requires action', () => {
  assert.equal(validateSchema(ottoCmdToolInputSchema, {}), false);
  assert.equal(validateSchema(ottoCmdToolInputSchema, { action: 'primitive.tab.open' }), true);
});

test('otto_cmd schema accepts all optional fields', () => {
  assert.equal(validateSchema(ottoCmdToolInputSchema, {
    action: 'command.run',
    tabSession: 'tab_123',
    nodeId: 'node_1',
    payload: '{"site":"reddit.com"}',
    timeout: 30000,
  }), true);
});

test('otto_test schema requires site and command', () => {
  assert.equal(validateSchema(ottoTestToolInputSchema, {}), false);
  assert.equal(validateSchema(ottoTestToolInputSchema, { site: 'reddit.com' }), false);
  assert.equal(validateSchema(ottoTestToolInputSchema, { site: 'reddit.com', command: 'getFeed' }), true);
});

test('otto_test schema accepts all optional fields', () => {
  assert.equal(validateSchema(ottoTestToolInputSchema, {
    site: 'reddit.com',
    command: 'getFeed',
    nodeId: 'node_1',
    payload: '{"minReturnedPosts":10}',
    timeout: 30000,
    controllerName: 'test',
    controllerDescription: 'test controller',
    cleanupTestController: true,
    authMode: 'auto',
    streamFollowMs: 5000,
    streamProbe: true,
    streamListenerMode: 'network',
  }), true);
});

test('otto_test schema rejects invalid authMode', () => {
  assert.equal(validateSchema(ottoTestToolInputSchema, {
    site: 'reddit.com',
    command: 'getFeed',
    authMode: 'invalid',
  }), false);
});

test('otto_screenshot schema requires url', () => {
  assert.equal(validateSchema(ottoScreenshotToolInputSchema, {}), false);
  assert.equal(validateSchema(ottoScreenshotToolInputSchema, { url: 'https://example.com' }), true);
});

test('otto_extract_content schema accepts url-only input', () => {
  assert.equal(validateSchema(ottoExtractContentToolInputSchema, { url: 'https://example.com' }), true);
});

test('otto_extract_content schema accepts tabSession-only input', () => {
  assert.equal(validateSchema(ottoExtractContentToolInputSchema, { tabSession: 'tab_123' }), true);
});

test('otto_extract_content schema accepts all optional fields', () => {
  assert.equal(validateSchema(ottoExtractContentToolInputSchema, {
    tabSession: 'tab_123',
    format: 'markdown',
    distillMode: 'dom-distiller',
    fallbackToReadability: true,
    maxChars: 200000,
    nodeId: 'node_1',
    timeout: 45000,
  }), true);
});

test('otto_extract_content schema rejects invalid format', () => {
  assert.equal(validateSchema(ottoExtractContentToolInputSchema, {
    url: 'https://example.com',
    format: 'html',
  }), false);
});

test('otto_logs_list schema accepts all filter options', () => {
  assert.equal(validateSchema(ottoLogsListToolInputSchema, {
    since: '2026-01-01',
    level: 'error',
    source: 'node',
    latest: 50,
    nodeId: 'node_1',
    requestId: 'req_123',
  }), true);
});

test('otto_logs_list schema rejects invalid level', () => {
  assert.equal(validateSchema(ottoLogsListToolInputSchema, { level: 'invalid' }), false);
});

test('otto_logs_list schema rejects invalid source', () => {
  assert.equal(validateSchema(ottoLogsListToolInputSchema, { source: 'invalid' }), false);
});

test('otto_logs_follow schema accepts empty input', () => {
  assert.equal(validateSchema(ottoLogsFollowToolInputSchema, {}), true);
});

test('otto_logs_export schema accepts empty input', () => {
  assert.equal(validateSchema(ottoLogsExportToolInputSchema, {}), true);
});

test('otto_listener_subscribe_network schema requires tabSession and site', () => {
  assert.equal(validateSchema(ottoListenerSubscribeNetworkToolInputSchema, {}), false);
  assert.equal(validateSchema(ottoListenerSubscribeNetworkToolInputSchema, { tabSession: 'tab_1' }), false);
  assert.equal(validateSchema(ottoListenerSubscribeNetworkToolInputSchema, { tabSession: 'tab_1', site: 'reddit.com' }), true);
});

test('otto_listener_subscribe_network schema accepts all optional fields', () => {
  assert.equal(validateSchema(ottoListenerSubscribeNetworkToolInputSchema, {
    tabSession: 'tab_1',
    site: 'reddit.com',
    pattern: 'https://*.reddit.com/*',
    requestHost: 'api.reddit.com',
    mode: 'network',
    maxBodyBytes: 100000,
    includeHeaders: true,
    includeBody: true,
    mime: 'application/json',
    nodeId: 'node_1',
    timeout: 30000,
    followMs: 10000,
  }), true);
});

test('otto_listener_subscribe_network schema rejects invalid mode', () => {
  assert.equal(validateSchema(ottoListenerSubscribeNetworkToolInputSchema, {
    tabSession: 'tab_1',
    site: 'reddit.com',
    mode: 'invalid',
  }), false);
});

test('otto_listener_unsubscribe schema requires targetRequestId', () => {
  assert.equal(validateSchema(ottoListenerUnsubscribeToolInputSchema, {}), false);
  assert.equal(validateSchema(ottoListenerUnsubscribeToolInputSchema, { targetRequestId: 'req_123' }), true);
});

test('otto_setup schema accepts empty input', () => {
  assert.equal(validateSchema(ottoSetupToolInputSchema, {}), true);
});

test('otto_start schema accepts empty input', () => {
  assert.equal(validateSchema(ottoStartToolInputSchema, {}), true);
});

test('otto_stop schema accepts empty input', () => {
  assert.equal(validateSchema(ottoStopToolInputSchema, {}), true);
});

test('otto_config schema accepts empty input', () => {
  assert.equal(validateSchema(ottoConfigToolInputSchema, {}), true);
});

test('otto_pair schema requires code', () => {
  assert.equal(validateSchema(ottoPairToolInputSchema, {}), false);
  assert.equal(validateSchema(ottoPairToolInputSchema, { code: '123-456' }), true);
});

test('otto_authcode schema accepts empty input', () => {
  assert.equal(validateSchema(ottoAuthcodeToolInputSchema, {}), true);
});

test('otto_revoke schema accepts empty input', () => {
  assert.equal(validateSchema(ottoRevokeToolInputSchema, {}), true);
});

test('otto_client_register schema accepts empty input', () => {
  assert.equal(validateSchema(ottoClientRegisterToolInputSchema, {}), true);
});

test('otto_client_login schema accepts empty input', () => {
  assert.equal(validateSchema(ottoClientLoginToolInputSchema, {}), true);
});

test('otto_client_status schema accepts empty input', () => {
  assert.equal(validateSchema(ottoClientStatusToolInputSchema, {}), true);
});

test('otto_client_forget schema accepts empty input', () => {
  assert.equal(validateSchema(ottoClientForgetToolInputSchema, {}), true);
});

test('otto_client_remove schema accepts empty input', () => {
  assert.equal(validateSchema(ottoClientRemoveToolInputSchema, {}), true);
});

test('otto_extension_update schema accepts empty input', () => {
  assert.equal(validateSchema(ottoExtensionUpdateToolInputSchema, {}), true);
});

test('otto_extension_info schema accepts empty input', () => {
  assert.equal(validateSchema(ottoExtensionInfoToolInputSchema, {}), true);
});

test('tool contracts count matches registered tools', () => {
  assert.equal(ottoToolContracts.length, 25);
});

test('all tool contracts have required fields', () => {
  for (const contract of ottoToolContracts) {
    assert.ok(contract.name.length > 0, `Tool contract name must not be empty`);
    assert.ok(Array.isArray(contract.required), `Tool ${contract.name} required must be an array`);
    assert.ok(typeof contract.enums === 'object', `Tool ${contract.name} enums must be an object`);
  }
});

test('tool contract names are unique', () => {
  const names = ottoToolContracts.map((c) => c.name);
  const unique = new Set(names);
  assert.equal(names.length, unique.size, 'Tool contract names must be unique');
});
