import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { jwtVerify, SignJWT } from 'jose';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(HERE, '..');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRelay(baseUrl, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`${baseUrl}/api/logs/status`);
      if (resp.status === 200) return;
    } catch {
      // wait and retry until timeout
    }
    await wait(100);
  }
  throw new Error('relay did not become ready in time');
}

function startRelay(port, env = {}) {
  const hasCustomLogDir = typeof env.OTTO_LOG_DIR === 'string' && env.OTTO_LOG_DIR.length > 0;
  const tempLogDir = hasCustomLogDir ? undefined : mkdtempSync(join(tmpdir(), 'otto-relay-it-'));
  const proc = spawn('node', ['dist/index.js'], {
    cwd: PKG_ROOT,
    env: {
      ...process.env,
      OTTO_RELAY_PORT: String(port),
      ...(tempLogDir ? { OTTO_LOG_DIR: tempLogDir } : {}),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (tempLogDir) {
    proc.once('exit', () => {
      rmSync(tempLogDir, { recursive: true, force: true });
    });
  }

  return proc;
}

async function requestPairing(baseUrl, nodeId = 'node_test_suite') {
  const challengeResp = await fetch(`${baseUrl}/api/pairing/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId }),
  });
  assert.equal(challengeResp.status, 200);
  const challenge = await challengeResp.json();
  assert.equal(typeof challenge.code, 'string');

  const approveResp = await fetch(`${baseUrl}/api/pairing/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: challenge.code }),
  });
  assert.equal(approveResp.status, 200);
  return approveResp.json();
}

function nextWsEnvelope(ws, predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('timed out waiting for websocket frame'));
    }, timeoutMs);

    function onMessage(raw) {
      try {
        const msg = JSON.parse(String(raw));
        if (!predicate(msg)) return;
        clearTimeout(timeout);
        ws.off('message', onMessage);
        resolve(msg);
      } catch {
        // ignore malformed test frames
      }
    }

    ws.on('message', onMessage);
  });
}

function waitForWsOpen(ws, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('timed out waiting for websocket open'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      ws.off('open', onOpen);
      ws.off('error', onError);
    }

    function onOpen() {
      cleanup();
      resolve();
    }

    function onError(err) {
      cleanup();
      reject(err);
    }

    ws.on('open', onOpen);
    ws.on('error', onError);
  });
}

function waitForWsError(ws, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('timed out waiting for websocket error'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      ws.off('error', onError);
      ws.off('open', onOpen);
    }

    function onError(err) {
      cleanup();
      resolve(err);
    }

    function onOpen() {
      cleanup();
      reject(new Error('websocket unexpectedly opened'));
    }

    ws.on('error', onError);
    ws.on('open', onOpen);
  });
}

function waitForWsClose(ws, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('timed out waiting for websocket close'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      ws.off('close', onClose);
      ws.off('error', onError);
    }

    function onClose() {
      cleanup();
      resolve();
    }

    function onError(err) {
      cleanup();
      reject(err);
    }

    ws.on('close', onClose);
    ws.on('error', onError);
  });
}

async function connectAuthedNodeWs(port, nodeId, requestPrefix, options = {}) {
  const {
    secret = 'dev-only-change-me',
    issuer = 'otto-relay',
    audience = 'otto-clients',
    scopes = ['*'],
  } = options;

  const accessToken = await new SignJWT({ role: 'node', nodeId, scopes })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret));

  const ws = new WebSocket(`ws://127.0.0.1:${port}/?role=node`);
  await waitForWsOpen(ws);

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'hello',
    requestId: `${requestPrefix}_hello`,
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: { role: 'node', nodeId, capabilities: [] },
  }));
  await nextWsEnvelope(ws, (msg) => msg.messageType === 'hello_ack' && msg.requestId === `${requestPrefix}_hello`);

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'auth',
    requestId: `${requestPrefix}_auth`,
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: { accessToken },
  }));
  await nextWsEnvelope(ws, (msg) => msg.messageType === 'auth_ack' && msg.requestId === `${requestPrefix}_auth`);

  return ws;
}

async function issueNodeAccessToken(nodeId, options = {}) {
  const {
    secret = 'dev-only-change-me',
    issuer = 'otto-relay',
    audience = 'otto-clients',
    scopes = ['*'],
  } = options;

  return new SignJWT({ role: 'node', nodeId, scopes })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret));
}

async function connectAuthedControllerWs(port, accessToken, requestPrefix) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?role=controller`);
  await waitForWsOpen(ws);

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'hello',
    requestId: `${requestPrefix}_hello`,
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { role: 'controller', capabilities: [] },
  }));
  await nextWsEnvelope(ws, (msg) => msg.messageType === 'hello_ack' && msg.requestId === `${requestPrefix}_hello`);

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'auth',
    requestId: `${requestPrefix}_auth`,
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { accessToken },
  }));
  await nextWsEnvelope(ws, (msg) => msg.messageType === 'auth_ack' && msg.requestId === `${requestPrefix}_auth`);

  return ws;
}

function sendExtensionLogEvent(ws, requestId, entry) {
  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId,
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      type: 'extension_log',
      entry,
    },
  }));
}

test('relay pairing and logs endpoints', async (t) => {
  const port = 8799;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);

  const challengeResp = await fetch(`${base}/api/pairing/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId: 'node_test_suite' }),
  });
  assert.equal(challengeResp.status, 200);
  const challenge = await challengeResp.json();
  assert.equal(typeof challenge.code, 'string');

  const pendingResp = await fetch(`${base}/api/pairing/pending`);
  assert.equal(pendingResp.status, 200);
  const pending = await pendingResp.json();
  assert.ok(Array.isArray(pending.pending));
  assert.ok(pending.pending.length >= 1);

  const logsStatusResp = await fetch(`${base}/api/logs/status`);
  assert.equal(logsStatusResp.status, 200);
  const logsStatus = await logsStatusResp.json();
  assert.equal(typeof logsStatus.totalEvents, 'number');

  const exportResp = await fetch(`${base}/api/logs/export`);
  assert.equal(exportResp.status, 200);
  const exportBody = await exportResp.text();
  assert.equal(typeof exportBody, 'string');
});

test('connected nodes endpoint is controller-authenticated and reports live node sessions', async (t) => {
  const port = 8830;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const pairing = await requestPairing(base, 'node_connected_nodes_suite');

  const unauthResp = await fetch(`${base}/api/nodes/connected`);
  assert.equal(unauthResp.status, 401);

  const preConnectResp = await fetch(`${base}/api/nodes/connected`, {
    headers: {
      authorization: `Bearer ${pairing.controllerAccessToken}`,
    },
  });
  assert.equal(preConnectResp.status, 200);
  const preConnectBody = await preConnectResp.json();
  assert.deepEqual(preConnectBody, { nodes: [] });

  const nodeWs = await connectAuthedNodeWs(port, 'node_connected_nodes_suite', 'connected_nodes_suite');
  t.after(() => {
    nodeWs.close();
  });

  const connectedResp = await fetch(`${base}/api/nodes/connected`, {
    headers: {
      authorization: `Bearer ${pairing.controllerAccessToken}`,
    },
  });
  assert.equal(connectedResp.status, 200);
  const connectedBody = await connectedResp.json();
  assert.deepEqual(connectedBody, { nodes: [{ nodeId: 'node_connected_nodes_suite' }] });
});

test('pairing approval is first-wins and later approvals conflict deterministically', async (t) => {
  const port = 8820;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);

  const challengeResp = await fetch(`${base}/api/pairing/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId: 'node_pairing_conflict_suite' }),
  });
  assert.equal(challengeResp.status, 200);
  const challenge = await challengeResp.json();

  const firstApprove = await fetch(`${base}/api/pairing/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: challenge.code }),
  });
  assert.equal(firstApprove.status, 200);

  const secondApprove = await fetch(`${base}/api/pairing/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: challenge.code }),
  });
  assert.equal(secondApprove.status, 409);
  const secondApproveBody = await secondApprove.json();
  assert.equal(secondApproveBody.error, 'pairing_not_pending');
});

test('controller auth rejects malformed access token', async (t) => {
  const port = 8821;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?role=controller`);

  t.after(() => {
    ws.close();
  });

  await waitForWsOpen(ws);

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'hello',
    requestId: 'hello_invalid_token_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { role: 'controller', capabilities: [] },
  }));
  await nextWsEnvelope(ws, (msg) => msg.messageType === 'hello_ack' && msg.requestId === 'hello_invalid_token_1');

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'auth',
    requestId: 'auth_invalid_token_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { accessToken: 'not-a-jwt' },
  }));

  const authError = await nextWsEnvelope(ws, (msg) => msg.messageType === 'error' && msg.requestId === 'auth_invalid_token_1');
  assert.equal(authError.payload?.code, 'invalid_access_token');
});

test('controller auth rejects expired access token', async (t) => {
  const port = 8822;
  const base = `http://127.0.0.1:${port}`;
  const secret = 'expired-token-suite-secret';
  const issuer = 'otto-expired-suite';
  const audience = 'otto-expired-clients';
  const proc = startRelay(port, {
    OTTO_TOKEN_SECRET: secret,
    OTTO_TOKEN_ISSUER: issuer,
    OTTO_TOKEN_AUDIENCE: audience,
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const expiredToken = await new SignJWT({
    role: 'controller',
    controllerId: 'ctl_expired_suite',
    scopes: ['primitive.tab.query'],
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(new TextEncoder().encode(secret));

  const ws = new WebSocket(`ws://127.0.0.1:${port}/?role=controller`);

  t.after(() => {
    ws.close();
  });

  await waitForWsOpen(ws);

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'hello',
    requestId: 'hello_expired_token_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { role: 'controller', capabilities: [] },
  }));
  await nextWsEnvelope(ws, (msg) => msg.messageType === 'hello_ack' && msg.requestId === 'hello_expired_token_1');

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'auth',
    requestId: 'auth_expired_token_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { accessToken: expiredToken },
  }));

  const authError = await nextWsEnvelope(ws, (msg) => msg.messageType === 'error' && msg.requestId === 'auth_expired_token_1');
  assert.equal(authError.payload?.code, 'invalid_access_token');
});

test('controller heartbeat timeout disconnects stale controller sessions', async (t) => {
  const port = 8862;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS: '1000',
    OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT: '1',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const pairing = await requestPairing(base, 'node_heartbeat_timeout_suite');
  const nodeWs = await connectAuthedNodeWs(port, 'node_heartbeat_timeout_suite', 'heartbeat_timeout_node');
  const controllerWs = await connectAuthedControllerWs(port, pairing.controllerAccessToken, 'heartbeat_timeout_controller');

  t.after(() => {
    nodeWs.close();
    controllerWs.close();
  });

  await waitForWsClose(controllerWs, 4000);
});

