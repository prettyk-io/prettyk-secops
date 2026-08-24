/**
 * RES-3: журнал прогона из Live export/diary — не клон Allure.
 */

import { useEffect, useState } from 'react';
import { Card, Segmented, Table, Typography } from 'antd';
import { LIVE_HOME, LIVE_JOURNAL_URL } from '../api/apiBase';
import {
  formatJournalTs,
  parseRunJournal,
  type JournalEvent,
  type JournalPreset,
  type RunJournal,
} from './runJournal';

export function ResultsJournalPanel({
  monitorUrl,
  runId,
}: {
  monitorUrl?: string;
  /** When set, journal fetches only events for this run. When null, hides panel entirely. */
  runId?: string | null;
} = {}): React.JSX.Element {
  const [preset, setPreset] = useState<JournalPreset>('signal');
  const [journal, setJournal] = useState<RunJournal | null>(null);

  useEffect(() => {
    if (runId == null) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `${LIVE_JOURNAL_URL}?run_id=${encodeURIComponent(runId)}&preset=${encodeURIComponent(preset)}&t=${Date.now()}`,
          { cache: 'no-store' },
        );
        if (!res.ok || cancelled) {
          return;
        }
        setJournal(parseRunJournal(await res.json()));
      } catch {
        if (!cancelled) {
          setJournal(null);
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [runId, preset]);

  if (runId == null) {
    return (
      <Card className="pk-results-journal-panel pk-admin-card" data-testid="results-journal-panel">
        <Typography.Text type="secondary" style={{ padding: 16, display: 'block' }}>
          Запустите проверку, чтобы увидеть журнал событий.
        </Typography.Text>
      </Card>
    );
  }

  const events = journal?.events ?? [];
  const empty = events.length === 0;

  return (
    <Card
      size="small"
      className="pk-results-journal"
      data-testid="results-journal-panel"
      title="Журнал запуска"
      extra={
        <Typography.Link href={monitorUrl || LIVE_HOME} target="_blank" rel="noreferrer">
          Live Monitor
        </Typography.Link>
      }
    >
      <div className="pk-results-journal-toolbar">
        <Segmented
          size="small"
          value={preset}
          onChange={(v) => setPreset(v as JournalPreset)}
          options={[
            { label: 'Сигнал', value: 'signal' },
            { label: 'Ошибки', value: 'errors' },
            { label: 'Все', value: 'all' },
          ]}
        />
        <Typography.Text type="secondary" className="pk-results-journal-meta">
          {journal?.source
            ? `${journal.source} · ${journal.events_shown ?? 0}/${journal.events_total ?? 0}`
            : 'ожидание Live'}
          {journal?.run_id ? ` · ${journal.run_id}` : ''}
        </Typography.Text>
      </div>
      <Table<JournalEvent>
        size="small"
        pagination={false}
        rowKey={(r, i) => `${r.ts}-${r.kind}-${i}`}
        dataSource={events.slice().reverse()}
        locale={{ emptyText: empty ? 'Нет событий (export/diary пуст)' : '—' }}
        columns={[
          {
            title: 'Время',
            dataIndex: 'ts',
            width: 88,
            render: (ts: number) => formatJournalTs(ts),
          },
          {
            title: 'Kind',
            dataIndex: 'kind',
            width: 88,
            render: (kind: string) => (
              <span className={`pk-results-journal-kind pk-results-journal-kind--${kind.toLowerCase()}`}>
                {kind}
              </span>
            ),
          },
          {
            title: 'Канал',
            dataIndex: 'channel',
            width: 72,
          },
          {
            title: 'Текст',
            dataIndex: 'text',
            ellipsis: true,
          },
        ]}
        scroll={{ y: 220 }}
      />
    </Card>
  );
}
