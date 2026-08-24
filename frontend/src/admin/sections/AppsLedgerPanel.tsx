/**
 * ADM-APP-1 + ADM-APP-2: Реестр приложений в Админке.
 * Чтение /api/runs/apps → группировка по app_code → раскрытие деплоев.
 * ADM-APP-2: кнопки Allure3 / Монитор в карточке.
 *
 * Стилистика: SecOps Lab Dark, скругления 5-6px, токены --pk-*.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import { fetchRunApps, ADMIN_ALLURE_BASE, ADMIN_LIVE_BASE, type RunApp, type RunAppDeploy, type RunAppInstance } from '../adminApi';
import { MONO_STACK } from '../../theme/tokens';

/* ── статус приложения (агрегация по instance-ам) ── */

type AppStatus = 'secure' | 'has_failures' | 'running' | 'unknown';

function deriveAppStatus(instances: RunAppInstance[]): AppStatus {
  const statuses = instances.map((i) => (i.status || '').toLowerCase());
  if (statuses.some((s) => s === 'running' || s === 'active')) return 'running';
  if (statuses.some((s) => s === 'failed' || s === 'error' || s === 'has_failures')) return 'has_failures';
  if (statuses.every((s) => s === 'success' || s === 'ok' || s === 'finished' || s === 'done')) return 'secure';
  return 'unknown';
}

const STATUS_LABEL: Record<AppStatus, string> = {
  secure: 'Secure',
  has_failures: 'Has Failures',
  running: 'Running',
  unknown: 'Unknown',
};

const STATUS_COLOR: Record<AppStatus, string> = {
  secure: 'success',
  has_failures: 'error',
  running: 'processing',
  unknown: 'default',
};

/* ── хелперы ── */

