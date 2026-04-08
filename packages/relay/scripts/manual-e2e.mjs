#!/usr/bin/env node
import { nanoid } from 'nanoid';
import { WebSocket } from 'ws';

const relayHttpUrl = process.env.OTTO_RELAY_HTTP_URL ?? 'http://127.0.0.1:8787';
const relayWsUrl = process.env.OTTO_RELAY_WS_URL ?? 'ws://127.0.0.1:8787/?role=controller';
const nodeId = process.env.OTTO_NODE_ID ?? 'node_manual_e2e';
const openUrl = process.env.OTTO_E2E_OPEN_URL ?? 'https://www.reddit.com/';
const extractSelector = process.env.OTTO_E2E_EXTRACT_SELECTOR ?? 'title';
const commandTimeoutMs = Number(process.env.OTTO_E2E_COMMAND_TIMEOUT_MS ?? '10000');
const runCommand = process.env.OTTO_E2E_RUN_COMMAND === '1';
const commandSite = process.env.OTTO_E2E_COMMAND_SITE ?? 'reddit.com';
const commandId = process.env.OTTO_E2E_COMMAND_ID ?? 'getFeed';

function logStep(message) {
  console.log(`\n[manual-e2e] ${message}`);
}

async function httpJson(path, options = {}) {
  const resp = await fetch(`${relayHttpUrl}${path}`, options);
  const text = await resp.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: resp.status, body };
}

function waitForWsOpen(ws, timeoutMs = 5000) {
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

function waitForFrame(ws, predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('timed out waiting for websocket frame'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      ws.off('message', onMessage);
    }

    function onMessage(raw) {
      try {
        const msg = JSON.parse(String(raw));
        if (!predicate(msg)) return;
        cleanup();
        resolve(msg);
      } catch {
        // Ignore malformed frames.
      }
    }

    ws.on('message', onMessage);
  });
}

function waitForTerminal(ws, requestId, timeoutMs = commandTimeoutMs + 4000) {
  return waitForFrame(
    ws,
    (msg) => (msg.messageType === 'result' || msg.messageType === 'error') && msg.requestId === requestId,
    timeoutMs,
  );
}

async function connectController(accessToken) {
  const ws = new WebSocket(relayWsUrl);
  await waitForWsOpen(ws);

  const helloRequestId = `hello_${nanoid(8)}`;
  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'hello',
    requestId: helloRequestId,
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { role: 'controller', capabilities: [] },
  }));
  await waitForFrame(ws, (msg) => msg.messageType === 'hello_ack' && msg.requestId === helloRequestId);

  const authRequestId = `auth_${nanoid(8)}`;
  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'auth',
    requestId: authRequestId,
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: { accessToken },
  }));

  const authResp = await waitForFrame(ws, (msg) => msg.requestId === authRequestId);
  if (authResp.messageType !== 'auth_ack') {
    throw new Error(`controller auth failed: ${JSON.stringify(authResp.payload)}`);
  }

  return ws;
}

async function sendCommand(ws, action, payload = {}, tabSessionId) {
  const requestId = `cmd_${nanoid(10)}`;
  ws.send(JSON.stringify({
    protocolVersion: '1.0.0',
    messageType: 'command',
    requestId,
    timestamp: new Date().toISOString(),
    senderRole: 'controller',
    payload: {
      targetNodeId: nodeId,
      tabSessionId,
      action,
      timeoutMs: commandTimeoutMs,
      replayNonce: `nonce_${nanoid(12)}`,
      waitPolicy: 'fail_fast',
      payload,
    },
  }));

  return waitForTerminal(ws, requestId);
}

function assertOkTerminal(frame, action) {
  if (frame.messageType === 'result') return frame;
  const details = JSON.stringify(frame.payload);
  throw new Error(`${action} failed: ${details}`);
}

async function getControllerAccessToken() {
  if (process.env.OTTO_CONTROLLER_ACCESS_TOKEN) {
    return process.env.OTTO_CONTROLLER_ACCESS_TOKEN;
  }

  logStep(`requesting pairing challenge for node ${nodeId}`);
  const challengeResp = await httpJson('/api/pairing/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId }),
  });

  if (challengeResp.status !== 200 || !challengeResp.body?.code) {
    throw new Error(`pairing request failed: status=${challengeResp.status} body=${JSON.stringify(challengeResp.body)}`);
  }

  logStep(`approving pairing challenge with code ${challengeResp.body.code}`);
  const approveResp = await httpJson('/api/pairing/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: challengeResp.body.code }),
  });

  if (approveResp.status !== 200 || !approveResp.body?.controllerAccessToken) {
    throw new Error(`pairing approve failed: status=${approveResp.status} body=${JSON.stringify(approveResp.body)}`);
  }

  return approveResp.body.controllerAccessToken;
}

async function run() {
  logStep('starting manual e2e harness');
  logStep(`relay http: ${relayHttpUrl}`);
  logStep(`relay ws: ${relayWsUrl}`);

  const accessToken = await getControllerAccessToken();
  const ws = await connectController(accessToken);

  try {
    logStep('running primitive.tab.query sanity check');
    const query = assertOkTerminal(await sendCommand(ws, 'primitive.tab.query', {}), 'primitive.tab.query');
    console.log('[manual-e2e] tab sessions before open:', query.payload?.data?.tabSessions ?? {});

    logStep(`running primitive.tab.open for ${openUrl}`);
    const open = assertOkTerminal(await sendCommand(ws, 'primitive.tab.open', { url: openUrl }), 'primitive.tab.open');
    const tabSessionId = open.payload?.data?.tabSessionId;
    if (!tabSessionId) {
      throw new Error(`primitive.tab.open did not return tabSessionId: ${JSON.stringify(open.payload)}`);
    }
    console.log(`[manual-e2e] opened tabSessionId=${tabSessionId}`);

    logStep('running primitive.tab.navigate');
    assertOkTerminal(
      await sendCommand(ws, 'primitive.tab.navigate', { tabSessionId, url: openUrl }, tabSessionId),
      'primitive.tab.navigate',
    );

    logStep(`running primitive.dom.extract_text with selector ${extractSelector}`);
    const extract = assertOkTerminal(
      await sendCommand(ws, 'primitive.dom.extract_text', { tabSessionId, selector: extractSelector }, tabSessionId),
      'primitive.dom.extract_text',
    );
    console.log('[manual-e2e] extract result preview:', extract.payload?.data?.text ?? null);

    if (runCommand) {
      logStep(`running command.run (${commandSite}/${commandId})`);
      const commandResult = await sendCommand(ws, 'command.run', {
        tabSessionId,
        site: commandSite,
        command: commandId,
        input: {},
        authMode: 'auto',
      }, tabSessionId);
      assertOkTerminal(commandResult, 'command.run');
      const posts = commandResult.payload?.data?.posts;
      console.log('[manual-e2e] command post count:', Array.isArray(posts) ? posts.length : 0);
    }

    logStep('running primitive.tab.close');
    assertOkTerminal(
      await sendCommand(ws, 'primitive.tab.close', { tabSessionId }, tabSessionId),
      'primitive.tab.close',
    );

    logStep('manual e2e flow completed successfully');
  } finally {
    ws.close();
  }
}

run().catch((err) => {
  console.error('\n[manual-e2e] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