test('heartbeat timeout dispatches owner-scoped tab cleanup for stale controller only', async (t) => {
  const port = 8865;
  const base = `http://127.0.0.1:${port}`;
  const nodeId = 'node_owner_cleanup_suite';
  const proc = startRelay(port, {
    OTTO_DEFAULT_CONTROLLER_SCOPES: 'primitive.tab.open',
    OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS: '1000',
    OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT: '1',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);

  const registerController = async (suffix) => {
    const registerResp = await fetch(`${base}/api/controller/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `Owner Cleanup ${suffix} ${Date.now()}`,
        description: `Owner cleanup controller ${suffix}`,
      }),
    });
    assert.equal(registerResp.status, 200);
    const registered = await registerResp.json();

    const tokenResp = await fetch(`${base}/api/controller/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: registered.clientId,
        clientSecret: registered.clientSecret,
      }),
    });
    assert.equal(tokenResp.status, 200);
    const tokenBody = await tokenResp.json();

    const nodeToken = await issueNodeAccessToken(nodeId);
    const grantResp = await fetch(`${base}/api/controller/access`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${nodeToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        clientId: registered.clientId,
        grant: true,
      }),
    });
    assert.equal(grantResp.status, 200);

    return {
      clientId: registered.clientId,
      accessToken: tokenBody.accessToken,
    };
  };

  const controllerClientA = await registerController('A');
  const controllerClientB = await registerController('B');

  const nodeWs = await connectAuthedNodeWs(port, nodeId, 'owner_cleanup_node');
  const controllerA = await connectAuthedControllerWs(port, controllerClientA.accessToken, 'owner_cleanup_controller_a');
  const controllerB = await connectAuthedControllerWs(port, controllerClientB.accessToken, 'owner_cleanup_controller_b');

  t.after(() => {
    nodeWs.close();
    controllerA.close();
    controllerB.close();
  });

  const waitNode = (label, predicate, timeoutMs = 3000) => nextWsEnvelope(nodeWs, predicate, timeoutMs).catch((error) => {
    throw new Error(`${label}: ${error.message}`);
  });

  controllerA.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'owner_cleanup_open_a',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: nodeId,
      action: 'primitive.tab.open',
      replayNonce: 'owner_cleanup_nonce_a',
      timeoutMs: 1500,
      payload: {
        url: 'https://chat.reddit.com',
      },
    },
  }));

  const routedOpenA = await waitNode(
    'owner A primitive.tab.open routed to node',
    (msg) => msg.messageType === 'command' && msg.requestId === 'owner_cleanup_open_a',
  );
  const ownerClientIdA = routedOpenA.payload?.payload?.__controllerClientId;
  assert.equal(ownerClientIdA, controllerClientA.clientId);

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'owner_cleanup_open_a',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 5,
      action: 'primitive.tab.open',
      data: { tabSessionId: 'owner_cleanup_tab_a' },
    },
  }));

  await nextWsEnvelope(
    controllerA,
    (msg) => msg.messageType === 'result' && msg.requestId === 'owner_cleanup_open_a',
    3000,
  );

  controllerB.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'owner_cleanup_open_b',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: nodeId,
      action: 'primitive.tab.open',
      replayNonce: 'owner_cleanup_nonce_b',
      timeoutMs: 1500,
      payload: {
        url: 'https://www.reddit.com',
      },
    },
  }));

  const routedOpenB = await waitNode(
    'owner B primitive.tab.open routed to node',
    (msg) => msg.messageType === 'command' && msg.requestId === 'owner_cleanup_open_b',
  );
  const ownerClientIdB = routedOpenB.payload?.payload?.__controllerClientId;
  assert.equal(ownerClientIdB, controllerClientB.clientId);
  assert.notEqual(ownerClientIdA, ownerClientIdB);

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'owner_cleanup_open_b',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 5,
      action: 'primitive.tab.open',
      data: { tabSessionId: 'owner_cleanup_tab_b' },
    },
  }));

  await nextWsEnvelope(
    controllerB,
    (msg) => msg.messageType === 'result' && msg.requestId === 'owner_cleanup_open_b',
    3000,
  );

  const keepAlive = setInterval(() => {
    controllerB.send(JSON.stringify({
      protocolVersion: '1.0.0',
      messageType: 'ping',
      requestId: `owner_cleanup_keepalive_${Date.now()}`,
      timestamp: new Date().toISOString(),
      senderRole: 'controller',
      payload: { ok: true },
    }));
  }, 250);

  t.after(() => {
    clearInterval(keepAlive);
  });

  await waitForWsClose(controllerA, 5000);

  const cleanupCommand = await waitNode(
    'owner cleanup command dispatched after controller A timeout',
    (msg) => msg.messageType === 'command' && msg.payload?.action === 'primitive.tab.close_owned',
    3000,
  );

  assert.equal(cleanupCommand.payload?.payload?.controllerClientId, ownerClientIdA);
  assert.notEqual(cleanupCommand.payload?.payload?.controllerClientId, ownerClientIdB);

  await wait(1200);
  assert.equal(controllerB.readyState, WebSocket.OPEN);
});

test('logs list and export support source and latest filters', async (t) => {
  const port = 8840;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  await requestPairing(base, 'node_logs_filter_suite');

  const nodeWs = await connectAuthedNodeWs(port, 'node_logs_filter_suite', 'logs_filter_suite');
  t.after(() => {
    nodeWs.close();
  });

  sendExtensionLogEvent(nodeWs, 'ext_log_1', {
    level: 'debug',
    type: 'offscreen.connect_attempt',
    timestamp: new Date().toISOString(),
    data: { step: 1 },
  });
  sendExtensionLogEvent(nodeWs, 'ext_log_2', {
    level: 'info',
    type: 'offscreen.authenticated_connected',
    timestamp: new Date().toISOString(),
    data: { step: 2 },
  });

  await wait(150);

  const latestNodeResp = await fetch(`${base}/api/logs?source=node&latest=1`);
  assert.equal(latestNodeResp.status, 200);
  const latestNodeBody = await latestNodeResp.json();
  assert.equal(Array.isArray(latestNodeBody.logs), true);
  assert.equal(latestNodeBody.logs.length, 1);
  assert.equal(latestNodeBody.logs[0]?.source, 'node');
  assert.equal(latestNodeBody.logs[0]?.type, 'offscreen.authenticated_connected');

  const relayOnlyResp = await fetch(`${base}/api/logs/export?source=relay&latest=5`);
  assert.equal(relayOnlyResp.status, 200);
  const relayOnlyBody = await relayOnlyResp.text();
  const relayRows = relayOnlyBody.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(relayRows.every((row) => row.source === 'relay'), true);
});

test('logs spill over into multiple window files when max file bytes is exceeded', async (t) => {
  const port = 8843;
  const base = `http://127.0.0.1:${port}`;
  const logDir = mkdtempSync(join(tmpdir(), 'otto-relay-log-window-'));
  const proc = startRelay(port, {
    OTTO_LOG_DIR: logDir,
    OTTO_LOG_MAX_FILE_BYTES: '1024',
  });

  t.after(() => {
    proc.kill();
    rmSync(logDir, { recursive: true, force: true });
  });

  await waitForRelay(base);
  await requestPairing(base, 'node_log_spill_suite');
  const nodeWs = await connectAuthedNodeWs(port, 'node_log_spill_suite', 'spill_node');

  t.after(() => {
    nodeWs.close();
  });

  for (let i = 0; i < 20; i += 1) {
    sendExtensionLogEvent(nodeWs, `spill_log_${i}`, {
      level: 'info',
      type: 'offscreen.payload_burst',
      timestamp: new Date().toISOString(),
      data: {
        seq: i,
        blob: 'x'.repeat(350),
      },
    });
  }

  await wait(250);

  const statusResp = await fetch(`${base}/api/logs/status`);
  assert.equal(statusResp.status, 200);
  const statusBody = await statusResp.json();
  assert.equal(statusBody.windowing?.mode, 'daily');
  assert.equal(typeof statusBody.windowing?.maxFileBytes, 'number');
  assert.equal(statusBody.windowing?.maxFileBytes, 1024);

  const operationFiles = readdirSync(logDir)
    .filter((name) => /^operations-\d{4}-\d{2}-\d{2}(?:-\d+)?\.jsonl$/.test(name));
  assert.equal(operationFiles.length >= 2, true);
});

test('logs API rejects invalid source and latest query values', async (t) => {
  const port = 8841;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);

  const invalidSource = await fetch(`${base}/api/logs?source=extension`);
  assert.equal(invalidSource.status, 400);
  assert.deepEqual(await invalidSource.json(), { error: 'invalid_source' });

  const invalidLatest = await fetch(`${base}/api/logs?latest=0`);
  assert.equal(invalidLatest.status, 400);
  assert.deepEqual(await invalidLatest.json(), { error: 'invalid_latest' });
});

test('logs subscribe source filter streams only matching entries', async (t) => {
  const port = 8842;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const pairing = await requestPairing(base, 'node_logs_stream_suite');

  const nodeWs = await connectAuthedNodeWs(port, 'node_logs_stream_suite', 'logs_stream_node');
  const controllerWs = await connectAuthedControllerWs(port, pairing.controllerAccessToken, 'logs_stream_controller');

  t.after(() => {
    nodeWs.close();
    controllerWs.close();
  });

  controllerWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId: 'subscribe_node_only',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      type: 'logs_subscribe',
      source: 'node',
    },
  }));

  await nextWsEnvelope(controllerWs, (msg) => msg.messageType === 'event' && msg.payload?.type === 'logs_subscribed');

  sendExtensionLogEvent(nodeWs, 'ext_stream_log_1', {
    level: 'debug',
    type: 'offscreen.websocket_opened',
    timestamp: new Date().toISOString(),
  });

  const streamed = await nextWsEnvelope(
    controllerWs,
    (msg) => msg.messageType === 'event' && msg.payload?.type === 'log',
    2500,
  );
  assert.equal(streamed.payload.entry.source, 'node');
  assert.equal(streamed.payload.entry.type, 'offscreen.websocket_opened');
});

test('listener subscribe routes updates and unsubscribe stops further updates', async (t) => {
  const port = 8844;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_DEFAULT_CONTROLLER_SCOPES: 'listener.subscribe,listener.unsubscribe',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const pairing = await requestPairing(base, 'node_listener_suite');
  const nodeWs = await connectAuthedNodeWs(port, 'node_listener_suite', 'listener_node');
  const controllerWs = await connectAuthedControllerWs(port, pairing.controllerAccessToken, 'listener_controller');

  t.after(() => {
    nodeWs.close();
    controllerWs.close();
  });

  controllerWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'listener_sub_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: pairing.nodeId,
      action: 'listener.subscribe',
      replayNonce: 'listener_sub_nonce_1',
      payload: {
        listener: 'reddit.chat.messages',
      },
    },
  }));

  await nextWsEnvelope(nodeWs, (msg) => msg.messageType === 'command' && msg.requestId === 'listener_sub_1');

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'listener_sub_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 5,
      action: 'listener.subscribe',
      data: {
        listener: 'reddit.chat.messages',
        subscribed: true,
      },
    },
  }));

  await nextWsEnvelope(controllerWs, (msg) => msg.messageType === 'result' && msg.requestId === 'listener_sub_1');

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId: 'listener_sub_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      type: 'listener_update',
      updateType: 'new_message',
      data: {
        conversationId: 'c_1',
        messageId: 'm_1',
      },
    },
  }));

  const update = await nextWsEnvelope(
    controllerWs,
    (msg) => msg.messageType === 'event' && msg.requestId === 'listener_sub_1' && msg.payload?.type === 'listener_update',
  );
  assert.equal(update.payload.updateType, 'new_message');

  controllerWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'listener_unsub_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: pairing.nodeId,
      action: 'listener.unsubscribe',
      replayNonce: 'listener_unsub_nonce_1',
      payload: {
        targetRequestId: 'listener_sub_1',
      },
    },
  }));

  await nextWsEnvelope(nodeWs, (msg) => msg.messageType === 'command' && msg.requestId === 'listener_unsub_1');

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'listener_unsub_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 4,
      action: 'listener.unsubscribe',
      data: {
        targetRequestId: 'listener_sub_1',
        unsubscribed: true,
      },
    },
  }));

  await nextWsEnvelope(controllerWs, (msg) => msg.messageType === 'result' && msg.requestId === 'listener_unsub_1');

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId: 'listener_sub_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      type: 'listener_update',
      updateType: 'new_message',
      data: {
        conversationId: 'c_1',
        messageId: 'm_2',
      },
    },
  }));

  const rejected = await nextWsEnvelope(
    nodeWs,
    (msg) => msg.messageType === 'error' && msg.requestId === 'listener_sub_1',
  );
  assert.equal(rejected.payload?.code, 'listener_not_found');
});

