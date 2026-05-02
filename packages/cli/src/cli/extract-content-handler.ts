import type { Envelope } from '@telepat/otto-protocol';
import type { OttoConfig } from '../config.js';
import { buildExtractContentRequest } from '../content-extraction.js';

export interface ExtractContentInput {
  format?: string;
  url?: string;
  tabSession?: string;
  nodeId?: string;
  selector?: string;
  maxChars?: number;
  distillMode?: string;
  fallbackToReadability?: boolean;
  timeout?: number;
}

export interface ExtractContentResult {
  format: string;
  action: string;
  response: Envelope;
}

export async function runExtractContentHandler(
  input: ExtractContentInput,
  deps: {
    loadConfig: () => OttoConfig;
    resolveTargetNodeId: (config: OttoConfig, nodeId?: string) => Promise<string>;
    runCommandOnce: (
      config: OttoConfig,
      targetNodeId: string,
      opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number },
    ) => Promise<Envelope>;
  },
): Promise<ExtractContentResult> {
  const config = deps.loadConfig();
  const targetNodeId = await deps.resolveTargetNodeId(config, input.nodeId);
  const timeoutMs = input.timeout ?? 60_000;

  const request = buildExtractContentRequest({
    format: input.format,
    url: input.url,
    tabSessionId: input.tabSession,
    selector: input.selector,
    maxChars: input.maxChars,
    distillMode: input.distillMode,
    fallbackToReadability: input.fallbackToReadability,
  });

  let resolvedTabSessionId = request.tabSessionId;
  let openedTabSessionId: string | undefined;

  try {
    if (request.requiresTemporaryTextTab) {
      const openResponse = await deps.runCommandOnce(config, targetNodeId, {
        action: 'primitive.tab.open',
        payload: { url: input.url },
        timeoutMs,
      });

      if (openResponse.messageType === 'error') {
        throw new Error(`primitive.tab.open failed: ${JSON.stringify(openResponse.payload)}`);
      }

      const openPayload = openResponse.payload as { data?: { tabSessionId?: string } };
      resolvedTabSessionId = openPayload.data?.tabSessionId;
      openedTabSessionId = resolvedTabSessionId;
      if (!resolvedTabSessionId) {
        throw new Error('primitive.tab.open succeeded but did not return tabSessionId');
      }
    }

    const payload = {
      ...request.payload,
      ...(resolvedTabSessionId ? { tabSessionId: resolvedTabSessionId } : {}),
    };

    const response = await deps.runCommandOnce(config, targetNodeId, {
      action: request.action,
      tabSession: resolvedTabSessionId,
      payload,
      timeoutMs,
    });

    return {
      format: request.format,
      action: request.action,
      response,
    };
  } finally {
    if (openedTabSessionId) {
      try {
        await deps.runCommandOnce(config, targetNodeId, {
          action: 'primitive.tab.close',
          tabSession: openedTabSessionId,
          payload: { tabSessionId: openedTabSessionId },
          timeoutMs,
        });
      } catch {
        // Best-effort cleanup for auto-opened extraction tabs.
      }
    }
  }
}