function fmtTs(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return '—';
  try {
    return new Date(ts * 1000).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

/* ── стилевые пресеты ── */

const PANEL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const TOOLBAR_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

/* ── типы строк таблицы ── */

type LedgerRow =
  | { type: 'app'; app: RunApp }
  | { type: 'deploy'; app_code: string; deploy: RunAppDeploy };

/* ── компонент ── */

export function AppsLedgerPanel(): React.JSX.Element {
  const [apps, setApps] = useState<RunApp[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRunApps()
      .then((data) => {
        if (!cancelled) {
          setApps(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApps([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!apps) return null;
    const q = search.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) => a.app_code.toLowerCase().includes(q));
  }, [apps, search]);

  const rows = useMemo((): LedgerRow[] => {
    if (!filtered) return [];
    const out: LedgerRow[] = [];
    for (const app of filtered) {
      out.push({ type: 'app', app });
      for (const deploy of app.deploys) {
        out.push({ type: 'deploy', app_code: app.app_code, deploy });
      }
    }
    return out;
  }, [filtered]);

  /* ── подтаблица: instance'ы внутри деплоя ── */

  function renderInstanceTable(deploy: RunAppDeploy, appCode: string): React.JSX.Element {
    const instanceCols: ColumnsType<RunAppInstance> = [
      {
        title: 'Instance',
        dataIndex: 'instance_id',
        width: 140,
        render: (v) => (
          <Typography.Text code style={{ fontSize: 12, fontFamily: MONO_STACK }}>
            {String(v).slice(0, 8)}
          </Typography.Text>
        ),
      },
      {
        title: 'Check ID',
        dataIndex: 'check_id',
        width: 140,
        render: (v) => (v ? <Typography.Text code style={{ fontSize: 12, fontFamily: MONO_STACK }}>{String(v).slice(0, 8)}</Typography.Text> : '—'),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        width: 120,
        render: (v) => {
          const s = (v || '').toLowerCase();
          const color =
            s === 'success' || s === 'ok' || s === 'finished'
              ? 'success'
              : s === 'failed' || s === 'error'
                ? 'error'
                : s === 'running' || s === 'active'
                  ? 'processing'
                  : 'default';
          return <Tag color={color}>{v || 'unknown'}</Tag>;
        },
      },
      {
        title: 'Last Run',
        dataIndex: 'last_run_ts',
        width: 130,
        render: (v) => fmtTs(v),
      },
      {
        title: '',
        key: 'actions',
        width: 220,
        render: (_, inst) => (
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              size="small"
              type="link"
              href={`${ADMIN_ALLURE_BASE}/app/${encodeURIComponent(appCode)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '0 4px' }}
            >
              Allure3
            </Button>
            <Button
              size="small"
              type="link"
              href={`${ADMIN_LIVE_BASE}/?run_id=${encodeURIComponent(inst.run_id)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '0 4px' }}
            >
              Монитор
            </Button>
          </div>
        ),
      },
    ];

    return (
      <Table<RunAppInstance>
        size="small"
        rowKey="instance_id"
        dataSource={deploy.instances}
        columns={instanceCols}
        pagination={false}
        showHeader={false}
        style={{ margin: 0 }}
      />
    );
  }

  /* ── основная таблица ── */

  if (apps === null) {
    return (
      <div data-testid="admin-apps-ledger" className="pk-admin-page" style={PANEL_STYLE}>
        <Typography.Text type="secondary">Загрузка...</Typography.Text>
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div data-testid="admin-apps-ledger" className="pk-admin-page" style={PANEL_STYLE}>
        <Empty description="Нет данных — реестр приложений пуст" data-testid="admin-apps-empty" />
      </div>
    );
  }

  const ledgerCols: ColumnsType<LedgerRow> = [
    {
      title: 'App Code',
      dataIndex: 'app_code',
      key: 'app_code',
      width: 200,
      render: (_: unknown, row: LedgerRow) => {
        if (row.type === 'app') {
          return (
            <Typography.Text strong style={{ fontSize: 13 }}>
              {row.app.app_code}
            </Typography.Text>
          );
        }
        return null;
      },
    },
    {
      title: 'Deploy URL',
      key: 'deploy_url',
      ellipsis: true,
      render: (_: unknown, row: LedgerRow) => {
        if (row.type === 'deploy') {
          return (
            <Typography.Text type="secondary" style={{ fontSize: 12, fontFamily: MONO_STACK }}>
              {row.deploy.deploy_url || '(без URL)'}
            </Typography.Text>
          );
        }
        return null;
      },
    },
    {
      title: 'Последний запуск',
      key: 'last_run',
      width: 140,
      render: (_: unknown, row: LedgerRow) => {
        if (row.type === 'app') {
          return <Typography.Text style={{ fontSize: 12 }}>{fmtTs(row.app.last_run_ts)}</Typography.Text>;
        }
        return null;
      },
    },
    {
      title: 'Статус',
      key: 'status',
      width: 140,
      render: (_: unknown, row: LedgerRow) => {
        if (row.type === 'app') {
          const allInstances = row.app.deploys.flatMap((d) => d.instances);
          const status = deriveAppStatus(allInstances);
          return <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>;
        }
        return null;
      },
    },
    {
      title: 'Instances',
      key: 'instances',
      render: (_: unknown, row: LedgerRow) => {
        if (row.type === 'app') {
          const total = row.app.deploys.reduce((s, d) => s + d.instances.length, 0);
          return (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {total} instance{total !== 1 ? 's' : ''}
            </Typography.Text>
          );
        }
        if (row.type === 'deploy') {
          return renderInstanceTable(row.deploy, row.app_code);
        }
        return null;
      },
    },
  ];

  /* ── рендер ── */

  return (
    <div data-testid="admin-apps-ledger" className="pk-admin-page" style={PANEL_STYLE}>
      <div style={TOOLBAR_STYLE}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Поиск по app_code"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 280 }}
          data-testid="apps-ledger-search"
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {filtered?.length ?? apps.length} приложений
        </Typography.Text>
      </div>

      <Table<LedgerRow>
        rowKey={(r) => (r.type === 'app' ? r.app.app_code : `${r.app_code}::${r.deploy.deploy_url}`)}
        size="small"
        loading={loading}
        columns={ledgerCols}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: 'Нет данных' }}
      />
    </div>
  );
}