test('command.test streams stay active past timeout window and cancel unsubscribes listeners', async (t) => {
  const port = 8845;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_DEFAULT_CONTROLLER_SCOPES: 'command.test,listener.subscribe,listener.unsubscribe',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const pairing = await requestPairing(base, 'node_command_stream_suite');
  const nodeWs = await connectAuthedNodeWs(port, 'node_command_stream_suite', 'command_stream_node');
  const controllerWs = await connectAuthedControllerWs(port, pairing.controllerAccessToken, 'command_stream_controller');

  t.after(() => {
    nodeWs.close();
    controllerWs.close();
  });

  const waitController = (label, predicate, timeoutMs = 5000) => nextWsEnvelope(controllerWs, predicate, timeoutMs).catch((error) => {
    throw new Error(`${label}: ${error.message}`);
  });
  const waitNode = (label, predicate, timeoutMs = 5000) => nextWsEnvelope(nodeWs, predicate, timeoutMs).catch((error) => {
    throw new Error(`${label}: ${error.message}`);
  });

  controllerWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'command_test_stream_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: pairing.nodeId,
      action: 'command.test',
      replayNonce: 'command_stream_nonce_1',
      tabSessionId: 'command_stream_tab_1',
      timeoutMs: 1000,
      payload: {
        site: 'reddit.com',
        command: 'getChatMessages',
      },
    },
  }));

  await waitNode('command.test routed to node', (msg) => msg.messageType === 'command' && msg.requestId === 'command_test_stream_1');

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'command_test_stream_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 8,
      action: 'command.test',
      data: {
        stream: {
          listeners: [
            {
              listener: 'network.http_intercept',
              options: {
                tabSessionId: 'command_stream_tab_1',
                urlPattern: 'https://chat.reddit.com/sync*',
              },
            },
          ],
        },
      },
    },
  }));

  await waitController('command.test result delivered to controller', (msg) => msg.messageType === 'result' && msg.requestId === 'command_test_stream_1');

  controllerWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'command_stream_sub_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: pairing.nodeId,
      action: 'listener.subscribe',
      replayNonce: 'command_stream_nonce_2',
      tabSessionId: 'command_stream_tab_1',
      payload: {
        listener: 'network.http_intercept',
        options: {
          tabSessionId: 'command_stream_tab_1',
          urlPattern: 'https://chat.reddit.com/sync*',
        },
      },
    },
  }));

  await waitNode('listener.subscribe routed to node', (msg) => msg.messageType === 'command' && msg.requestId === 'command_stream_sub_1');

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'command_stream_sub_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 5,
      action: 'listener.subscribe',
      data: {
        listener: 'network.http_intercept',
        subscribed: true,
      },
    },
  }));

  await waitController('listener.subscribe result delivered to controller', (msg) => msg.messageType === 'result' && msg.requestId === 'command_stream_sub_1');

  const proxiedUpdatePromise = waitController(
    'listener_update proxied to listener.subscribe request',
    (msg) => msg.messageType === 'event' && msg.requestId === 'command_stream_sub_1' && msg.payload?.type === 'listener_update',
    5000,
  );

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId: 'command_stream_sub_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      type: 'listener_update',
      updateType: 'network_event',
      data: {
        eventId: 'evt_1',
      },
    },
  }));

  const proxiedUpdate = await proxiedUpdatePromise;
  assert.equal(proxiedUpdate.payload?.updateType, 'network_event');

  await wait(1300);

  const proxiedUpdateAfterWindowPromise = waitController(
    'listener_update still proxied after timeout window elapsed',
    (msg) => msg.messageType === 'event'
      && msg.requestId === 'command_stream_sub_1'
      && msg.payload?.type === 'listener_update'
      && msg.payload?.updateType === 'network_event_after_timeout_window',
    5000,
  );

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId: 'command_stream_sub_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      type: 'listener_update',
      updateType: 'network_event_after_timeout_window',
      data: {
        eventId: 'evt_2',
      },
    },
  }));

  const proxiedUpdateAfterWindow = await proxiedUpdateAfterWindowPromise;
  assert.equal(proxiedUpdateAfterWindow.payload?.data?.eventId, 'evt_2');

  const nodeUnsubscribePromise = waitNode(
    'relay forwarded listener.unsubscribe to node',
    (msg) => msg.messageType === 'command' && msg.payload?.action === 'listener.unsubscribe',
    5000,
  );

  const cancelledPromise = waitController(
    'cancel terminal result emitted for command.test request',
    (msg) => msg.messageType === 'result' && msg.requestId === 'command_test_stream_1',
    5000,
  );
  const cancelAckPromise = waitController(
    'cancel ack emitted',
    (msg) => msg.messageType === 'event' && msg.requestId === 'command_stream_cancel_req_1' && msg.payload?.type === 'cancel_ack',
    5000,
  );

  controllerWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command_cancel',
    requestId: 'command_stream_cancel_req_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetRequestId: 'command_test_stream_1',
    },
  }));

  const cancelled = await cancelledPromise;
  assert.equal(cancelled.payload?.commandOutcome, 'cancelled');

  const cancelAck = await cancelAckPromise;
  assert.equal(cancelAck.payload?.status, 'cancelled');

  const nodeUnsubscribe = await nodeUnsubscribePromise;
  assert.equal(nodeUnsubscribe.payload?.payload?.targetRequestId, 'command_stream_sub_1');
});

test('non-responsive controller stream session is heartbeat-disconnected and listener updates are rejected', async (t) => {
  const port = 8863;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_DEFAULT_CONTROLLER_SCOPES: 'command.test,listener.subscribe,listener.unsubscribe',
    OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS: '1000',
    OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT: '1',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const pairing = await requestPairing(base, 'node_command_stream_heartbeat_suite');
  const nodeWs = await connectAuthedNodeWs(port, 'node_command_stream_heartbeat_suite', 'command_stream_heartbeat_node');
  const controllerWs = await connectAuthedControllerWs(port, pairing.controllerAccessToken, 'command_stream_heartbeat_controller');

  t.after(() => {
    nodeWs.close();
    controllerWs.close();
  });

  const waitController = (label, predicate, timeoutMs = 3000) => nextWsEnvelope(controllerWs, predicate, timeoutMs).catch((error) => {
    throw new Error(`${label}: ${error.message}`);
  });
  const waitNode = (label, predicate, timeoutMs = 3000) => nextWsEnvelope(nodeWs, predicate, timeoutMs).catch((error) => {
    throw new Error(`${label}: ${error.message}`);
  });

  controllerWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'command_test_stream_hb_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: pairing.nodeId,
      action: 'command.test',
      replayNonce: 'command_stream_hb_nonce_1',
      tabSessionId: 'command_stream_hb_tab_1',
      timeoutMs: 1000,
      payload: {
        site: 'reddit.com',
        command: 'getChatMessages',
      },
    },
  }));

  await waitNode('command.test routed to node', (msg) => msg.messageType === 'command' && msg.requestId === 'command_test_stream_hb_1');

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'command_test_stream_hb_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 8,
      action: 'command.test',
      data: {
        stream: {
          listeners: [
            {
              listener: 'network.http_intercept',
              options: {
                tabSessionId: 'command_stream_hb_tab_1',
                urlPattern: 'https://chat.reddit.com/sync*',
              },
            },
          ],
        },
      },
    },
  }));

  await waitController('command.test result delivered to controller', (msg) => msg.messageType === 'result' && msg.requestId === 'command_test_stream_hb_1');

  controllerWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'command_stream_hb_sub_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: pairing.nodeId,
      action: 'listener.subscribe',
      replayNonce: 'command_stream_hb_nonce_2',
      tabSessionId: 'command_stream_hb_tab_1',
      payload: {
        listener: 'network.http_intercept',
        options: {
          tabSessionId: 'command_stream_hb_tab_1',
          urlPattern: 'https://chat.reddit.com/sync*',
        },
      },
    },
  }));

  await waitNode('listener.subscribe routed to node', (msg) => msg.messageType === 'command' && msg.requestId === 'command_stream_hb_sub_1');

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'command_stream_hb_sub_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 5,
      action: 'listener.subscribe',
      data: {
        listener: 'network.http_intercept',
        subscribed: true,
      },
    },
  }));

  await waitController('listener.subscribe result delivered to controller', (msg) => msg.messageType === 'result' && msg.requestId === 'command_stream_hb_sub_1');

  await waitForWsClose(controllerWs, 4000);

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId: 'command_stream_hb_sub_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      type: 'listener_update',
      updateType: 'network_event_post_disconnect',
      data: {
        eventId: 'evt_post_disconnect',
      },
    },
  }));

  const rejected = await waitNode(
    'listener_update rejected after controller heartbeat disconnect cleanup',
    (msg) => msg.messageType === 'error' && msg.requestId === 'command_stream_hb_sub_1',
    3000,
  );
  assert.equal(rejected.payload?.code, 'listener_not_found');
});

test('new controller cannot cancel stale stream request owned by disconnected controller', async (t) => {
  const port = 8864;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_DEFAULT_CONTROLLER_SCOPES: 'command.test,listener.subscribe,listener.unsubscribe',
    OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS: '1000',
    OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT: '1',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);

  const pairingA = await requestPairing(base, 'node_command_stream_owner_mismatch_suite');
  const nodeWs = await connectAuthedNodeWs(port, 'node_command_stream_owner_mismatch_suite', 'command_stream_owner_mismatch_node');
  const controllerA = await connectAuthedControllerWs(port, pairingA.controllerAccessToken, 'command_stream_owner_mismatch_controller_a');

  t.after(() => {
    nodeWs.close();
    controllerA.close();
  });

  const waitControllerA = (label, predicate, timeoutMs = 3000) => nextWsEnvelope(controllerA, predicate, timeoutMs).catch((error) => {
    throw new Error(`${label}: ${error.message}`);
  });
  const waitNode = (label, predicate, timeoutMs = 3000) => nextWsEnvelope(nodeWs, predicate, timeoutMs).catch((error) => {
    throw new Error(`${label}: ${error.message}`);
  });

  controllerA.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'command_test_owner_mismatch_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: pairingA.nodeId,
      action: 'command.test',
      replayNonce: 'command_owner_mismatch_nonce_1',
      tabSessionId: 'command_owner_mismatch_tab_1',
      timeoutMs: 1000,
      payload: {
        site: 'reddit.com',
        command: 'getChatMessages',
      },
    },
  }));

  await waitNode('owner stream command.test routed to node', (msg) => msg.messageType === 'command' && msg.requestId === 'command_test_owner_mismatch_1');

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'command_test_owner_mismatch_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 8,
      action: 'command.test',
      data: {
        stream: {
          listeners: [
            {
              listener: 'network.http_intercept',
              options: {
                tabSessionId: 'command_owner_mismatch_tab_1',
                urlPattern: 'https://chat.reddit.com/sync*',
              },
            },
          ],
        },
      },
    },
  }));

  await waitControllerA('owner command.test result delivered', (msg) => msg.messageType === 'result' && msg.requestId === 'command_test_owner_mismatch_1');

  await waitForWsClose(controllerA, 4000);

  const pairingB = await requestPairing(base, 'node_command_stream_owner_mismatch_suite');
  const controllerB = await connectAuthedControllerWs(port, pairingB.controllerAccessToken, 'command_stream_owner_mismatch_controller_b');

  t.after(() => {
    controllerB.close();
  });

  controllerB.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command_cancel',
    requestId: 'command_owner_mismatch_cancel_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetRequestId: 'command_test_owner_mismatch_1',
    },
  }));

  const cancelError = await nextWsEnvelope(
    controllerB,
    (msg) => msg.messageType === 'error' && msg.requestId === 'command_owner_mismatch_cancel_1',
    3000,
  );
  assert.equal(cancelError.payload?.code, 'command_not_found');
});

