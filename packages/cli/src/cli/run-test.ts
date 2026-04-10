import WebSocket from 'ws';
import type { CommandTestStream, Envelope } from '@telepat/otto-protocol';
import { createCommandTestStreamRenderer } from '../test-stream/format.js';
import { resolveCleanupSocketStrategy } from '../test-cleanup.js';
import type { OttoConfig } from '../config.js';
import { toSocketCloseAlertPayload } from './socket-errors.js';

export async function runCmdCommand(
  opts: { action: string; tabSession?: string; nodeId?: string; payload: string; timeout: string },
  deps: {
    loadConfig: () => OttoConfig;
    resolveTargetNodeId: (config: OttoConfig, nodeId?: string) => Promise<string>;
    runCommandTui: (config: OttoConfig, options: {
      targetNodeId: string;
      tabSessionId?: string;
      action: string;
      payload: string;
    }) => Promise<void>;
    runCommandOnce: (
      config: OttoConfig,
      targetNodeId: string,
      opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number },
    ) => Promise<Envelope>;
    parseJsonObject: (value: string, label: string) => Record<string, unknown>;
    showAclMissingGrantHint: (errorPayload: {
      code?: string;
      nodeId?: string;
      clientId?: string;
      actionableHint?: string;
    }) => void;
  },
): Promise<void> {
  const config = deps.loadConfig();
  const targetNodeId = await deps.resolveTargetNodeId(config, opts.nodeId);

  if (process.stdout.isTTY && process.stdin.isTTY) {
    await deps.runCommandTui(config, {
      targetNodeId,
      tabSessionId: opts.tabSession,
      action: opts.action,
      payload: opts.payload,
    });
    return;
  }

  const response = await deps.runCommandOnce(config, targetNodeId, {
    action: opts.action,
    tabSession: opts.tabSession,
    payload: deps.parseJsonObject(opts.payload, '--payload'),
    timeoutMs: Number(opts.timeout),
  });

  console.log(JSON.stringify(response, null, 2));
  if (response.messageType === 'error') {
    const errorPayload = (response.payload && typeof response.payload === 'object')
      ? response.payload as { code?: string; nodeId?: string; clientId?: string; actionableHint?: string }
      : undefined;
    if (errorPayload) {
      deps.showAclMissingGrantHint(errorPayload);
    }
    process.exitCode = 1;
  }
}

