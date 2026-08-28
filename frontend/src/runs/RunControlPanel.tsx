/**
 * COS-F6: Run Control Panel — запуск и мониторинг Pipeline.
 *
 * E2E-FRONT: принимает runId, поллит /api/runs/{id}/status,
 * показывает живой прогресс без перезагрузки.
 */
import { useState, useEffect, useCallback } from 'react';
import { Button, Progress, Tabs, Typography, Tag, Table, Space, Card, Empty, Spin } from 'antd';
import {
  PlayCircleOutlined, StopOutlined, ReloadOutlined,
  CheckCircleFilled, CloseCircleFilled, SyncOutlined, ClockCircleFilled,
} from '@ant-design/icons';

export type RunStatus = 'idle' | 'running' | 'passed' | 'failed' | 'blocked';
export type BatchStatus = 'pending' | 'running' | 'passed' | 'failed' | 'blocked';

export interface GateDecision {
  gateId: string;
  gateName: string;
  status: 'pass' | 'fail' | 'watch' | 'pending';
  comment?: string;
  timestamp?: number;
}

export interface FindingItem {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  rule: string;
  path: string;
}

export interface RunState {
  runId: string;
  status: RunStatus;
  totalBatches: number;
  completedBatches: number;
  batches: { id: string; name: string; status: BatchStatus; duration?: number }[];
  gates: GateDecision[];
  findings: FindingItem[];
  startedAt?: string;
  finishedAt?: string;
}

const BATCH_STATUS_COLORS: Record<BatchStatus, string> = {
  pending: 'default', running: 'processing', passed: 'green', failed: 'red', blocked: 'orange',
};
const BATCH_STATUS_ICONS: Record<BatchStatus, React.ReactNode> = {
  pending: <ClockCircleFilled />, running: <SyncOutlined spin />, passed: <CheckCircleFilled />,
  failed: <CloseCircleFilled />, blocked: <ClockCircleFilled />,
};
const SEVERITY_COLORS: Record<string, string> = {
  critical: 'red', high: 'orange', medium: 'gold', low: 'blue', info: 'default',
};

// ── Live fetch ──

async function fetchRun(runId: string): Promise<RunState | null> {
  try {
    const r = await fetch(`/api/runs/${runId}/status`);
    if (!r.ok) return null;
    return (await r.json()) as RunState;
  } catch {
    return null;
  }
}

// ── Props ──

export interface RunControlPanelProps {
  /** E2E-FRONT: реальный run_id → live poll. null → MOCK. */
  runId?: string | null;
  onStart?: () => void;
  onCancel?: () => void;
  onRerun?: () => void;
}

// ── Fallback MOCK ──

const MOCK_RUN: RunState = {
  runId: 'run-mock',
  status: 'running',
  totalBatches: 6,
  completedBatches: 3,
  batches: [
    { id: 'b1', name: 'Checkout & Build', status: 'passed', duration: 45 },
    { id: 'b2', name: 'SAST: Semgrep', status: 'passed', duration: 120 },
    { id: 'b3', name: 'SCA: Dep Check', status: 'passed', duration: 85 },
    { id: 'b4', name: 'Deploy to Stage', status: 'running' },
    { id: 'b5', name: 'DAST: ZAP Scan', status: 'pending' },
    { id: 'b6', name: 'Quality Gate', status: 'pending' },
  ],
  gates: [
    { gateId: 'g-sast', gateName: 'SAST Gate', status: 'pass' },
    { gateId: 'g-sca', gateName: 'SCA Gate', status: 'pass' },
  ],
  findings: [],
  startedAt: '2026-08-27T15:00:00Z',
};

function isRunState(data: unknown): data is RunState {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.runId === 'string' && typeof d.status === 'string';
}