test('issued controller tokens include configured claims and are revocable', async (t) => {
  const port = 8800;
  const base = `http://127.0.0.1:${port}`;
  const secret = 'test-secret-for-jwt';
  const issuer = 'otto-relay-test';
  const audience = 'otto-test-clients';
  const proc = startRelay(port, {
    OTTO_TOKEN_SECRET: secret,
    OTTO_TOKEN_ISSUER: issuer,
    OTTO_TOKEN_AUDIENCE: audience,
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_claims_suite');
  assert.ok(Array.isArray(approval.scopes));
  assert.ok(approval.scopes.length > 0);
  assert.ok(approval.scopes.includes('listener.subscribe'));
  assert.ok(approval.scopes.includes('listener.unsubscribe'));

  const verified = await jwtVerify(
    approval.controllerAccessToken,
    new TextEncoder().encode(secret),
    { issuer, audience },
  );

  assert.equal(verified.payload.role, 'controller');
  assert.equal(verified.payload.nodeId, 'node_claims_suite');
  assert.ok(Array.isArray(verified.payload.scopes));
  assert.ok(verified.payload.scopes.includes('listener.subscribe'));
  assert.ok(verified.payload.scopes.includes('listener.unsubscribe'));

  const refreshResp = await fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: approval.controllerRefreshToken }),
  });
  assert.equal(refreshResp.status, 200);
  const refreshBody = await refreshResp.json();
  assert.equal(typeof refreshBody.refreshToken, 'string');

  const revokeResp = await fetch(`${base}/api/auth/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: refreshBody.refreshToken }),
  });
  assert.equal(revokeResp.status, 200);
  const revokeBody = await revokeResp.json();
  assert.equal(revokeBody.revoked, true);

  const refreshAfterRevokeResp = await fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: refreshBody.refreshToken }),
  });
  assert.equal(refreshAfterRevokeResp.status, 401);
});

test('refresh sessions persist across relay restart with shared runtime store', async (t) => {
  const port = 8850;
  const base = `http://127.0.0.1:${port}`;
  const logDir = mkdtempSync(join(tmpdir(), 'otto-relay-refresh-store-'));

  t.after(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  const first = startRelay(port, { OTTO_LOG_DIR: logDir });
  t.after(() => {
    first.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_refresh_persist_suite');

  const beforeRestartRefreshResp = await fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: approval.controllerRefreshToken }),
  });
  assert.equal(beforeRestartRefreshResp.status, 200);
  const beforeRestartBody = await beforeRestartRefreshResp.json();
  assert.equal(typeof beforeRestartBody.refreshToken, 'string');

  first.kill();
  await wait(300);

  const second = startRelay(port, { OTTO_LOG_DIR: logDir });
  t.after(() => {
    second.kill();
  });

  await waitForRelay(base);

  const afterRestartRefreshResp = await fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: beforeRestartBody.refreshToken }),
  });
  assert.equal(afterRestartRefreshResp.status, 200);
});

test('controller command with disallowed scope returns forbidden_action', async (t) => {
  const port = 8801;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_DEFAULT_CONTROLLER_SCOPES: 'primitive.tab.open',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_scope_suite');

  const ws = new WebSocket(`ws://127.0.0.1:${port}/?role=controller`);
  t.after(() => {
    ws.close();
  });

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'hello',
    requestId: 'hello_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { role: 'controller', capabilities: [] },
  }));

  await nextWsEnvelope(ws, (msg) => msg.messageType === 'hello_ack' && msg.requestId === 'hello_1');

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'auth',
    requestId: 'auth_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { accessToken: approval.controllerAccessToken },
  }));

  await nextWsEnvelope(ws, (msg) => msg.messageType === 'auth_ack' && msg.requestId === 'auth_1');

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'cmd_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      action: 'primitive.dom.extract_text',
      tabSessionId: 'tab_1',
      timeoutMs: 2000,
    },
  }));

  const err = await nextWsEnvelope(ws, (msg) => msg.messageType === 'error' && msg.requestId === 'cmd_1');
  assert.equal(err.payload?.code, 'forbidden_action');
});

test('command.run scope is allowed while command.test and other command actions are denied', async (t) => {
  const port = 8825;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_DEFAULT_CONTROLLER_SCOPES: 'command.run',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_command_scope_suite');
  const ws = await connectAuthedControllerWs(port, approval.controllerAccessToken, 'command_scope_ctl');

  t.after(() => {
    ws.close();
  });

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'command_scope_allowed',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      action: 'command.run',
      timeoutMs: 1000,
      replayNonce: 'command_scope_nonce_1',
      payload: {
        site: 'reddit.com',
        command: 'getFeed',
      },
    },
  }));

  const allowedErr = await nextWsEnvelope(ws, (msg) => msg.messageType === 'error' && msg.requestId === 'command_scope_allowed');
  assert.equal(allowedErr.payload?.code, 'node_offline');

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'command_scope_denied',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      action: 'command.list',
      timeoutMs: 1000,
      replayNonce: 'command_scope_nonce_2',
      payload: {},
    },
  }));

  const deniedErr = await nextWsEnvelope(ws, (msg) => msg.messageType === 'error' && msg.requestId === 'command_scope_denied');
  assert.equal(deniedErr.payload?.code, 'forbidden_action');

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'command_scope_test_denied',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      action: 'command.test',
      timeoutMs: 1000,
      replayNonce: 'command_scope_nonce_3',
      payload: {
        site: 'reddit.com',
        command: 'getFeed',
      },
    },
  }));

  const testDeniedErr = await nextWsEnvelope(
    ws,
    (msg) => msg.messageType === 'error' && msg.requestId === 'command_scope_test_denied',
  );
  assert.equal(testDeniedErr.payload?.code, 'forbidden_action');
});

test('controller malformed command without targetNodeId is rejected', async (t) => {
  const port = 8823;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_malformed_command_suite');
  const ws = await connectAuthedControllerWs(port, approval.controllerAccessToken, 'malformed_cmd_ctl');

  t.after(() => {
    ws.close();
  });

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'malformed_cmd_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      action: 'primitive.tab.query',
      timeoutMs: 1000,
      replayNonce: 'malformed_cmd_nonce_1',
      payload: {},
    },
  }));

  const err = await nextWsEnvelope(ws, (msg) => msg.messageType === 'error' && msg.requestId === 'malformed_cmd_1');
  assert.equal(err.payload?.code, 'missing_target_node');
});

test('controller session is rate-limited after configured per-minute threshold', async (t) => {
  const port = 8824;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_RATE_LIMIT_PER_MIN: '1',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_rate_limit_suite');
  const ws = await connectAuthedControllerWs(port, approval.controllerAccessToken, 'rate_limit_ctl');

  t.after(() => {
    ws.close();
  });

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId: 'rate_limit_evt_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { type: 'logs_subscribe' },
  }));
  await nextWsEnvelope(ws, (msg) => msg.messageType === 'event' && msg.requestId === 'rate_limit_evt_1');

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId: 'rate_limit_evt_2',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { type: 'logs_subscribe' },
  }));

  const err = await nextWsEnvelope(ws, (msg) => msg.messageType === 'error' && msg.requestId === 'rate_limit_evt_2');
  assert.equal(err.payload?.code, 'rate_limited');
});

test('node listener_update frames bypass session rate limit while other node events still enforce it', async (t) => {
  const port = 8825;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_RATE_LIMIT_PER_MIN: '1',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const nodeWs = await connectAuthedNodeWs(port, 'node_listener_rate_limit_suite', 'node_listener_rate_limit');

  t.after(() => {
    nodeWs.close();
  });

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId: 'node_listener_update_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      type: 'listener_update',
      updateType: 'network.response',
      emittedAt: new Date().toISOString(),
      data: { probe: 1 },
    },
  }));

  const firstListenerErr = await nextWsEnvelope(
    nodeWs,
    (msg) => msg.messageType === 'error' && msg.requestId === 'node_listener_update_1',
  );
  assert.equal(firstListenerErr.payload?.code, 'listener_not_found');

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId: 'node_listener_update_2',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      type: 'listener_update',
      updateType: 'network.response',
      emittedAt: new Date().toISOString(),
      data: { probe: 2 },
    },
  }));

  const secondListenerErr = await nextWsEnvelope(
    nodeWs,
    (msg) => msg.messageType === 'error' && msg.requestId === 'node_listener_update_2',
  );
  assert.equal(secondListenerErr.payload?.code, 'listener_not_found');

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId: 'node_extension_log_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      type: 'extension_log',
      entry: {
        level: 'debug',
        type: 'node.test_log',
        timestamp: new Date().toISOString(),
        data: { attempt: 1 },
      },
    },
  }));

  nodeWs.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId: 'node_extension_log_2',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      type: 'extension_log',
      entry: {
        level: 'debug',
        type: 'node.test_log',
        timestamp: new Date().toISOString(),
        data: { attempt: 2 },
      },
    },
  }));

  const rateLimitedErr = await nextWsEnvelope(
    nodeWs,
    (msg) => msg.messageType === 'error' && msg.requestId === 'node_extension_log_2',
  );
  assert.equal(rateLimitedErr.payload?.code, 'rate_limited');
});

test('controller auth accepts token signed by previous secret during rotation window', async (t) => {
  const port = 8802;
  const oldSecret = 'rotating-old-secret';
  const newSecret = 'rotating-new-secret';
  const issuer = 'otto-rotation-suite';
  const audience = 'otto-rotation-clients';
  const proc = startRelay(port, {
    OTTO_TOKEN_SECRET: newSecret,
    OTTO_TOKEN_PREVIOUS_SECRET: oldSecret,
    OTTO_TOKEN_ISSUER: issuer,
    OTTO_TOKEN_AUDIENCE: audience,
  });

  t.after(() => {
    proc.kill();
  });

  const base = `http://127.0.0.1:${port}`;
  await waitForRelay(base);

  const rotatedToken = await new SignJWT({
    role: 'controller',
    controllerId: 'ctl_rotation_test',
    scopes: ['primitive.tab.query'],
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(oldSecret));

  const ws = new WebSocket(`ws://127.0.0.1:${port}/?role=controller`);
  t.after(() => {
    ws.close();
  });

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'hello',
    requestId: 'hello_rotate_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { role: 'controller', capabilities: [] },
  }));

  await nextWsEnvelope(ws, (msg) => msg.messageType === 'hello_ack' && msg.requestId === 'hello_rotate_1');

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'auth',
    requestId: 'auth_rotate_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { accessToken: rotatedToken },
  }));

  const authAck = await nextWsEnvelope(ws, (msg) => msg.messageType === 'auth_ack' && msg.requestId === 'auth_rotate_1');
  assert.equal(authAck.payload?.accepted, true);
});

