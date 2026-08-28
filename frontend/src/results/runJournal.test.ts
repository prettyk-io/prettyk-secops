import { describe, expect, it } from 'vitest';
import { normalizeJournalEvent, parseRunJournal } from './runJournal';

describe('runJournal', () => {
  it('normalizes event rows', () => {
    const ev = normalizeJournalEvent({
      ts: 100,
      kind: 'error',
      channel: 'Diary',
      text: 'boom',
    });
    expect(ev).toEqual({
      ts: 100,
      kind: 'ERROR',
      channel: 'diary',
      text: 'boom',
    });
  });

  it('parses API payload', () => {
    const j = parseRunJournal({
      ok: true,
      run_id: 'r1',
      preset: 'signal',
      events_total: 3,
      events: [
        { ts: 1, kind: 'HIGH', channel: 'scanner', text: 'SQLi' },
        { ts: 2, kind: 'NOTE', channel: 'diary', text: 'ok' },
      ],
      counts: { HIGH: 1, NOTE: 1 },
    });
    expect(j.run_id).toBe('r1');
    expect(j.events).toHaveLength(2);
    expect(j.events?.[0]?.kind).toBe('HIGH');
    expect(j.counts?.HIGH).toBe(1);
  });
});
