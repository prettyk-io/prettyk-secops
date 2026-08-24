import { useEffect, useMemo, useState } from 'react';
import { Button, Segmented, Select, Space, Tag, Typography } from 'antd';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { listChecks } from '../../checks/checksStore';
import type { CheckView } from '../../checks/types';
import {
  collectAdminRuns,
  filterAdminRuns,
  type AdminRunRow,
} from '../collectAdminRuns';
import { listAllDeployLinks, listDeploys } from '../deployStore';
import { listAllEvidence } from '../evidenceRegistry';
import {
  fetchLiveRunsIndexCached,
  mergeLocalAndLiveRuns,
  type LiveRunIndexItem,
} from '../mergeLiveAdminRuns';
import { gateLabel, gateTagColor, toneFromVerdict } from '../adminGateUi';

export type RunsPanelProps = {
  onOpenCheck: (checkId: string, view?: CheckView) => void;
  /** ADM-E1: open with 7d window. */
  initialWindow?: 'all' | '7d';
};

function formatTs(iso?: string): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusColor(status: string): string {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'running') return 'processing';
  return 'default';
}

/** Admin ledger: local checks.runs + Live runs index merge (ADM-POC-A/B). ADM-VIS-2: ProTable. */
export function RunsPanel({
  onOpenCheck,
  initialWindow = 'all',
}: RunsPanelProps): React.JSX.Element {
  const [verdict, setVerdict] = useState<string>('');
  const [windowKey, setWindowKey] = useState<'all' | '7d'>(initialWindow);
  const [deployId, setDeployId] = useState<string>('');
  const [ownerFilter, setOwnerFilter] = useState<string>('');
  const [tick, setTick] = useState(0);
  const [liveItems, setLiveItems] = useState<LiveRunIndexItem[]>([]);

  useEffect(() => {
    setTick((n) => n + 1);
    const ac = new AbortController();
    void fetchLiveRunsIndexCached(undefined, {
      signal: ac.signal,
      limit: 200,
    })
      .then(setLiveItems)
      .catch(() => setLiveItems([]));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    setWindowKey(initialWindow);
  }, [initialWindow]);

  const deploys = useMemo(() => listDeploys(), [tick]);
  const rowsAll = useMemo(() => {
    const local = collectAdminRuns({
      checks: listChecks(),
      evidence: listAllEvidence(),
      links: listAllDeployLinks(),
    });
    return mergeLocalAndLiveRuns(local, liveItems);
  }, [tick, liveItems]);

  const ownerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rowsAll) {
      if (r.owner_user_id) set.add(r.owner_user_id);
    }
    return [...set]
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
  }, [rowsAll]);

  const rows = useMemo(() => {
    let filtered = filterAdminRuns(rowsAll, {
      verdict: verdict || undefined,
      last7d: windowKey === '7d',
      deployId: deployId || undefined,
    });
    if (ownerFilter) {
      filtered = filtered.filter((r) => r.owner_user_id === ownerFilter);
    }
    return filtered;
  }, [rowsAll, verdict, windowKey, deployId, ownerFilter]);

  const columns: ProColumns<AdminRunRow>[] = useMemo(
    () => [
      {
        title: 'Проверка',
        dataIndex: 'check_title',
        ellipsis: true,
        render: (_, row) => (
          <Typography.Link
            data-testid={`admin-run-open-${row.run_id}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenCheck(row.check_id, 'results');
            }}
          >
            {row.check_title}
          </Typography.Link>
        ),
      },
      {
        title: 'Запуск',
        dataIndex: 'run_id',
        width: 120,
        ellipsis: true,
        search: false,
      },
      {
        title: 'Когда',
        dataIndex: 'started_at',
        width: 140,
        search: false,
        render: (_, row) => formatTs(row.started_at),
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        width: 100,
        search: false,
        render: (_, row) => <Tag color={statusColor(row.status)}>{row.status}</Tag>,
      },
      {
        title: 'Вердикт',
        dataIndex: 'ci_verdict',
        width: 100,
        search: false,
        render: (_, row) => {
          const tone = toneFromVerdict(row.ci_verdict);
          return (
            <Tag color={gateTagColor(tone)}>
              {row.ci_verdict ? gateLabel(tone) : '—'}
            </Tag>
          );
        },
      },
      {
        title: 'Владелец',
        dataIndex: 'owner_user_id',
        width: 80,
        search: false,
        render: (_, row) => row.owner_user_id || '—',
      },
      {
        title: 'Деплой',
        dataIndex: 'deploy_id',
        width: 110,
        ellipsis: true,
        search: false,
        render: (_, row) => row.deploy_id || '—',
      },
      {
        title: 'Allure',
        width: 72,
        search: false,
        render: (_, row) =>
          row.allure_url ? (
            <Typography.Link href={row.allure_url} target="_blank" rel="noreferrer">
              Allure
            </Typography.Link>
          ) : (
            <Typography.Text type="secondary" disabled>
              —
            </Typography.Text>
          ),
      },
      {
        title: 'Dojo',
        width: 64,
        search: false,
        render: (_, row) =>
          row.dojo_url ? (
            <Typography.Link href={row.dojo_url} target="_blank" rel="noreferrer">
              Dojo
            </Typography.Link>
          ) : (
            <Typography.Text type="secondary" disabled>
              —
            </Typography.Text>
          ),
      },
      {
        title: '',
        width: 72,
        search: false,
        render: (_, row) => (
          <Button
            size="small"
            type="link"
            style={{ paddingInline: 4 }}
            onClick={() => onOpenCheck(row.check_id, 'results')}
          >
            Results
          </Button>
        ),
      },
    ],
    [onOpenCheck],
  );

  return (
    <div
      data-testid="admin-runs"
      className="pk-admin-runs"
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <Space wrap size="middle">
        <Segmented
          data-testid="admin-runs-window"
          value={windowKey}
          onChange={(v) => setWindowKey(v as 'all' | '7d')}
          options={[
            { label: 'Все', value: 'all' },
            { label: '7д', value: '7d' },
          ]}
        />
        <Select
          data-testid="admin-runs-verdict"
          allowClear
          placeholder="Вердикт"
          style={{ minWidth: 140 }}
          value={verdict || undefined}
          onChange={(v) => setVerdict(v ?? '')}
          options={[
            { value: 'pass', label: 'pass' },
            { value: 'fail', label: 'fail / fail_gate' },
            { value: 'watch', label: 'watch' },
          ]}
        />
        <Select
          data-testid="admin-runs-deploy"
          allowClear
          placeholder="Деплой"
          style={{ minWidth: 180 }}
          value={deployId || undefined}
          onChange={(v) => setDeployId(v ?? '')}
          options={deploys.map((d) => ({
            value: d.deploy_id,
            label: d.application_name || d.deploy_id,
          }))}
        />
        <Select
          data-testid="admin-runs-owner"
          allowClear
          placeholder="Владелец"
          style={{ minWidth: 110 }}
          value={ownerFilter || undefined}
          onChange={(v) => setOwnerFilter(v ?? '')}
          options={ownerOptions}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12, opacity: 0.75 }}>
          {rows.length}
          {rowsAll.length !== rows.length ? ` / ${rowsAll.length}` : ''}
          {liveItems.length ? ` · Live+${liveItems.length}` : ''}
        </Typography.Text>
      </Space>
      <ProTable<AdminRunRow>
        size="small"
        rowKey="key"
        search={false}
        options={{ density: true, reload: false, setting: true }}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        dataSource={rows}
        columns={columns}
        locale={{ emptyText: 'Нет запусков программы' }}
        onRow={(row) => ({
          onClick: () => onOpenCheck(row.check_id, 'results'),
          style: { cursor: 'pointer' },
        })}
        cardProps={{ bodyStyle: { padding: 0 } }}
      />
    </div>
  );
}