test('replayed command nonce is rejected inside session window', async (t) => {
  const port = 8803;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_REPLAY_WINDOW_MS: '5000',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_replay_suite');

  const ws = new WebSocket(`ws://127.0.0.1:${port}/?role=controller`);
  t.after(() => {
    ws.close();
  });

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'hello',
    requestId: 'hello_replay_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { role: 'controller', capabilities: [] },
  }));
  await nextWsEnvelope(ws, (msg) => msg.messageType === 'hello_ack' && msg.requestId === 'hello_replay_1');

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'auth',
    requestId: 'auth_replay_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { accessToken: approval.controllerAccessToken },
  }));
  await nextWsEnvelope(ws, (msg) => msg.messageType === 'auth_ack' && msg.requestId === 'auth_replay_1');

  const replayNonce = 'nonce_replay_case_1';
  const firstPromise = nextWsEnvelope(ws, (msg) => msg.requestId === 'cmd_replay_1' && msg.messageType === 'error');
  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'cmd_replay_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      action: 'primitive.tab.query',
      timeoutMs: 1000,
      replayNonce,
      payload: {},
    },
  }));

  const first = await firstPromise;
  assert.equal(first.payload?.code, 'node_offline');

  const secondPromise = nextWsEnvelope(ws, (msg) => msg.requestId === 'cmd_replay_2' && msg.messageType === 'error');
  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'cmd_replay_2',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      action: 'primitive.tab.query',
      timeoutMs: 1000,
      replayNonce,
      payload: {},
    },
  }));

  const second = await secondPromise;
  assert.equal(second.payload?.code, 'replay_rejected');
});

test('stale command timestamp is rejected by replay window', async (t) => {
  const port = 8804;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_REPLAY_WINDOW_MS: '5000',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_replay_stale_suite');

  const ws = new WebSocket(`ws://127.0.0.1:${port}/?role=controller`);
  t.after(() => {
    ws.close();
  });

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'hello',
    requestId: 'hello_stale_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { role: 'controller', capabilities: [] },
  }));
  await nextWsEnvelope(ws, (msg) => msg.messageType === 'hello_ack' && msg.requestId === 'hello_stale_1');

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'auth',
    requestId: 'auth_stale_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { accessToken: approval.controllerAccessToken },
  }));
  await nextWsEnvelope(ws, (msg) => msg.messageType === 'auth_ack' && msg.requestId === 'auth_stale_1');

  const stalePromise = nextWsEnvelope(ws, (msg) => msg.requestId === 'cmd_stale_1' && msg.messageType === 'error');
  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'cmd_stale_1',
    timestamp: new Date(Date.now() - 120_000).toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      action: 'primitive.tab.query',
      timeoutMs: 1000,
      replayNonce: 'nonce_stale_case_1',
      payload: {},
    },
  }));

  const stale = await stalePromise;
  assert.equal(stale.payload?.code, 'timestamp_out_of_window');
});

test('node websocket upgrade accepts configured allowed origin', async (t) => {
  const port = 8805;
  const allowedOrigin = 'chrome-extension://allowed-node-origin';
  const proc = startRelay(port, {
    OTTO_EXTENSION_ORIGIN: allowedOrigin,
  });

  t.after(() => {
    proc.kill();
  });

  const base = `http://127.0.0.1:${port}`;
  await waitForRelay(base);

  const ws = new WebSocket(`ws://127.0.0.1:${port}/?role=node`, {
    headers: { Origin: allowedOrigin },
  });

  t.after(() => {
    ws.close();
  });

  await waitForWsOpen(ws);
});

test('node websocket upgrade rejects disallowed origin', async (t) => {
  const port = 8806;
  const proc = startRelay(port, {
    OTTO_EXTENSION_ORIGIN: 'chrome-extension://allowed-node-origin',
  });

  t.after(() => {
    proc.kill();
  });

  const base = `http://127.0.0.1:${port}`;
  await waitForRelay(base);

  const ws = new WebSocket(`ws://127.0.0.1:${port}/?role=node`, {
    headers: { Origin: 'chrome-extension://other-origin' },
  });

  t.after(() => {
    ws.close();
  });

  const err = await waitForWsError(ws);
  assert.match(String(err?.message ?? ''), /(unexpected server response: 403|socket hang up)/i);
});

test('tab lock lifecycle emits acquire conflict renew and release events', async (t) => {
  const port = 8807;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approvalA = await requestPairing(base, 'node_lock_suite');
  const approvalB = await requestPairing(base, 'node_lock_suite');

  const wsA = await connectAuthedControllerWs(port, approvalA.controllerAccessToken, 'lock_a');
  const wsB = await connectAuthedControllerWs(port, approvalB.controllerAccessToken, 'lock_b');
  t.after(() => {
    wsA.close();
    wsB.close();
  });

  wsA.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'tab_lock',
    requestId: 'lock_req_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approvalA.nodeId,
      tabSessionId: 'tab_lock_1',
      lockLeaseMs: 500,
    },
  }));

  const acquired = await nextWsEnvelope(wsA, (msg) => msg.messageType === 'event' && msg.requestId === 'lock_req_1');
  assert.equal(acquired.payload?.type, 'lock_acquired');
  assert.equal(typeof acquired.payload?.lockExpiresAt, 'number');

  wsB.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'tab_lock',
    requestId: 'lock_req_2',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approvalA.nodeId,
      tabSessionId: 'tab_lock_1',
      lockLeaseMs: 500,
    },
  }));

  // Conflict path emits both an error and a lock_conflict event; collect both concurrently to avoid order races.
  const conflictErrPromise = nextWsEnvelope(wsB, (msg) => msg.messageType === 'error' && msg.requestId === 'lock_req_2');
  const conflictEventPromise = nextWsEnvelope(wsB, (msg) => msg.messageType === 'event' && msg.requestId === 'lock_req_2');
  const [conflictErr, conflictEvent] = await Promise.all([conflictErrPromise, conflictEventPromise]);
  assert.equal(conflictErr.payload?.code, 'tab_locked');
  assert.equal(conflictEvent.payload?.type, 'lock_conflict');
  assert.equal(typeof conflictEvent.payload?.lockExpiresAt, 'number');

  wsA.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'tab_lock',
    requestId: 'lock_req_3',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approvalA.nodeId,
      tabSessionId: 'tab_lock_1',
      lockLeaseMs: 900,
    },
  }));

  const renewed = await nextWsEnvelope(wsA, (msg) => msg.messageType === 'event' && msg.requestId === 'lock_req_3');
  assert.equal(renewed.payload?.type, 'lock_renewed');
  assert.equal(typeof renewed.payload?.lockExpiresAt, 'number');

  wsA.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'tab_unlock',
    requestId: 'lock_req_4',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approvalA.nodeId,
      tabSessionId: 'tab_lock_1',
    },
  }));

  const released = await nextWsEnvelope(wsA, (msg) => msg.messageType === 'event' && msg.requestId === 'lock_req_4');
  assert.equal(released.payload?.type, 'lock_released');
});

test('lock lease expiry is emitted to logs', async (t) => {
  const port = 8808;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_lock_expiry_suite');
  const ws = await connectAuthedControllerWs(port, approval.controllerAccessToken, 'lock_exp');
  t.after(() => {
    ws.close();
  });

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'tab_lock',
    requestId: 'lock_exp_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'tab_lock_exp_1',
      lockLeaseMs: 80,
    },
  }));
  await nextWsEnvelope(ws, (msg) => msg.messageType === 'event' && msg.requestId === 'lock_exp_1');

  await wait(160);

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'event',
    requestId: 'lock_exp_touch',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { type: 'logs_subscribe' },
  }));
  await nextWsEnvelope(ws, (msg) => msg.messageType === 'event' && msg.requestId === 'lock_exp_touch');

  const logsResp = await fetch(`${base}/api/logs?since=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}`);
  assert.equal(logsResp.status, 200);
  const logsBody = await logsResp.json();
  const hasExpiry = Array.isArray(logsBody.logs) && logsBody.logs.some((entry) => entry.type === 'lock_expired');
  assert.equal(hasExpiry, true);
});

test('accepted command can complete successfully', async (t) => {
  const port = 8809;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_terminal_complete');
  const wsController = await connectAuthedControllerWs(port, approval.controllerAccessToken, 'terminal_complete_ctl');
  const wsNode = await connectAuthedNodeWs(port, approval.nodeId, 'terminal_complete_node');

  t.after(() => {
    wsController.close();
    wsNode.close();
  });

  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'terminal_complete_cmd',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      action: 'primitive.tab.query',
      timeoutMs: 2000,
      replayNonce: 'terminal_complete_nonce',
      payload: {},
    },
  }));

  const routedPromise = nextWsEnvelope(
    wsController,
    (msg) => msg.messageType === 'event' && msg.requestId === 'terminal_complete_cmd' && msg.payload?.type === 'routed',
  );
  const nodeCommandPromise = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'terminal_complete_cmd');
  await routedPromise;
  await nodeCommandPromise;

  const resultPromise = nextWsEnvelope(wsController, (msg) => msg.messageType === 'result' && msg.requestId === 'terminal_complete_cmd');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'terminal_complete_cmd',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 42,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));

  const result = await resultPromise;
  assert.equal(result.payload?.ok, true);
});

test('accepted command can fail from node execution error', async (t) => {
  const port = 8810;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_terminal_failed');
  const wsController = await connectAuthedControllerWs(port, approval.controllerAccessToken, 'terminal_failed_ctl');
  const wsNode = await connectAuthedNodeWs(port, approval.nodeId, 'terminal_failed_node');

  t.after(() => {
    wsController.close();
    wsNode.close();
  });

  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'terminal_failed_cmd',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      action: 'primitive.tab.query',
      timeoutMs: 2000,
      replayNonce: 'terminal_failed_nonce',
      payload: {},
    },
  }));

  await nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'terminal_failed_cmd');

  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'error',
    requestId: 'terminal_failed_cmd',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      category: 'execution',
      code: 'node_execution_failed',
      message: 'node failed command',
      action: 'primitive.tab.query',
      nodeId: approval.nodeId,
    },
  }));

  const failed = await nextWsEnvelope(wsController, (msg) => msg.messageType === 'error' && msg.requestId === 'terminal_failed_cmd');
  assert.equal(failed.payload?.code, 'node_execution_failed');
});

