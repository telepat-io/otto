import type { OnboardingStorageSnapshot } from './onboarding-state.js';

export type ControllerAclClientRow = {
  clientId: string;
  name: string;
  description: string;
  avatarSeed?: string;
  createdAt: number;
  lastUsedAt?: number;
  revoked: boolean;
  granted: boolean;
  grantExpiresAt?: number;
};

export type ControllerAclResponse = {
  nodeId: string;
  clients: ControllerAclClientRow[];
};

function relayHttpFromWs(relayUrl: string): string {
  const parsed = new URL(relayUrl);
  parsed.search = '';
  parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  return parsed.toString().replace(/\/$/, '');
}

function formatTime(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'never';
  }
  return new Date(value).toLocaleString();
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function avatarStyle(seed: string): { background: string; initials: string } {
  const normalized = seed.trim() || 'otto';
  const hash = hashSeed(normalized);
  const hue = hash % 360;
  const bg = `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 40) % 360} 65% 38%))`;
  const initials = normalized
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'OT';

  return {
    background: bg,
    initials,
  };
}

export function renderAclRows(clients: ControllerAclClientRow[], aclList: HTMLDivElement): void {
  aclList.innerHTML = '';
  if (clients.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'acl-meta';
    empty.textContent = 'No registered controller clients yet.';
    aclList.appendChild(empty);
    return;
  }

  for (const client of clients) {
    const row = document.createElement('div');
    row.className = 'acl-row';

    const top = document.createElement('div');
    top.className = 'acl-row-top';

    const left = document.createElement('div');
    left.className = 'acl-left';

    const avatar = document.createElement('div');
    avatar.className = 'acl-avatar';
    const avatarData = avatarStyle(client.avatarSeed || client.name);
    avatar.style.background = avatarData.background;
    avatar.textContent = avatarData.initials;

    const textWrap = document.createElement('div');
    textWrap.className = 'acl-text';

    const label = document.createElement('div');
    label.className = 'acl-label';
    label.textContent = `${client.name} (${client.clientId})`;

    const description = document.createElement('div');
    description.className = 'acl-description';
    description.textContent = client.description;

    textWrap.appendChild(label);
    textWrap.appendChild(description);
    left.appendChild(avatar);
    left.appendChild(textWrap);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = `acl-action ${client.granted ? 'revoke' : 'grant'}`;
    action.dataset.clientId = client.clientId;
    action.dataset.grant = String(!client.granted);
    action.disabled = client.revoked;
    action.textContent = client.revoked
      ? 'Revoked'
      : (client.granted ? 'Revoke access' : 'Grant access');

    top.appendChild(left);
    top.appendChild(action);

    const meta = document.createElement('div');
    meta.className = 'acl-meta';
    const grantState = client.granted
      ? `granted${client.grantExpiresAt ? ` until ${formatTime(client.grantExpiresAt)}` : ''}`
      : 'awaiting approval';
    meta.textContent = `Last used ${formatTime(client.lastUsedAt)} • ${grantState}`;

    row.appendChild(top);
    row.appendChild(meta);
    aclList.appendChild(row);
  }
}

export async function listControllerAcl(snapshot: OnboardingStorageSnapshot): Promise<ControllerAclResponse> {
  const relayUrl = snapshot.relayUrl?.trim();
  const nodeAccessToken = snapshot.nodeAccessToken?.trim();
  if (!relayUrl || !nodeAccessToken) {
    throw new Error('Node is not authenticated.');
  }

  const base = relayHttpFromWs(relayUrl);
  const response = await fetch(`${base}/api/controller/access`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${nodeAccessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list ACL clients (${response.status})`);
  }

  return await response.json() as ControllerAclResponse;
}

export async function mutateControllerAcl(
  snapshot: OnboardingStorageSnapshot,
  clientId: string,
  grant: boolean,
): Promise<void> {
  const relayUrl = snapshot.relayUrl?.trim();
  const nodeAccessToken = snapshot.nodeAccessToken?.trim();
  if (!relayUrl || !nodeAccessToken) {
    throw new Error('Node is not authenticated.');
  }

  const base = relayHttpFromWs(relayUrl);
  const response = await fetch(`${base}/api/controller/access`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${nodeAccessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ clientId, grant }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update ACL (${response.status})`);
  }
}