export async function runTestCommand(
  site: string,
  command: string,
  opts: Record<string, unknown>,
  deps: {
    loadConfig: () => OttoConfig;
    saveConfig: (config: OttoConfig) => void;
    deleteClientSecret: (config: OttoConfig, clientId: string) => Promise<boolean>;
    maybeSelfRegisterControllerForTest: (
      config: OttoConfig,
      opts: { controllerName?: string; controllerDescription?: string; controllerAvatarSeed?: string },
    ) => Promise<{ config: OttoConfig; autoRegisteredClientId?: string }>;
    removeControllerClientAtRelay: (config: OttoConfig, clientId: string) => Promise<void>;
    resolveTargetNodeId: (config: OttoConfig, nodeId?: string) => Promise<string>;
    parsePositiveNumberOption: (value: unknown, label: string) => number;
    isJsonOutput: (config: OttoConfig) => boolean;
    parseJsonObject: (value: string, label: string) => Record<string, unknown>;
    openControllerSocket: (config: OttoConfig) => Promise<WebSocket>;
    startControllerHeartbeat: (ws: WebSocket) => () => void;
    runCommandWithSocket: (
      ws: WebSocket,
      targetNodeId: string,
      opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number; signal?: AbortSignal },
    ) => Promise<Envelope>;
    runCommandOnce: (
      config: OttoConfig,
      targetNodeId: string,
      opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number },
    ) => Promise<Envelope>;
    showAclMissingGrantHint: (errorPayload: {
      code?: string;
      nodeId?: string;
      clientId?: string;
      actionableHint?: string;
    }) => void;
    showTestFailureFooterAlert: (
      errorPayload?: { message?: string; code?: string; action?: string },
      title?: string,
    ) => Promise<void>;
    sendCommandCancelWithSocket: (ws: WebSocket, targetRequestId: string, timeoutMs?: number) => Promise<void>;
    resolveTestInfo: (
      config: OttoConfig,
      targetNodeId: string,
      site: string,
      command: string,
      timeoutMs: number,
      ws?: WebSocket,
    ) => Promise<{ openUrl: string }>;
    sendCommandWithSocket: (
      ws: WebSocket,
      targetNodeId: string,
      opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number; signal?: AbortSignal },
    ) => { requestId: string; response: Promise<Envelope> };
    subscribeListenerAndFollow: (
      ws: WebSocket,
      targetNodeId: string,
      site: string,
      command: string,
      listener: string,
      options: Record<string, unknown>,
      timeoutMs: number,
      jsonOutput: boolean,
      followDurationMs?: number,
      onSubscribed?: () => Promise<void>,
      onInterrupt?: () => Promise<void>,
      handleSignals?: boolean,
    ) => Promise<void>;
  },
): Promise<void> {
  const registration = await deps.maybeSelfRegisterControllerForTest(deps.loadConfig(), {
    controllerName: typeof opts.controllerName === 'string' ? opts.controllerName : undefined,
    controllerDescription: typeof opts.controllerDescription === 'string' ? opts.controllerDescription : undefined,
    controllerAvatarSeed: typeof opts.controllerAvatarSeed === 'string' ? opts.controllerAvatarSeed : undefined,
  });
  const config = registration.config;
  const targetNodeId = await deps.resolveTargetNodeId(config, typeof opts.nodeId === 'string' ? opts.nodeId : undefined);

  if (!['auto', 'strict_fail', 'skip'].includes(String(opts.authMode))) {
    throw new Error('--auth-mode must be one of auto|strict_fail|skip');
  }

  const timeoutMs = Number(opts.timeout);
  const streamFollowMs = opts.streamFollowMs !== undefined
    ? deps.parsePositiveNumberOption(opts.streamFollowMs, '--stream-follow-ms')
    : undefined;
  const streamPollIntervalMs = opts.streamPollIntervalMs !== undefined
    ? deps.parsePositiveNumberOption(opts.streamPollIntervalMs, '--stream-poll-interval-ms')
    : undefined;
  const jsonOutput = Boolean(opts.json) || deps.isJsonOutput(config);
  const commandInput = deps.parseJsonObject(String(opts.payload ?? '{}'), '--payload');
  const ws = await deps.openControllerSocket(config);
  const stopHeartbeat = deps.startControllerHeartbeat(ws);
  const renderer = createCommandTestStreamRenderer({
    site,
    command,
    jsonOutput,
    useColor: process.stdout.isTTY,
  });

  let tabSessionId = typeof opts.tabSession === 'string' ? opts.tabSession : undefined;
  let openedTabSessionId: string | undefined;

  let testExecutionError: unknown;
  let activeCommandTestRequestId: string | undefined;
  let tabCloseAttempted = false;
  let teardownPromise: Promise<void> | undefined;
  let receivedSignal: 'SIGINT' | 'SIGTERM' | undefined;
  let resolveWaitForInterrupt: (() => void) | undefined;
  const commandAbortController = new AbortController();
  const shouldWaitForInterrupt = opts.waitForInterrupt === true;

  const closeOpenedTabIfNeeded = async (hasOriginalError: boolean): Promise<void> => {
    if (tabCloseAttempted || !openedTabSessionId) {
      return;
    }
    tabCloseAttempted = true;

    const cleanupStrategy = resolveCleanupSocketStrategy({
      socketReadyState: ws.readyState,
      socketOpenState: WebSocket.OPEN,
      hasOriginalError,
    });

    const closeResponse = cleanupStrategy === 'reuse'
      ? await deps.runCommandWithSocket(ws, targetNodeId, {
        action: 'primitive.tab.close',
        tabSession: openedTabSessionId,
        payload: { tabSessionId: openedTabSessionId },
        timeoutMs,
      })
      : await deps.runCommandOnce(config, targetNodeId, {
        action: 'primitive.tab.close',
        tabSession: openedTabSessionId,
        payload: { tabSessionId: openedTabSessionId },
        timeoutMs,
      });

    for (const line of renderer.renderCommandResponse(closeResponse, 'primitive.tab.close')) {
      console.log(line);
    }
    if (closeResponse.messageType === 'error') {
      const errorPayload = (closeResponse.payload && typeof closeResponse.payload === 'object')
        ? closeResponse.payload as {
          code?: string;
          action?: string;
          message?: string;
          nodeId?: string;
          clientId?: string;
          actionableHint?: string;
        }
        : undefined;
      if (errorPayload) {
        deps.showAclMissingGrantHint(errorPayload);
      }
      await deps.showTestFailureFooterAlert(errorPayload, 'otto test cleanup failed during primitive.tab.close');
      process.exitCode = process.exitCode ?? 1;
    }
  };

  const performTeardown = async (reason: string, hasOriginalError: boolean): Promise<void> => {
    if (teardownPromise) {
      return teardownPromise;
    }

    teardownPromise = (async () => {
      if (activeCommandTestRequestId) {
        try {
          await deps.sendCommandCancelWithSocket(ws, activeCommandTestRequestId);
        } catch (cancelError) {
          console.error(
            `[otto] failed to cancel in-flight command.test during ${reason}: ${cancelError instanceof Error ? cancelError.message : String(cancelError)}`,
          );
        }
      }

      try {
        await closeOpenedTabIfNeeded(hasOriginalError);
      } catch (cleanupError) {
        if (testExecutionError !== undefined) {
          console.error(
            `[otto] cleanup after failed stream session also failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          );
          return;
        }

        console.error(
          `[otto] cleanup failed during primitive.tab.close: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
        process.exitCode = process.exitCode ?? 1;
      }
    })();

    return teardownPromise;
  };

  const handleTermination = (signal: 'SIGINT' | 'SIGTERM') => {
    if (receivedSignal) {
      return;
    }
    receivedSignal = signal;
    commandAbortController.abort();
    resolveWaitForInterrupt?.();
    process.exitCode = signal === 'SIGTERM' ? 143 : 130;

    void performTeardown(`signal ${signal}`, true).finally(() => {
      ws.close();
      stopHeartbeat();
    });
  };

  const onSigint = () => handleTermination('SIGINT');
  const onSigterm = () => handleTermination('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    const testInfo = await deps.resolveTestInfo(config, targetNodeId, site, command, timeoutMs, ws);

    if (!tabSessionId) {
      const openResponse = await deps.runCommandWithSocket(ws, targetNodeId, {
        action: 'primitive.tab.open',
        payload: { url: testInfo.openUrl },
        timeoutMs,
        signal: commandAbortController.signal,
      });

      for (const line of renderer.renderCommandResponse(openResponse, 'primitive.tab.open')) {
        console.log(line);
      }
      if (openResponse.messageType === 'error') {
        const errorPayload = (openResponse.payload && typeof openResponse.payload === 'object')
          ? openResponse.payload as {
            code?: string;
            action?: string;
            message?: string;
            nodeId?: string;
            clientId?: string;
            actionableHint?: string;
          }
          : undefined;
        if (errorPayload) {
          deps.showAclMissingGrantHint(errorPayload);
        }
        await deps.showTestFailureFooterAlert(errorPayload, 'otto test failed during primitive.tab.open');
        process.exitCode = 1;
        return;
      }

      const openPayload = openResponse.payload as { data?: { tabSessionId?: string } };
      tabSessionId = openPayload.data?.tabSessionId;
      openedTabSessionId = tabSessionId;
      if (!tabSessionId) {
        throw new Error('primitive.tab.open succeeded but did not return tabSessionId');
      }
    }

    const testCommand = deps.sendCommandWithSocket(ws, targetNodeId, {
      action: 'command.test',
      tabSession: tabSessionId,
      payload: {
        tabSessionId,
        site,
        command,
        input: commandInput,
        authMode: opts.authMode,
      },
      timeoutMs,
      signal: commandAbortController.signal,
    });
    activeCommandTestRequestId = testCommand.requestId;

    const testResponse = await testCommand.response;

    for (const line of renderer.renderCommandResponse(testResponse, 'command.test')) {
      console.log(line);
    }
    if (testResponse.messageType === 'error') {
      const errorPayload = (testResponse.payload && typeof testResponse.payload === 'object')
        ? testResponse.payload as {
          category?: string;
          code?: string;
          action?: string;
          message?: string;
          nodeId?: string;
          clientId?: string;
          actionableHint?: string;
        }
        : undefined;
      if (errorPayload) {
        deps.showAclMissingGrantHint(errorPayload);
      }
      if (
        errorPayload?.code === 'forbidden_action'
        && errorPayload?.action === 'command.test'
      ) {
        const nodeSuffix = errorPayload.nodeId ? ` for node ${errorPayload.nodeId}` : '';
        console.error(
          `[otto] controller token is missing command.test scope${nodeSuffix}. Re-auth with controller client credentials to issue a token with updated scopes.`,
        );
        console.error('[otto] suggested fix: otto client login');
      }
      await deps.showTestFailureFooterAlert(errorPayload);
      process.exitCode = 1;
      return;
    }

    const resultPayload = testResponse.payload as {
      data?: {
        stream?: CommandTestStream;
      };
    };

    const listeners = resultPayload.data?.stream?.listeners ?? [];
    if (listeners.length > 1) {
      throw new Error(
        `command.test stream currently supports exactly one listener for ${site}/${command}`,
      );
    }

    const streamListener = listeners[0];
    if (streamListener) {
      if (!streamListener.listener || typeof streamListener.listener !== 'string') {
        throw new Error(
          `command.test stream requires stream.listeners[0].listener for ${site}/${command}`,
        );
      }

      const options = streamListener.options && typeof streamListener.options === 'object'
        ? streamListener.options
        : {};

      const streamOptions = {
        ...options,
        ...(typeof opts.streamListenerMode === 'string' && opts.streamListenerMode.trim().length > 0
          ? { mode: opts.streamListenerMode.trim() }
          : {}),
        ...(streamPollIntervalMs !== undefined
          ? { pollIntervalMs: streamPollIntervalMs }
          : {}),
      };

      const probe = opts.streamProbe === true
        ? async () => {
          if (!tabSessionId) {
            return;
          }

          const probeResponse = await deps.runCommandWithSocket(ws, targetNodeId, {
            action: 'command.run',
            tabSession: tabSessionId,
            payload: {
              tabSessionId,
              site,
              command,
              input: commandInput,
              authMode: opts.authMode,
            },
            timeoutMs,
            signal: commandAbortController.signal,
          });

          for (const line of renderer.renderCommandResponse(probeResponse, 'command.run')) {
            console.log(line);
          }
        }
        : undefined;

      await deps.subscribeListenerAndFollow(
        ws,
        targetNodeId,
        site,
        command,
        streamListener.listener,
        streamOptions,
        timeoutMs,
        jsonOutput,
        streamFollowMs,
        probe,
        async () => {
          if (!activeCommandTestRequestId) {
            return;
          }
          await deps.sendCommandCancelWithSocket(ws, activeCommandTestRequestId);
        },
        false,
      );

      activeCommandTestRequestId = undefined;
    } else {
      activeCommandTestRequestId = undefined;

      if (shouldWaitForInterrupt) {
        console.log('[otto:test] waiting for interrupt (Ctrl+C)');
        await new Promise<void>((resolve) => {
          resolveWaitForInterrupt = resolve;
        });
      }
    }
  } catch (error) {
    testExecutionError = error;
    if (receivedSignal) {
      return;
    }
    const socketClosePayload = toSocketCloseAlertPayload(error);
    if (socketClosePayload) {
      await deps.showTestFailureFooterAlert(socketClosePayload, 'otto test interrupted before command response');
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);

    await performTeardown('normal completion', testExecutionError !== undefined);

    ws.close();
    stopHeartbeat();

    if (registration.autoRegisteredClientId && opts.cleanupTestController === true) {
      try {
        await deps.removeControllerClientAtRelay(config, registration.autoRegisteredClientId);
        await deps.deleteClientSecret(config, registration.autoRegisteredClientId);

        const latest = deps.loadConfig();
        if (latest.controllerClientId === registration.autoRegisteredClientId) {
          deps.saveConfig({
            ...latest,
            controllerClientId: undefined,
            controllerName: undefined,
            controllerDescription: undefined,
            controllerAccessToken: undefined,
            controllerRefreshToken: undefined,
          });
        }

        console.error(
          `[otto] cleaned up auto-registered test controller ${registration.autoRegisteredClientId}`,
        );
      } catch (error) {
        console.error(
          `[otto] failed to clean up auto-registered test controller ${registration.autoRegisteredClientId}: ${String(error)}`,
        );
      }
    }
  }
}