test('accepted command times out without node terminal response', async (t) => {
  const port = 8811;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_terminal_timeout');
  const wsController = await connectAuthedControllerWs(port, approval.controllerAccessToken, 'terminal_timeout_ctl');
  const wsNode = await connectAuthedNodeWs(port, approval.nodeId, 'terminal_timeout_node');

  t.after(() => {
    wsController.close();
    wsNode.close();
  });

  const nodeTimeoutCommandPromise = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'terminal_timeout_cmd');
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'terminal_timeout_cmd',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      action: 'primitive.tab.query',
      timeoutMs: 150,
      replayNonce: 'terminal_timeout_nonce',
      payload: {},
    },
  }));

  await nodeTimeoutCommandPromise;
  const timedOut = await nextWsEnvelope(wsController, (msg) => msg.messageType === 'error' && msg.requestId === 'terminal_timeout_cmd', 3000);
  assert.equal(timedOut.payload?.code, 'command_timed_out');
});

test('accepted command fails terminally when node disconnects', async (t) => {
  const port = 8812;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_terminal_disconnect');
  const wsController = await connectAuthedControllerWs(port, approval.controllerAccessToken, 'terminal_disconnect_ctl');
  const wsNode = await connectAuthedNodeWs(port, approval.nodeId, 'terminal_disconnect_node');

  t.after(() => {
    wsController.close();
    wsNode.close();
  });

  const nodeDisconnectCommandPromise = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'terminal_disconnect_cmd');
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'terminal_disconnect_cmd',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      action: 'primitive.tab.query',
      timeoutMs: 2000,
      replayNonce: 'terminal_disconnect_nonce',
      payload: {},
    },
  }));

  await nodeDisconnectCommandPromise;
  wsNode.close();

  const disconnected = await nextWsEnvelope(wsController, (msg) => msg.messageType === 'error' && msg.requestId === 'terminal_disconnect_cmd', 3000);
  assert.equal(disconnected.payload?.code, 'node_disconnected');
});

test('registered controller requires node ACL grant before routing commands', async (t) => {
  const port = 8813;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const uniqueName = `CLI A ${Date.now()}`;

  const registerResp = await fetch(`${base}/api/controller/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: uniqueName, description: 'Primary automation CLI' }),
  });
  assert.equal(registerResp.status, 200);
  const registered = await registerResp.json();

  const tokenResp = await fetch(`${base}/api/controller/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: registered.clientId,
      clientSecret: registered.clientSecret,
    }),
  });
  assert.equal(tokenResp.status, 200);
  const tokenBody = await tokenResp.json();

  const ws = await connectAuthedControllerWs(port, tokenBody.accessToken, 'acl_gate_ctl');
  t.after(() => {
    ws.close();
  });

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'acl_gate_cmd_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: 'node_acl_suite',
      action: 'primitive.tab.query',
      timeoutMs: 1000,
      replayNonce: 'acl_gate_nonce_1',
      payload: {},
    },
  }));

  const denied = await nextWsEnvelope(ws, (msg) => msg.messageType === 'error' && msg.requestId === 'acl_gate_cmd_1');
  assert.equal(denied.payload?.code, 'acl_missing_node_grant');

  const nodeToken = await issueNodeAccessToken('node_acl_suite');
  const grantResp = await fetch(`${base}/api/controller/access`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${nodeToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ clientId: registered.clientId, grant: true }),
  });
  assert.equal(grantResp.status, 200);

  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'acl_gate_cmd_2',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: 'node_acl_suite',
      action: 'primitive.tab.query',
      timeoutMs: 1000,
      replayNonce: 'acl_gate_nonce_2',
      payload: {},
    },
  }));

  const routedOrOffline = await nextWsEnvelope(ws, (msg) => msg.requestId === 'acl_gate_cmd_2' && msg.messageType === 'error');
  assert.equal(routedOrOffline.payload?.code, 'node_offline');
});

test('node-authenticated ACL API lists grants and supports revoke', async (t) => {
  const port = 8814;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const uniqueA = `CLI A ${Date.now()}`;
  const uniqueB = `CLI B ${Date.now()}`;

  const registerA = await fetch(`${base}/api/controller/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: uniqueA, description: 'Main CLI for node ops' }),
  });
  assert.equal(registerA.status, 200);
  const clientA = await registerA.json();

  const registerB = await fetch(`${base}/api/controller/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: uniqueB, description: 'Backup CLI for node ops' }),
  });
  assert.equal(registerB.status, 200);
  const clientB = await registerB.json();

  const nodeToken = await issueNodeAccessToken('node_acl_list_suite');

  const grantResp = await fetch(`${base}/api/controller/access`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${nodeToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ clientId: clientA.clientId, grant: true }),
  });
  assert.equal(grantResp.status, 200);

  const listResp1 = await fetch(`${base}/api/controller/access`, {
    headers: {
      authorization: `Bearer ${nodeToken}`,
    },
  });
  assert.equal(listResp1.status, 200);
  const listBody1 = await listResp1.json();
  const rowA1 = listBody1.clients.find((row) => row.clientId === clientA.clientId);
  const rowB1 = listBody1.clients.find((row) => row.clientId === clientB.clientId);
  assert.equal(rowA1?.granted, true);
  assert.equal(rowB1?.granted, false);
  assert.equal(rowA1?.name, uniqueA);
  assert.equal(rowA1?.description, 'Main CLI for node ops');
  assert.equal(typeof rowA1?.avatarSeed, 'string');

  const revokeResp = await fetch(`${base}/api/controller/access`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${nodeToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ clientId: clientA.clientId, grant: false }),
  });
  assert.equal(revokeResp.status, 200);

  const listResp2 = await fetch(`${base}/api/controller/access`, {
    headers: {
      authorization: `Bearer ${nodeToken}`,
    },
  });
  assert.equal(listResp2.status, 200);
  const listBody2 = await listResp2.json();
  const rowA2 = listBody2.clients.find((row) => row.clientId === clientA.clientId);
  assert.equal(rowA2?.granted, false);
});

test('controller registration rejects normalized name collisions', async (t) => {
  const port = 8815;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const uniqueBase = `CLI Alpha ${Date.now()}`;
  const collisionVariant = uniqueBase
    .toLowerCase()
    .replace(/\s+/g, '    ');

  const first = await fetch(`${base}/api/controller/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: uniqueBase, description: 'First controller' }),
  });
  assert.equal(first.status, 200);

  const second = await fetch(`${base}/api/controller/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: collisionVariant, description: 'Second controller' }),
  });
  assert.equal(second.status, 409);
  const body = await second.json();
  assert.equal(body.error, 'controller_name_conflict');
  assert.equal(body.code, 'controller_name_conflict');
});

test('controller removal immediately cuts ACL access and disconnects active sessions', async (t) => {
  const port = 8816;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);

  const registerResp = await fetch(`${base}/api/controller/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: `CLI Remove ${Date.now()}`, description: 'controller to remove' }),
  });
  assert.equal(registerResp.status, 200);
  const registered = await registerResp.json();

  const tokenResp = await fetch(`${base}/api/controller/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: registered.clientId, clientSecret: registered.clientSecret }),
  });
  assert.equal(tokenResp.status, 200);
  const tokenBody = await tokenResp.json();

  const nodeToken = await issueNodeAccessToken('node_remove_suite');
  const grantResp = await fetch(`${base}/api/controller/access`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${nodeToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ clientId: registered.clientId, grant: true }),
  });
  assert.equal(grantResp.status, 200);

  const ws = await connectAuthedControllerWs(port, tokenBody.accessToken, 'remove_ctl');
  t.after(() => {
    ws.close();
  });

  const closePromise = new Promise((resolve) => {
    ws.once('close', resolve);
  });

  const removeResp = await fetch(`${base}/api/controller/remove`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: registered.clientId }),
  });
  assert.equal(removeResp.status, 200);
  const removeBody = await removeResp.json();
  assert.equal(removeBody.ok, true);
  assert.equal(removeBody.clientId, registered.clientId);
  assert.equal(removeBody.aclRevokedCount, 1);
  assert.equal(removeBody.refreshRevokedCount, 1);
  assert.equal(removeBody.disconnectedSessions, 1);

  await Promise.race([
    closePromise,
    wait(2500).then(() => {
      throw new Error('controller websocket did not close after removal');
    }),
  ]);

  const listResp = await fetch(`${base}/api/controller/access`, {
    headers: {
      authorization: `Bearer ${nodeToken}`,
    },
  });
  assert.equal(listResp.status, 200);
  const listBody = await listResp.json();
  const row = listBody.clients.find((entry) => entry.clientId === registered.clientId);
  assert.equal(Boolean(row?.revoked), true);
  assert.equal(Boolean(row?.granted), false);

  const refreshResp = await fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokenBody.refreshToken }),
  });
  assert.equal(refreshResp.status, 401);
});

test('controller remove-all revokes every client and active session', async (t) => {
  const port = 8817;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);

  const nodeToken = await issueNodeAccessToken('node_remove_all_suite');
  const removedTargets = [];

  for (let idx = 0; idx < 2; idx += 1) {
    const registerResp = await fetch(`${base}/api/controller/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `CLI Remove All ${Date.now()} ${idx}`,
        description: `controller ${idx}`,
      }),
    });
    assert.equal(registerResp.status, 200);
    const registered = await registerResp.json();

    const tokenResp = await fetch(`${base}/api/controller/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: registered.clientId, clientSecret: registered.clientSecret }),
    });
    assert.equal(tokenResp.status, 200);
    const tokenBody = await tokenResp.json();

    const grantResp = await fetch(`${base}/api/controller/access`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${nodeToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ clientId: registered.clientId, grant: true }),
    });
    assert.equal(grantResp.status, 200);

    const ws = await connectAuthedControllerWs(port, tokenBody.accessToken, `remove_all_ctl_${idx}`);
    t.after(() => {
      ws.close();
    });
    const closePromise = new Promise((resolve) => {
      ws.once('close', resolve);
    });

    removedTargets.push({
      clientId: registered.clientId,
      refreshToken: tokenBody.refreshToken,
      closePromise,
    });
  }

  const removeAllResp = await fetch(`${base}/api/controller/remove-all`, {
    method: 'POST',
  });
  assert.equal(removeAllResp.status, 200);
  const removeAllBody = await removeAllResp.json();
  assert.equal(removeAllBody.ok, true);
  assert.equal(removeAllBody.removedCount, 2);
  assert.equal(removeAllBody.aclRevokedCount, 2);
  assert.equal(removeAllBody.refreshRevokedCount, 2);
  assert.equal(removeAllBody.disconnectedSessions, 2);

  for (const target of removedTargets) {
    assert.equal(removeAllBody.removedClientIds.includes(target.clientId), true);
    await Promise.race([
      target.closePromise,
      wait(2500).then(() => {
        throw new Error(`controller websocket did not close after remove-all for ${target.clientId}`);
      }),
    ]);

    const refreshResp = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: target.refreshToken }),
    });
    assert.equal(refreshResp.status, 401);
  }

  const listResp = await fetch(`${base}/api/controller/access`, {
    headers: {
      authorization: `Bearer ${nodeToken}`,
    },
  });
  assert.equal(listResp.status, 200);
  const listBody = await listResp.json();
  for (const target of removedTargets) {
    const row = listBody.clients.find((entry) => entry.clientId === target.clientId);
    assert.equal(row, undefined);
  }

  const removeAllAgainResp = await fetch(`${base}/api/controller/remove-all`, {
    method: 'POST',
  });
  assert.equal(removeAllAgainResp.status, 200);
  const removeAllAgainBody = await removeAllAgainResp.json();
  assert.equal(removeAllAgainBody.ok, true);
  assert.equal(removeAllAgainBody.removedCount, 0);
  assert.equal(Array.isArray(removeAllAgainBody.removedClientIds), true);
  assert.equal(removeAllAgainBody.removedClientIds.length, 0);
});

