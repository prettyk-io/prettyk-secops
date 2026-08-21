/**
 * DEFECTDOJO-BIDIRECTIONAL-SYNC: UI-контроллер синка в Админке.
 *
 * GET /api/dojo/sync/status → состояние
 * POST /api/dojo/sync/trigger → запуск фонового синка
 *
 * Стилистика: SecOps Lab Dark, скругления 5-6px, --pk-* токены.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Descriptions,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd';
import { ProCard } from '@ant-design/pro-components';
import {
  ReloadOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { fetchJson, ADMIN_LIVE_BASE } from '../adminApi';

export type DojoSyncStatus = {
  ok: boolean;
  running: boolean;
  last_sync_at?: number | null;
  last_sync_ok?: boolean | null;
  pushed: number;
  deduped: number;
  active_count: number;
  suppressed_count: number;
  last_error?: string | null;
  test_id?: string | null;
};

export type SyncTriggerResult = {
  ok: boolean;
  started: boolean;
  already_running?: boolean;
};

async function fetchSyncStatus(fetchImpl: typeof fetch = fetch): Promise<DojoSyncStatus> {
  const raw = await fetchJson<DojoSyncStatus>(
    `${ADMIN_LIVE_BASE}/api/dojo/sync/status`,
    fetchImpl,
  );
  if (!raw) {
    return {
      ok: false,
      running: false,
      pushed: 0,
      deduped: 0,
      active_count: 0,
      suppressed_count: 0,
    };
  }
  return raw;
}

async function triggerSync(
  testId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncTriggerResult> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetchImpl(`${ADMIN_LIVE_BASE}/api/dojo/sync/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test_id: testId || undefined }),
      cache: 'no-store',
      signal: ctrl.signal,
    });
    window.clearTimeout(timer);
    return (await res.json()) as SyncTriggerResult;
  } catch {
    window.clearTimeout(timer);
    return { ok: false, started: false };
  }
}

function fmtTime(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return '—';
  try {
    return new Date(ts * 1000).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

export function DojoSyncManager(): React.JSX.Element {
  const [status, setStatus] = useState<DojoSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testId, setTestId] = useState('');

  const refresh = () => {
    fetchSyncStatus()
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch(() => {
        setError('Не удалось загрузить состояние синка');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    const result = await triggerSync(testId);
    if (result.already_running) {
      message.info('Синк уже выполняется');
    } else if (result.ok && result.started) {
      message.success('Синк запущен');
    } else {
      message.error('Не удалось запустить синк');
    }
    setSyncing(false);
    // задержка: worker ещё не финишировал, но состояние обновим через 3с
    setTimeout(refresh, 3000);
  };

  return (
    <div data-testid="dojo-sync-manager" className="pk-admin-page">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="Двунаправленный синк DefectDojo"
          description="Push находок фаззера и атак → Dojo · Дедуп по fingerprint · Обратный импорт статусов (False Positive / Risk Accepted) для подавления в Allure3."
        />

        <ProCard title="Состояние синка" bordered>
          {loading ? (
            <Spin data-testid="dojo-sync-loading" />
          ) : error ? (
            <Alert type="error" message={error} showIcon />
          ) : status && status.ok === false ? (
            <Alert
              type="warning"
              showIcon
              message="Live недоступен"
              description="Не удалось получить состояние синка DefectDojo."
              data-testid="dojo-sync-down"
            />
          ) : status ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Descriptions column={2} size="small" bordered>
                <Descriptions.Item label="Статус">
                  {status.running ? (
                    <Tag icon={<SyncOutlined spin />} color="processing">
                      Выполняется...
                    </Tag>
                  ) : status.last_sync_ok === true ? (
                    <Tag icon={<CheckCircleOutlined />} color="success">
                      OK
                    </Tag>
                  ) : status.last_sync_ok === false ? (
                    <Tag icon={<CloseCircleOutlined />} color="error">
                      Ошибка
                    </Tag>
                  ) : (
                    <Tag color="default">Не запускался</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Последний синк">
                  {fmtTime(status.last_sync_at)}
                </Descriptions.Item>
                <Descriptions.Item label="Test ID">
                  {status.test_id ? (
                    <Typography.Text code>{status.test_id}</Typography.Text>
                  ) : (
                    <Typography.Text type="secondary">—</Typography.Text>
                  )}
                </Descriptions.Item>
                {status.last_error ? (
                  <Descriptions.Item label="Ошибка" span={2}>
                    <Typography.Text type="danger" style={{ fontSize: 12 }}>
                      {status.last_error}
                    </Typography.Text>
                  </Descriptions.Item>
                ) : null}
              </Descriptions>

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <Statistic
                  title="Отправлено"
                  value={status.pushed}
                  valueStyle={{ color: 'var(--pk-accent, #8ab4f8)' }}
                />
                <Statistic
                  title="Дедуплицировано"
                  value={status.deduped}
                  valueStyle={{ color: 'var(--pk-warning, #d29922)' }}
                />
                <Statistic
                  title="Активные"
                  value={status.active_count}
                  suffix={
                    <Badge
                      status={status.suppressed_count === 0 ? 'success' : 'warning'}
                      style={{ marginLeft: 8 }}
                    />
                  }
                />
                <Statistic
                  title="Подавлено"
                  value={status.suppressed_count}
                  valueStyle={{ color: status.suppressed_count > 0 ? 'var(--pk-error, #cf1322)' : undefined }}
                />
              </div>
            </Space>
          ) : null}
        </ProCard>

        <ProCard title="Действия" bordered>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Typography.Text>Test ID (опционально):</Typography.Text>
              <Select
                style={{ width: 200 }}
                placeholder="Не указан"
                allowClear
                value={testId || undefined}
                onChange={(v: string | undefined) => setTestId(v ?? '')}
                options={[
                  { value: '', label: '— Не указан —' },
                  { value: 'default', label: 'default' },
                ]}
              />
            </div>

            <Space>
              <Button
                type="primary"
                icon={<SyncOutlined spin={syncing} />}
                loading={syncing}
                disabled={status?.running}
                onClick={handleSyncNow}
                data-testid="dojo-sync-trigger"
              >
                Запустить синк сейчас
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={refresh}
                loading={loading}
                data-testid="dojo-sync-refresh"
              >
                Обновить
              </Button>
            </Space>
          </Space>
        </ProCard>
      </Space>
    </div>
  );
}
