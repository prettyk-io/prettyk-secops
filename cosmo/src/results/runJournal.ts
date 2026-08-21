/**
 * RES-3: parse Live journal API payload (not Allure clone).
 */

export type JournalPreset = 'all' | 'errors' | 'signal';

export type JournalEvent = {
  ts: number;
  kind: string;
  channel: string;
  text: string;
};

export type RunJournal = {
  kind?: string;
  run_id?: string;
  preset?: string;
  source?: string;
  events_total?: number;
  events_shown?: number;
  counts?: Record<string, number>;
  events?: JournalEvent[];
  ok?: boolean;
};

export function normalizeJournalEvent(raw: unknown): JournalEvent | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const kind = typeof row.kind === 'string' && row.kind.trim() ? row.kind.trim().toUpperCase() : 'NOTE';
  const text = typeof row.text === 'string' ? row.text : '';
  const channel =
    typeof row.channel === 'string' && row.channel.trim() ? row.channel.trim().toLowerCase() : 'diary';
  const ts = typeof row.ts === 'number' && Number.isFinite(row.ts) ? row.ts : 0;
  if (!text && kind === 'NOTE') {
    return null;
  }
  return { ts, kind, channel, text };
}

export function parseRunJournal(payload: unknown): RunJournal {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { events: [], events_total: 0, events_shown: 0 };
  }
  const raw = payload as Record<string, unknown>;
  const eventsRaw = Array.isArray(raw.events) ? raw.events : [];
  const events = eventsRaw
    .map(normalizeJournalEvent)
    .filter((e): e is JournalEvent => Boolean(e));
  const counts =
    raw.counts !== null && typeof raw.counts === 'object' && !Array.isArray(raw.counts)
      ? (raw.counts as Record<string, number>)
      : {};
  return {
    kind: typeof raw.kind === 'string' ? raw.kind : undefined,
    run_id: typeof raw.run_id === 'string' ? raw.run_id : undefined,
    preset: typeof raw.preset === 'string' ? raw.preset : undefined,
    source: typeof raw.source === 'string' ? raw.source : undefined,
    events_total: typeof raw.events_total === 'number' ? raw.events_total : events.length,
    events_shown: typeof raw.events_shown === 'number' ? raw.events_shown : events.length,
    counts,
    events,
    ok: raw.ok !== false,
  };
}

export function formatJournalTs(ts: number): string {
  if (!ts) {
    return '—';
  }
  try {
    return new Date(ts * 1000).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}
