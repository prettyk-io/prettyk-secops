/**
 * DOJO-S-4: Единый статус синхронизации Dojo — дашборд в Admin.
 *
 * Пять метрик на одном экране:
 *   отправлено | deduped | активные | подавленные | ошибочные
 *
 * Бэкенд: GET /api/dojo/sync/status → pushed, deduped, active_count,
 *         suppressed_count, last_error
 */
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Descriptions,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import { ProCard } from '@ant-design/pro-components';
import {
  ReloadOutlined,
  SendOutlined,
  SafetyOutlined,
  AlertOutlined,
  BugOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { fetchJson, ADMIN_LIVE_BASE } from '../adminApi';

const { Text, Title } = Typography;

export type DojoDashboardData = {
  ok: boolean;
  configured: boolean;
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

async function fetchDashboard(): Promise<DojoDashboardData | null> {
  try {
    const data = await fetchJson<DojoDashboardData>(
      `${ADMIN_LIVE_BASE}/api/dojo/sync/status`,
      fetch,
    );
    return data;
  } catch {
    return null;
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
    return '—';
  }
}

export default function DojoSyncDashboard() {
  const [data, setData] = useState<DojoDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const result = await fetchDashboard();
    setData(result);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const hasError = data?.last_error;
  const isConfigured = data?.configured ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Заголовок + статус */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>
          Dojo Sync
        </Title>
        <Space>
          {isConfigured ? (
            <Tag color="green">подключён</Tag>
          ) : (
            <Tag color="red">не настроен</Tag>
          )}
          {data?.running ? (
            <Badge status="processing" text="синхронизация…" />
          ) : (
            <Badge status={data?.last_sync_ok ? 'success' : 'default'} text="ожидание" />
          )}
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={load}
            loading={loading}
          >
            Обновить
          </Button>
        </Space>
      </div>

      {/* Пять метрик */}
      <ProCard gutter={[12, 12]} ghost>
        <ProCard colSpan={{ xs: 24, sm: 12, md: 4 }}>
          <Statistic
            title="Отправлено"
            value={data?.pushed ?? 0}
            prefix={<SendOutlined />}
            valueStyle={{ color: '#1677ff' }}
          />
        </ProCard>
        <ProCard colSpan={{ xs: 24, sm: 12, md: 4 }}>
          <Statistic
            title="Дедуплицировано"
            value={data?.deduped ?? 0}
            prefix={<SafetyOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </ProCard>
        <ProCard colSpan={{ xs: 24, sm: 12, md: 4 }}>
          <Statistic
            title="Активные"
            value={data?.active_count ?? 0}
            prefix={<AlertOutlined />}
            valueStyle={{ color: data?.active_count ? '#fa8c16' : '#52c41a' }}
          />
        </ProCard>
        <ProCard colSpan={{ xs: 24, sm: 12, md: 4 }}>
          <Statistic
            title="Подавленные"
            value={data?.suppressed_count ?? 0}
            prefix={<BugOutlined />}
            valueStyle={{ color: '#8c8c8c' }}
          />
        </ProCard>
        <ProCard colSpan={{ xs: 24, sm: 12, md: 4 }}>
          <Statistic
            title="Ошибочные"
            value={hasError ? 1 : 0}
            prefix={<ExclamationCircleOutlined />}
            valueStyle={{ color: hasError ? '#ff4d4f' : '#52c41a' }}
          />
        </ProCard>
      </ProCard>

      {/* Ошибка / детали */}
      {hasError && (
        <Card size="small" style={{ borderColor: '#ff4d4f' }}>
          <Text type="danger">Ошибка синхронизации: {data!.last_error}</Text>
        </Card>
      )}

      {/* Детали последнего синка */}
      <Descriptions size="small" bordered column={{ xs: 1, sm: 2, md: 3 }}>
        <Descriptions.Item label="Последняя синхронизация">
          {fmtTime(data?.last_sync_at)}
        </Descriptions.Item>
        <Descriptions.Item label="Результат">
          {data?.last_sync_ok == null ? (
            '—'
          ) : data.last_sync_ok ? (
            <Tag color="green">успешно</Tag>
          ) : (
            <Tag color="red">ошибка</Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Test ID">
          <Text code>{data?.test_id || '—'}</Text>
        </Descriptions.Item>
      </Descriptions>
    </div>
  );
}