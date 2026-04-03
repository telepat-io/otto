import type { CommandPayload, Envelope } from '@telepat/otto-protocol';

const LEDGER_KEY = 'commandReplayLedger';
const LEDGER_TTL_MS = 5 * 60 * 1000;
const LEDGER_MAX_ENTRIES = 200;

type ReplayLedgerEntry = {
  dedupeKey: string;
  seenAt: number;
  response: Envelope;
};

type SessionStorageLike = {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
};

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

  await storage.set({ [LEDGER_KEY]: entries });
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

  await storage.set({ [LEDGER_KEY]: entries });
}