export function RunControlPanel({
  runId = null,
  onStart, onCancel, onRerun,
}: RunControlPanelProps) {
  const [liveRun, setLiveRun] = useState<RunState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');

  // ── Live poll ──
  useEffect(() => {
    if (!runId) return;
    let stopped = false;

    const poll = async () => {
      setLoading(true);
      const data = await fetchRun(runId);
      if (stopped) return;
      setLoading(false);
      if (isRunState(data)) {
        setLiveRun(data);
        setError(null);
      } else {
        setError('Не удалось загрузить статус прогона');
      }
    };

    poll();
    const timer = setInterval(poll, 4000);
    return () => { stopped = true; clearInterval(timer); };
  }, [runId]);

  const run = liveRun ?? MOCK_RUN;
  const progress = run.totalBatches > 0 ? Math.round((run.completedBatches / run.totalBatches) * 100) : 0;
  const isRunning = run.status === 'running';

  const batchColumns = [
    { title: 'Batch', dataIndex: 'name', key: 'name', render: (_: unknown, r: typeof run.batches[0]) => (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: r.status === 'passed' ? '#22c55e' : r.status === 'running' ? '#3b82f6' : r.status === 'failed' ? '#ef4444' : '#64748b' }}>
          {BATCH_STATUS_ICONS[r.status]}
        </span>
        {r.name}
      </span>
    )},
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: BatchStatus) => <Tag color={BATCH_STATUS_COLORS[s]}>{s}</Tag> },
    { title: 'Time', dataIndex: 'duration', key: 'duration', render: (d?: number) => d !== undefined ? `${d}s` : '—' },
  ];

  const findingColumns = [
    { title: 'Severity', dataIndex: 'severity', key: 'severity', render: (s: string) => <Tag color={SEVERITY_COLORS[s]}>{s.toUpperCase()}</Tag> },
    { title: 'Title', dataIndex: 'title', key: 'title' },
    { title: 'Rule', dataIndex: 'rule', key: 'rule', render: (r: string) => <code>{r}</code> },
    { title: 'Path', dataIndex: 'path', key: 'path', render: (p: string) => <code style={{ fontSize: 11 }}>{p}</code> },
  ];

  // ── Error / Loading / Empty cover ──
  if (runId && loading && !liveRun) {
    return <div style={{ padding: 24, textAlign: 'center' }}><Spin /><p style={{ color: '#64748b', fontSize: 12 }}>Загрузка прогона…</p></div>;
  }
  if (runId && error && !liveRun) {
    return <div style={{ padding: 24, textAlign: 'center' }}><p style={{ color: '#f87171', fontSize: 12 }}>{error}</p></div>;
  }

  return (
    <div style={{ padding: 12, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Typography.Text strong style={{ color: '#e2e8f0', fontSize: 15, flex: 1 }}>
          Run {run.runId} {runId && <Tag color="cyan">live</Tag>}
        </Typography.Text>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={onStart} disabled={isRunning} size="small" style={{ background: '#22c55e', borderColor: '#22c55e' }}>Start</Button>
        <Button danger icon={<StopOutlined />} onClick={onCancel} disabled={!isRunning} size="small">Cancel</Button>
        <Button icon={<ReloadOutlined />} onClick={onRerun} disabled={isRunning} size="small">Rerun</Button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <Typography.Text style={{ fontSize: 12, color: '#94a3b8' }}>Прогресс: {run.completedBatches} / {run.totalBatches}</Typography.Text>
          <Tag color={run.status === 'passed' ? 'green' : run.status === 'failed' ? 'red' : run.status === 'running' ? 'blue' : 'default'}>{run.status.toUpperCase()}</Tag>
        </div>
        <Progress percent={progress} status={run.status === 'failed' ? 'exception' : isRunning ? 'active' : 'normal'} size="small" />
      </div>

      {run.batches.length === 0 && run.gates.length === 0 ? (
        <Empty description="Нет данных о прогоне" />
      ) : (
        <Tabs activeKey={tab} onChange={setTab} size="small" style={{ flex: 1 }} items={[
          {
            key: 'overview', label: 'Overview',
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <Card size="small" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
                  <Typography.Text style={{ color: '#94a3b8', fontSize: 12 }}>Started: {run.startedAt ?? '—'} · Finished: {run.finishedAt ?? '—'}</Typography.Text>
                </Card>
                {run.batches.length > 0 && (
                  <Card size="small" title={<span style={{ color: '#e2e8f0', fontSize: 13 }}>Batches</span>} style={{ background: '#0f172a', borderColor: '#1e293b' }}>
                    <Table dataSource={run.batches} columns={batchColumns} rowKey="id" size="small" pagination={false} style={{ background: 'transparent' }} />
                  </Card>
                )}
              </Space>
            ),
          },
          { key: 'batches', label: 'Batches', children: <Table dataSource={run.batches} columns={batchColumns} rowKey="id" size="small" pagination={false} /> },
          {
            key: 'gates', label: `Gates (${run.gates.length})`,
            children: run.gates.length === 0 ? <Empty description="Нет гейтов" /> : run.gates.map((g) => (
              <Card key={g.gateId} size="small" style={{ marginBottom: 6, background: '#0f172a', borderColor: '#1e293b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography.Text style={{ color: '#e2e8f0', fontSize: 13 }}>{g.gateName}</Typography.Text>
                  <Tag color={g.status === 'pass' ? 'green' : g.status === 'fail' ? 'red' : g.status === 'watch' ? 'orange' : 'default'}>{g.status.toUpperCase()}</Tag>
                </div>
              </Card>
            )),
          },
          {
            key: 'findings', label: `Findings (${run.findings.length})`,
            children: run.findings.length === 0 ? <Empty description="Нет находок" /> : (
              <Table dataSource={run.findings} columns={findingColumns} rowKey="id" size="small" pagination={false} />
            ),
          },
        ]} />
      )}
    </div>
  );
}