test('queued accepted command can be cancelled with terminal cancelled response', async (t) => {
  const port = 8813;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_terminal_cancel');
  const wsController = await connectAuthedControllerWs(port, approval.controllerAccessToken, 'terminal_cancel_ctl');
  const wsNode = await connectAuthedNodeWs(port, approval.nodeId, 'terminal_cancel_node');

  t.after(() => {
    wsController.close();
    wsNode.close();
  });

  const inflightOnNodePromise = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'terminal_cancel_cmd_1');
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'terminal_cancel_cmd_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'terminal_cancel_tab',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'terminal_cancel_nonce_1',
      waitPolicy: 'fail_fast',
      payload: {},
    },
  }));
  await inflightOnNodePromise;

  const queuedPromise = nextWsEnvelope(
    wsController,
    (msg) => msg.messageType === 'event' && msg.requestId === 'terminal_cancel_cmd_2' && msg.payload?.type === 'queued',
  );
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'terminal_cancel_cmd_2',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'terminal_cancel_tab',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'terminal_cancel_nonce_2',
      waitPolicy: 'wait_with_timeout',
      payload: {},
    },
  }));
  await queuedPromise;

  const cancelAckPromise = nextWsEnvelope(wsController, (msg) => msg.messageType === 'event' && msg.requestId === 'terminal_cancel_req');
  const cancelledTerminalPromise = nextWsEnvelope(
    wsController,
    (msg) => msg.messageType === 'error' && msg.requestId === 'terminal_cancel_cmd_2',
    3000,
  );
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command_cancel',
    requestId: 'terminal_cancel_req',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { targetRequestId: 'terminal_cancel_cmd_2' },
  }));

  const cancelAck = await cancelAckPromise;
  assert.equal(cancelAck.payload?.status, 'cancelled');

  const cancelledTerminal = await cancelledTerminalPromise;
  assert.equal(cancelledTerminal.payload?.code, 'command_cancelled');

  const inflightResultPromise = nextWsEnvelope(wsController, (msg) => msg.messageType === 'result' && msg.requestId === 'terminal_cancel_cmd_1');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'terminal_cancel_cmd_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 10,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  await inflightResultPromise;
});

test('wait_with_timeout command times out while queued under contention', async (t) => {
  const port = 8814;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_queue_timeout');
  const wsController = await connectAuthedControllerWs(port, approval.controllerAccessToken, 'queue_timeout_ctl');
  const wsNode = await connectAuthedNodeWs(port, approval.nodeId, 'queue_timeout_node');

  t.after(() => {
    wsController.close();
    wsNode.close();
  });

  const inflightNodePromise = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'queue_timeout_cmd_1');
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'queue_timeout_cmd_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'queue_timeout_tab',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'queue_timeout_nonce_1',
      waitPolicy: 'fail_fast',
      payload: {},
    },
  }));
  await inflightNodePromise;

  const queuedEventPromise = nextWsEnvelope(
    wsController,
    (msg) => msg.messageType === 'event' && msg.requestId === 'queue_timeout_cmd_2' && msg.payload?.type === 'queued',
  );
  const queueTimeoutPromise = nextWsEnvelope(
    wsController,
    (msg) => msg.messageType === 'error' && msg.requestId === 'queue_timeout_cmd_2',
    3000,
  );
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'queue_timeout_cmd_2',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'queue_timeout_tab',
      action: 'primitive.tab.query',
      timeoutMs: 120,
      replayNonce: 'queue_timeout_nonce_2',
      waitPolicy: 'wait_with_timeout',
      payload: {},
    },
  }));

  await queuedEventPromise;
  const queueTimedOut = await queueTimeoutPromise;
  assert.equal(queueTimedOut.payload?.code, 'queue_wait_timed_out');

  const inflightResultPromise = nextWsEnvelope(wsController, (msg) => msg.messageType === 'result' && msg.requestId === 'queue_timeout_cmd_1');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'queue_timeout_cmd_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 15,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  await inflightResultPromise;
});

test('per-tab FIFO stays ordered while cross-tab commands route in parallel', async (t) => {
  const port = 8815;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approvalA = await requestPairing(base, 'node_fifo_parallel_suite');
  const approvalB = await requestPairing(base, 'node_fifo_parallel_suite');

  const wsControllerA = await connectAuthedControllerWs(port, approvalA.controllerAccessToken, 'fifo_parallel_ctl_a');
  const wsControllerB = await connectAuthedControllerWs(port, approvalB.controllerAccessToken, 'fifo_parallel_ctl_b');
  const wsNode = await connectAuthedNodeWs(port, approvalA.nodeId, 'fifo_parallel_node');

  t.after(() => {
    wsControllerA.close();
    wsControllerB.close();
    wsNode.close();
  });

  const tabAInflightOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'fifo_cmd_a1');
  wsControllerA.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'fifo_cmd_a1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approvalA.nodeId,
      tabSessionId: 'fifo_tab_a',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'fifo_nonce_a1',
      waitPolicy: 'fail_fast',
      payload: {},
    },
  }));
  await tabAInflightOnNode;

  const tabAQueuedEvent = nextWsEnvelope(
    wsControllerA,
    (msg) => msg.messageType === 'event' && msg.requestId === 'fifo_cmd_a2' && msg.payload?.type === 'queued',
  );
  wsControllerA.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'fifo_cmd_a2',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approvalA.nodeId,
      tabSessionId: 'fifo_tab_a',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'fifo_nonce_a2',
      waitPolicy: 'wait_with_timeout',
      payload: {},
    },
  }));
  await tabAQueuedEvent;

  const tabBOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'fifo_cmd_b1');
  wsControllerB.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'fifo_cmd_b1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approvalB.nodeId,
      tabSessionId: 'fifo_tab_b',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'fifo_nonce_b1',
      waitPolicy: 'fail_fast',
      payload: {},
    },
  }));
  await tabBOnNode;

  const tabBResultOnController = nextWsEnvelope(wsControllerB, (msg) => msg.messageType === 'result' && msg.requestId === 'fifo_cmd_b1');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'fifo_cmd_b1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 25,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  await tabBResultOnController;

  const tabASecondOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'fifo_cmd_a2');
  const tabAFirstResultOnController = nextWsEnvelope(wsControllerA, (msg) => msg.messageType === 'result' && msg.requestId === 'fifo_cmd_a1');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'fifo_cmd_a1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 30,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  await tabAFirstResultOnController;
  await tabASecondOnNode;

  const tabASecondResultOnController = nextWsEnvelope(wsControllerA, (msg) => msg.messageType === 'result' && msg.requestId === 'fifo_cmd_a2');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'fifo_cmd_a2',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 35,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));

  const secondResult = await tabASecondResultOnController;
  assert.equal(secondResult.payload?.ok, true);
});

test('multi-controller mixed load preserves per-tab FIFO fairness', async (t) => {
  const port = 8816;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port);

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approvalA = await requestPairing(base, 'node_fairness_mixed_suite');
  const approvalB = await requestPairing(base, 'node_fairness_mixed_suite');

  const wsControllerA = await connectAuthedControllerWs(port, approvalA.controllerAccessToken, 'fair_mixed_ctl_a');
  const wsControllerB = await connectAuthedControllerWs(port, approvalB.controllerAccessToken, 'fair_mixed_ctl_b');
  const wsNode = await connectAuthedNodeWs(port, approvalA.nodeId, 'fair_mixed_node');

  t.after(() => {
    wsControllerA.close();
    wsControllerB.close();
    wsNode.close();
  });

  const tabAFirstOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'fair_a1');
  wsControllerA.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'fair_a1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approvalA.nodeId,
      tabSessionId: 'fair_tab_a',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'fair_nonce_a1',
      waitPolicy: 'fail_fast',
      payload: {},
    },
  }));
  await tabAFirstOnNode;

  const tabBFirstOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'fair_b1');
  wsControllerB.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'fair_b1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approvalB.nodeId,
      tabSessionId: 'fair_tab_b',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'fair_nonce_b1',
      waitPolicy: 'fail_fast',
      payload: {},
    },
  }));
  await tabBFirstOnNode;

  const tabASecondQueued = nextWsEnvelope(
    wsControllerB,
    (msg) => msg.messageType === 'event' && msg.requestId === 'fair_a2' && msg.payload?.type === 'queued',
  );
  wsControllerB.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'fair_a2',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approvalB.nodeId,
      tabSessionId: 'fair_tab_a',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'fair_nonce_a2',
      waitPolicy: 'wait_with_timeout',
      payload: {},
    },
  }));
  await tabASecondQueued;

  const tabAThirdQueued = nextWsEnvelope(
    wsControllerA,
    (msg) => msg.messageType === 'event' && msg.requestId === 'fair_a3' && msg.payload?.type === 'queued',
  );
  wsControllerA.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'fair_a3',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approvalA.nodeId,
      tabSessionId: 'fair_tab_a',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'fair_nonce_a3',
      waitPolicy: 'wait_with_timeout',
      payload: {},
    },
  }));
  await tabAThirdQueued;

  const tabBFirstResultOnController = nextWsEnvelope(wsControllerB, (msg) => msg.messageType === 'result' && msg.requestId === 'fair_b1');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'fair_b1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 20,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  await tabBFirstResultOnController;

  const tabBSecondOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'fair_b2');
  wsControllerB.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'fair_b2',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approvalB.nodeId,
      tabSessionId: 'fair_tab_b',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'fair_nonce_b2',
      waitPolicy: 'fail_fast',
      payload: {},
    },
  }));
  await tabBSecondOnNode;

  const tabASecondOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'fair_a2');
  const tabAFirstResultOnController = nextWsEnvelope(wsControllerA, (msg) => msg.messageType === 'result' && msg.requestId === 'fair_a1');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'fair_a1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 30,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  await tabAFirstResultOnController;
  await tabASecondOnNode;

  const tabAThirdOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'fair_a3');
  const tabASecondResultOnController = nextWsEnvelope(wsControllerB, (msg) => msg.messageType === 'result' && msg.requestId === 'fair_a2');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'fair_a2',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 25,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  await tabASecondResultOnController;
  await tabAThirdOnNode;

  const tabAThirdResultOnController = nextWsEnvelope(wsControllerA, (msg) => msg.messageType === 'result' && msg.requestId === 'fair_a3');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'fair_a3',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 35,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  const tabAThirdResult = await tabAThirdResultOnController;
  assert.equal(tabAThirdResult.payload?.ok, true);

  const tabBSecondResultOnController = nextWsEnvelope(wsControllerB, (msg) => msg.messageType === 'result' && msg.requestId === 'fair_b2');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'fair_b2',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 22,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  const tabBSecondResult = await tabBSecondResultOnController;
  assert.equal(tabBSecondResult.payload?.ok, true);
});

