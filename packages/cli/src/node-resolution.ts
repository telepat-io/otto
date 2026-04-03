import { deriveHttpUrl, type OttoConfig } from './config.js';

export type ConnectedNode = { nodeId: string };

type ConnectedNodesResponse = {
  nodes?: ConnectedNode[];
};

function uniqueNodeIds(nodes: ConnectedNode[]): string[] {
  const deduped = new Set<string>();
  for (const node of nodes) {
    const nodeId = String(node.nodeId ?? '').trim();
    if (!nodeId) continue;
    deduped.add(nodeId);
  }
  return [...deduped];
}

export async function fetchConnectedNodeIds(config: OttoConfig): Promise<string[]> {
  if (!config.controllerAccessToken) {
    return [];
  }

  const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
  const response = await fetch(`${base}/api/nodes/connected`, {
    headers: {
      authorization: `Bearer ${config.controllerAccessToken}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Failed to query connected nodes: HTTP ${response.status}`);
  }

  const parsed = await response.json() as ConnectedNodesResponse;
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  return uniqueNodeIds(nodes);
}

export async function resolveTargetNodeId(config: OttoConfig, explicitNodeId?: string): Promise<string> {
  if (explicitNodeId) {
    return explicitNodeId;
  }

  const configuredNodeId = config.targetNodeId;
  const connectedNodeIds = await fetchConnectedNodeIds(config);

  if (configuredNodeId) {
    if (connectedNodeIds.length === 0 || connectedNodeIds.includes(configuredNodeId)) {
      return configuredNodeId;
    }

    if (connectedNodeIds.length === 1) {
      return connectedNodeIds[0] as string;
    }

    throw new Error(
      `Configured targetNodeId ${configuredNodeId} is offline. Multiple nodes are connected (${connectedNodeIds.join(', ')}); pass --node-id explicitly.`,
    );
  }

  if (connectedNodeIds.length === 1) {
    return connectedNodeIds[0] as string;
  }

  if (connectedNodeIds.length > 1) {
    throw new Error(`Missing targetNodeId. Multiple nodes are connected (${connectedNodeIds.join(', ')}); pass --node-id.`);
  }

  throw new Error('Missing targetNodeId. Set with `otto config --node-id` or pass --node-id');
}
