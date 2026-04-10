import type { CommandPayload, Envelope } from '@telepat/otto-protocol';

const LEDGER_KEY = 'commandReplayLedger';
const LEDGER_TTL_MS = 5 * 60 * 1000;
const LEDGER_MAX_ENTRIES = 200;
const REPLAY_COMPACT_MAX_DEPTH = 6;
const REPLAY_COMPACT_MAX_STRING_LENGTH = 1_500;
const REPLAY_COMPACT_MAX_ARRAY_LENGTH = 50;
const REPLAY_COMPACT_MAX_OBJECT_KEYS = 50;

type ReplayLedgerEntry = {
  dedupeKey: string;
  seenAt: number;
  response: Envelope;
};

type SessionStorageLike = {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
};

function compactString(value: string): string {
  if (value.length <= REPLAY_COMPACT_MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, REPLAY_COMPACT_MAX_STRING_LENGTH - 3)}...`;
}

function compactForReplay(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return compactString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (depth >= REPLAY_COMPACT_MAX_DEPTH) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, REPLAY_COMPACT_MAX_ARRAY_LENGTH)
      .map((item) => compactForReplay(item, depth + 1));
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    const limitedEntries = entries.slice(0, REPLAY_COMPACT_MAX_OBJECT_KEYS);

    for (const [key, entryValue] of limitedEntries) {
      // Preserve original command responses on the wire, but keep replay cache bounded.
      if (key === 'originalEntity') {
        continue;
      }
      output[key] = compactForReplay(entryValue, depth + 1);
    }

    return output;
  }

  return String(value);
}

function compactEnvelopeForReplay(response: Envelope): Envelope {
  return {
    ...response,
    payload: compactForReplay(response.payload),
  };
}

async function persistLedger(
  storage: SessionStorageLike,
  entries: ReplayLedgerEntry[],
): Promise<void> {
  try {
    await storage.set({ [LEDGER_KEY]: entries });
    return;
  } catch {
    const compactEntries = entries.map((entry) => ({
      ...entry,
      response: compactEnvelopeForReplay(entry.response),
    }));

    try {
      await storage.set({ [LEDGER_KEY]: compactEntries });
      return;
    } catch {
      // Last resort: keep a very small compact tail to avoid command failure on quota.
      const tail = compactEntries.slice(Math.max(0, compactEntries.length - 5));
      try {
        await storage.set({ [LEDGER_KEY]: tail });
      } catch {
        // Replay cache best effort only; execution should not fail when persistence is full.
      }
    }
  }
}

function dedupeKeyForCommand(command: Envelope<CommandPayload>): string {
  const payload = command.payload;
  const fromPayload = payload.idempotencyKey?.trim();
  if (fromPayload) return fromPayload;
  return command.requestId;
}

function normalizeLedger(raw: unknown): ReplayLedgerEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is ReplayLedgerEntry => {
      if (!item || typeof item !== 'object') return false;
      const record = item as Partial<ReplayLedgerEntry>;
      return typeof record.dedupeKey === 'string' && typeof record.seenAt === 'number' && Boolean(record.response);
    })
    .sort((a, b) => a.seenAt - b.seenAt);
}

function pruneLedger(entries: ReplayLedgerEntry[], nowMs: number): ReplayLedgerEntry[] {
  const cutoff = nowMs - LEDGER_TTL_MS;
  const fresh = entries.filter((entry) => entry.seenAt >= cutoff);
  if (fresh.length <= LEDGER_MAX_ENTRIES) return fresh;
  return fresh.slice(fresh.length - LEDGER_MAX_ENTRIES);
}

export async function getReplayResponse(
  storage: SessionStorageLike,
  command: Envelope<CommandPayload>,
  nowMs = Date.now(),
): Promise<Envelope | undefined> {
  const dedupeKey = dedupeKeyForCommand(command);
  const raw = await storage.get([LEDGER_KEY]);
  const entries = pruneLedger(normalizeLedger(raw[LEDGER_KEY]), nowMs);
  const hit = entries.find((entry) => entry.dedupeKey === dedupeKey);

  await persistLedger(storage, entries);
  return hit?.response;
}

export async function rememberReplayResponse(
  storage: SessionStorageLike,
  command: Envelope<CommandPayload>,
  response: Envelope,
  nowMs = Date.now(),
): Promise<void> {
  const dedupeKey = dedupeKeyForCommand(command);
  const raw = await storage.get([LEDGER_KEY]);
  const entries = pruneLedger(normalizeLedger(raw[LEDGER_KEY]), nowMs)
    .filter((entry) => entry.dedupeKey !== dedupeKey);

  entries.push({
    dedupeKey,
    seenAt: nowMs,
    response,
  });

  await persistLedger(storage, entries);
}