test('tab queue depth limit rejects additional queued commands deterministically', async (t) => {
  const port = 8817;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_TAB_QUEUE_LIMIT: '1',
    OTTO_CONTROLLER_QUEUE_LIMIT: '10',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_tab_queue_limit_suite');
  const wsController = await connectAuthedControllerWs(port, approval.controllerAccessToken, 'tab_queue_limit_ctl');
  const wsNode = await connectAuthedNodeWs(port, approval.nodeId, 'tab_queue_limit_node');

  t.after(() => {
    wsController.close();
    wsNode.close();
  });

  const inflightOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'tab_limit_cmd_1');
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'tab_limit_cmd_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'tab_limit_tab',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'tab_limit_nonce_1',
      waitPolicy: 'fail_fast',
      payload: {},
    },
  }));
  await inflightOnNode;

  const queuedEvent = nextWsEnvelope(
    wsController,
    (msg) => msg.messageType === 'event' && msg.requestId === 'tab_limit_cmd_2' && msg.payload?.type === 'queued',
  );
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'tab_limit_cmd_2',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'tab_limit_tab',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'tab_limit_nonce_2',
      waitPolicy: 'wait_with_timeout',
      payload: {},
    },
  }));
  await queuedEvent;

  const limitErrorPromise = nextWsEnvelope(
    wsController,
    (msg) => msg.messageType === 'error' && msg.requestId === 'tab_limit_cmd_3',
  );
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'tab_limit_cmd_3',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'tab_limit_tab',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'tab_limit_nonce_3',
      waitPolicy: 'wait_with_timeout',
      payload: {},
    },
  }));

  const tabLimitErr = await limitErrorPromise;
  assert.equal(tabLimitErr.payload?.code, 'tab_queue_limit_exceeded');

  const firstResultOnController = nextWsEnvelope(wsController, (msg) => msg.messageType === 'result' && msg.requestId === 'tab_limit_cmd_1');
  const secondOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'tab_limit_cmd_2');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'tab_limit_cmd_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 20,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  await firstResultOnController;
  await secondOnNode;

  const secondResultOnController = nextWsEnvelope(wsController, (msg) => msg.messageType === 'result' && msg.requestId === 'tab_limit_cmd_2');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'tab_limit_cmd_2',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 20,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  await secondResultOnController;
});

test('controller queue depth limit rejects additional queued commands across tabs', async (t) => {
  const port = 8818;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_TAB_QUEUE_LIMIT: '5',
    OTTO_CONTROLLER_QUEUE_LIMIT: '1',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_controller_queue_limit_suite');
  const wsController = await connectAuthedControllerWs(port, approval.controllerAccessToken, 'controller_queue_limit_ctl');
  const wsNode = await connectAuthedNodeWs(port, approval.nodeId, 'controller_queue_limit_node');

  t.after(() => {
    wsController.close();
    wsNode.close();
  });

  const tabAInflightOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'ctl_limit_a1');
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'ctl_limit_a1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'ctl_limit_tab_a',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'ctl_limit_nonce_a1',
      waitPolicy: 'fail_fast',
      payload: {},
    },
  }));
  await tabAInflightOnNode;

  const tabBInflightOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'ctl_limit_b1');
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'ctl_limit_b1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'ctl_limit_tab_b',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'ctl_limit_nonce_b1',
      waitPolicy: 'fail_fast',
      payload: {},
    },
  }));
  await tabBInflightOnNode;

  const firstQueuedEvent = nextWsEnvelope(
    wsController,
    (msg) => msg.messageType === 'event' && msg.requestId === 'ctl_limit_a2' && msg.payload?.type === 'queued',
  );
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'ctl_limit_a2',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'ctl_limit_tab_a',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'ctl_limit_nonce_a2',
      waitPolicy: 'wait_with_timeout',
      payload: {},
    },
  }));
  await firstQueuedEvent;

  const controllerLimitErrorPromise = nextWsEnvelope(
    wsController,
    (msg) => msg.messageType === 'error' && msg.requestId === 'ctl_limit_b2',
  );
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'ctl_limit_b2',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'ctl_limit_tab_b',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'ctl_limit_nonce_b2',
      waitPolicy: 'wait_with_timeout',
      payload: {},
    },
  }));

  const controllerLimitErr = await controllerLimitErrorPromise;
  assert.equal(controllerLimitErr.payload?.code, 'controller_queue_limit_exceeded');

  const tabBFirstResult = nextWsEnvelope(wsController, (msg) => msg.messageType === 'result' && msg.requestId === 'ctl_limit_b1');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'ctl_limit_b1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 20,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  await tabBFirstResult;

  const tabASecondOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'ctl_limit_a2');
  const tabAFirstResult = nextWsEnvelope(wsController, (msg) => msg.messageType === 'result' && msg.requestId === 'ctl_limit_a1');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'ctl_limit_a1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 20,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  await tabAFirstResult;
  await tabASecondOnNode;

  const tabASecondResult = nextWsEnvelope(wsController, (msg) => msg.messageType === 'result' && msg.requestId === 'ctl_limit_a2');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'ctl_limit_a2',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 20,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  await tabASecondResult;
});

test('same-tab burst drains in FIFO order across controllers without starvation', async (t) => {
  const port = 8819;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_TAB_QUEUE_LIMIT: '10',
    OTTO_CONTROLLER_QUEUE_LIMIT: '10',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approvalA = await requestPairing(base, 'node_burst_fifo_suite');
  const approvalB = await requestPairing(base, 'node_burst_fifo_suite');

  const wsControllerA = await connectAuthedControllerWs(port, approvalA.controllerAccessToken, 'burst_fifo_ctl_a');
  const wsControllerB = await connectAuthedControllerWs(port, approvalB.controllerAccessToken, 'burst_fifo_ctl_b');
  const wsNode = await connectAuthedNodeWs(port, approvalA.nodeId, 'burst_fifo_node');

  t.after(() => {
    wsControllerA.close();
    wsControllerB.close();
    wsNode.close();
  });

  const ownerByRequestId = new Map([
    ['burst_a1', wsControllerA],
    ['burst_b2', wsControllerB],
    ['burst_a3', wsControllerA],
    ['burst_b4', wsControllerB],
    ['burst_a5', wsControllerA],
  ]);

  const firstOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'burst_a1');
  wsControllerA.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'burst_a1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approvalA.nodeId,
      tabSessionId: 'burst_tab',
      action: 'primitive.tab.query',
      timeoutMs: 5000,
      replayNonce: 'burst_nonce_a1',
      waitPolicy: 'fail_fast',
      payload: {},
    },
  }));
  await firstOnNode;

  const queuePlan = [
    { ws: wsControllerB, requestId: 'burst_b2', nonce: 'burst_nonce_b2' },
    { ws: wsControllerA, requestId: 'burst_a3', nonce: 'burst_nonce_a3' },
    { ws: wsControllerB, requestId: 'burst_b4', nonce: 'burst_nonce_b4' },
    { ws: wsControllerA, requestId: 'burst_a5', nonce: 'burst_nonce_a5' },
  ];

  for (const queued of queuePlan) {
    const queuedEvent = nextWsEnvelope(
      queued.ws,
      (msg) => msg.messageType === 'event' && msg.requestId === queued.requestId && msg.payload?.type === 'queued',
    );
    queued.ws.send(JSON.stringify({
      protocolVersion: '1.0.0',
      messageType: 'command',
      requestId: queued.requestId,
      timestamp: new Date().toISOString(),
      senderRole: 'controller',
      payload: {
        targetNodeId: approvalA.nodeId,
        tabSessionId: 'burst_tab',
        action: 'primitive.tab.query',
        timeoutMs: 5000,
        replayNonce: queued.nonce,
        waitPolicy: 'wait_with_timeout',
        payload: {},
      },
    }));
    await queuedEvent;
  }

  const expectedOrder = ['burst_b2', 'burst_a3', 'burst_b4', 'burst_a5'];
  let inflightRequestId = 'burst_a1';

  for (const nextRequestId of expectedOrder) {
    const nextOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === nextRequestId);
    const owner = ownerByRequestId.get(inflightRequestId);
    assert.ok(owner);
    const terminalOnOwner = nextWsEnvelope(owner, (msg) => msg.messageType === 'result' && msg.requestId === inflightRequestId);

    wsNode.send(JSON.stringify({
      protocolVersion: '1.0.0',
      messageType: 'result',
      requestId: inflightRequestId,
      timestamp: new Date().toISOString(),
      senderRole: 'node',
      payload: {
        ok: true,
        durationMs: 20,
        action: 'primitive.tab.query',
        data: { tabSessions: {} },
      },
    }));

    await terminalOnOwner;
    await nextOnNode;
    inflightRequestId = nextRequestId;
  }

  const finalOwner = ownerByRequestId.get(inflightRequestId);
  assert.ok(finalOwner);
  const finalTerminal = nextWsEnvelope(finalOwner, (msg) => msg.messageType === 'result' && msg.requestId === inflightRequestId);
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: inflightRequestId,
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 20,
      action: 'primitive.tab.query',
      data: { tabSessions: {} },
    },
  }));
  await finalTerminal;
});

test('command.run commands keep per-tab queue invariants', async (t) => {
  const port = 8826;
  const base = `http://127.0.0.1:${port}`;
  const proc = startRelay(port, {
    OTTO_DEFAULT_CONTROLLER_SCOPES: 'command.run',
  });

  t.after(() => {
    proc.kill();
  });

  await waitForRelay(base);
  const approval = await requestPairing(base, 'node_command_queue_suite');
  const wsController = await connectAuthedControllerWs(port, approval.controllerAccessToken, 'command_queue_ctl');
  const wsNode = await connectAuthedNodeWs(port, approval.nodeId, 'command_queue_node');

  t.after(() => {
    wsController.close();
    wsNode.close();
  });

  const inflightOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'command_queue_1');
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'command_queue_1',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'command_tab_1',
      action: 'command.run',
      timeoutMs: 5000,
      replayNonce: 'command_queue_nonce_1',
      waitPolicy: 'fail_fast',
      payload: {
        site: 'reddit.com',
        command: 'getFeed',
      },
    },
  }));
  await inflightOnNode;

  const queuedEvent = nextWsEnvelope(
    wsController,
    (msg) => msg.messageType === 'event' && msg.requestId === 'command_queue_2' && msg.payload?.type === 'queued',
  );
  wsController.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId: 'command_queue_2',
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: approval.nodeId,
      tabSessionId: 'command_tab_1',
      action: 'command.run',
      timeoutMs: 5000,
      replayNonce: 'command_queue_nonce_2',
      waitPolicy: 'wait_with_timeout',
      payload: {
        site: 'reddit.com',
        command: 'getFeed',
      },
    },
  }));
  await queuedEvent;

  const secondOnNode = nextWsEnvelope(wsNode, (msg) => msg.messageType === 'command' && msg.requestId === 'command_queue_2');
  const firstResult = nextWsEnvelope(wsController, (msg) => msg.messageType === 'result' && msg.requestId === 'command_queue_1');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'command_queue_1',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 20,
      action: 'command.run',
      data: { ok: true },
    },
  }));
  await firstResult;
  await secondOnNode;

  const secondResult = nextWsEnvelope(wsController, (msg) => msg.messageType === 'result' && msg.requestId === 'command_queue_2');
  wsNode.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'result',
    requestId: 'command_queue_2',
    timestamp: new Date().toISOString(),
    senderRole: 'node',
    payload: {
      ok: true,
      durationMs: 20,
      action: 'command.run',
      data: { ok: true },
    },
  }));

  const result = await secondResult;
  assert.equal(result.payload?.ok, true);
});
