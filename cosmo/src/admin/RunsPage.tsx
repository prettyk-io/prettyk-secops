/**
 * VN-ADM: RunsPage — реестр прогонов (read-only) из /api/runs/index.
 * down → «Нет данных».
 * ADM-VIS D3/D4: gate-язык PASS/WATCH/FAIL (adminGateUi) + RU-фильтры Вердикт/Статус/Владелец.
 */
import { Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useRunsIndex } from './hooks';
import type { RunIndexRow } from './adminApi';
import { gateLabel, gateTagColor, toneFromVerdict } from './adminGateUi';
import { useLocale } from '../locales';

function fmtAgo(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(t);
  } catch {
    return iso;
  }
}

function verdictTag(v?: string | null): React.JSX.Element {
  const tone = toneFromVerdict(v);
  return <Tag color={gateTagColor(tone)}>{gateLabel(tone)}</Tag>;
}

function unique(values: (string | undefined | null)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v || '').trim();
    if (s && s !== '—') set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function RunsPage(): React.JSX.Element {
  const runs = useRunsIndex(200);
  const { dict } = useLocale();

  const verdicts = unique(runs.map((r) => gateLabel(toneFromVerdict(r.ci_verdict))));
  const statuses = unique(runs.map((r) => r.status));
  const owners = unique(runs.map((r) => r.owner_user_id));

  const columns: ColumnsType<RunIndexRow> = [
    { title: dict.runs.id, dataIndex: 'run_id', ellipsis: true, render: (v) => <code>{v}</code> },
    { title: dict.runs.time, dataIndex: 'started_at', width: 150, render: (_, r) => fmtAgo(r.started_at) },
    {
      title: dict.runs.status,
      dataIndex: 'status',
      width: 120,
      render: (v) => <Tag>{v || '—'}</Tag>,
      filters: statuses.map((s) => ({ text: s, value: s })),
      onFilter: (value, r) => (r.status || '') === value,
    },
    {
      title: dict.runs.verdict,
      dataIndex: 'ci_verdict',
      width: 120,
      render: (_, r) => verdictTag(r.ci_verdict),
      filters: verdicts.map((v) => ({ text: v, value: v })),
      onFilter: (value, r) => gateLabel(toneFromVerdict(r.ci_verdict)) === value,
    },
    {
      title: dict.runs.owner,
      dataIndex: 'owner_user_id',
      width: 150,
      filters: owners.map((o) => ({ text: o, value: o })),
      onFilter: (value, r) => (r.owner_user_id || '') === value,
    },
  ];

  return (
    <div data-testid="admin-runs" className="pk-admin-page">
      {runs.length === 0 ? (
        <Typography.Text type="secondary" data-testid="admin-runs-empty">
          {dict.runs.noData}
        </Typography.Text>
      ) : (
        <Table<RunIndexRow>
          rowKey="run_id"
          size="small"
          columns={columns}
          dataSource={runs}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: dict.runs.empty }}
        />
      )}
    </div>
  );
}
