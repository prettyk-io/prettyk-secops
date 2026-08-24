/**
 * RET-UI-1: Retention & Cleanup Panel в Админке.
 * Управление хранилищем, очистка старых прогонов и временных дампов.
 * Защита: runs_index.ndjson и активные/закреплённые прогоны помечены «Защищено».
 *
 * Стилистика: SecOps Lab Dark, скругления 5–6px, токены --pk-*.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  message,
  Popconfirm,
  Radio,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ClearOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  LockOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import {
  fetchRetentionStatus,
  postRetentionClean,
  type RetentionStatus,
  type StorageCategory,
} from '../adminApi';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

const DEFAULT_CATEGORIES: StorageCategory[] = [
  {
    key: 'allure_reports',
    label: 'Allure-отчёты',
    bytes: 0,
    items_count: 0,
    description: 'HTML и ассеты сгенерированных отчётов Allure3',
  },
  {
    key: 'video_recordings',
    label: 'Видеозаписи (MP4)',
    bytes: 0,
    items_count: 0,
    description: 'Записи сессий браузера и VNC-скринкасты',
  },
  {
    key: 'journals_sse',
    label: 'Журналы логов и событий (SSE)',
    bytes: 0,
    items_count: 0,
    description: 'NDJSON потоки дневника событий прогонов',
  },
  {
    key: 'temp_dumps',
    label: 'Временные дампы',
    bytes: 0,
    items_count: 0,
    description: 'Сырые дампы трафика ZAP, interim-артефакты сканирования',
  },
  {
    key: 'runs_index',
    label: 'Мета-индекс реестра (runs_index.ndjson)',
    bytes: 0,
    items_count: 0,
    protected: true,
    description: 'Основной реестр истории прогонов системы (удаление запрещено)',
  },
];

export function RetentionPanel(): React.JSX.Element {
  const [status, setStatus] = useState<RetentionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaningDays, setCleaningDays] = useState(7);
  const [cleanActionLoading, setCleanActionLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRetentionStatus();
      setStatus(data);
    } catch {
      setStatus({
        ok: false,
        total_bytes: 0,
        total_runs: 0,
        protected_runs: 0,
        categories: DEFAULT_CATEGORIES,
        runs_index_protected: true,
        error: 'fetch_failed',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const categories = useMemo(() => {
    if (!status || !status.categories || status.categories.length === 0) {
      return DEFAULT_CATEGORIES;
    }
    return status.categories;
  }, [status]);

  const handleCleanByDays = async () => {
    setCleanActionLoading(true);
    try {
      const res = await postRetentionClean({ days: cleaningDays });
      if (res.ok) {
        void message.success(
          `Очистка завершена: освобождено ${formatBytes(res.freed_bytes)} (${res.deleted_items} объектов)`,
        );
        void loadStatus();
      } else {
        void message.error(res.error || 'Ошибка при очистке');
      }
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Ошибка при вызове очистки');
    } finally {
      setCleanActionLoading(false);
    }
  };

  const handleCleanTemp = async () => {
    setCleanActionLoading(true);
    try {
      const res = await postRetentionClean({ clean_temp_only: true });
      if (res.ok) {
        void message.success(
          `Временные дампы очищены: освобождено ${formatBytes(res.freed_bytes)}`,
        );
        void loadStatus();
      } else {
        void message.error(res.error || 'Ошибка при очистке временных дампов');
      }
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Ошибка при вызове очистки');
    } finally {
      setCleanActionLoading(false);
    }
  };

  const columns: ColumnsType<StorageCategory> = [
    {
      title: 'Тип артефактов',
      dataIndex: 'label',
      key: 'label',
      render: (v: string, row: StorageCategory) => (
        <Space>
          <FolderOpenOutlined style={{ color: 'var(--pk-accent, #109bdf)' }} />
          <Typography.Text strong style={{ fontSize: 13 }}>
            {v}
          </Typography.Text>
          {row.protected ? (
            <Tag color="success" icon={<LockOutlined />}>
              Защищено
            </Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Описание',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v?: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {v || '—'}
        </Typography.Text>
      ),
    },
    {
      title: 'Объектов',
      dataIndex: 'items_count',
      key: 'items_count',
      width: 120,
      render: (v: number) => (
        <Typography.Text style={{ fontSize: 12 }}>{v ?? 0}</Typography.Text>
      ),
    },
    {
      title: 'Занято на диске',
      dataIndex: 'bytes',
      key: 'bytes',
      width: 160,
      render: (v: number) => (
        <Typography.Text strong style={{ fontSize: 12, fontFamily: 'var(--pk-mono, monospace)' }}>
          {formatBytes(v)}
        </Typography.Text>
      ),
    },
  ];

  return (
    <div
      data-testid="admin-retention"
      className="pk-admin-page"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <Alert
        type="info"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message="Политика хранения и защита данных"
        description="Мета-индекс прогонов (runs_index.ndjson) и закреплённые аудиторские записи защищены от авто-удаления. Очистка освобождает место на диске, удаляя старые Allure-отчёты, MP4-видеозаписи и временные дампы сканирования."
      />

      {/* KPI карточки */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" className="pk-admin-kpi-card" data-testid="ret-total-space">
            <Typography.Text type="secondary" className="pk-admin-kpi-title">
              Общий объём хранилища
            </Typography.Text>
            <Statistic
              value={formatBytes(status?.total_bytes ?? 0)}
              valueStyle={{ fontSize: 22, fontWeight: 600, color: 'var(--pk-accent, #109bdf)' }}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Все артефакты и медиа
            </Typography.Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card size="small" className="pk-admin-kpi-card" data-testid="ret-total-runs">
            <Typography.Text type="secondary" className="pk-admin-kpi-title">
              Сохранённых прогонов
            </Typography.Text>
            <Statistic
              value={status?.total_runs ?? 0}
              valueStyle={{ fontSize: 22, fontWeight: 600 }}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              В локальном реестре
            </Typography.Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card size="small" className="pk-admin-kpi-card" data-testid="ret-protected-runs">
            <Typography.Text type="secondary" className="pk-admin-kpi-title">
              Защищённых прогонов
            </Typography.Text>
            <Statistic
              value={status?.protected_runs ?? 0}
              valueStyle={{ fontSize: 22, fontWeight: 600, color: 'var(--pk-success, #3fb27f)' }}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Не подлежат удалению
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      {/* Панель действий очистки */}
      <Card
        size="small"
        title="Действия по очистке"
        className="pk-admin-card"
        extra={
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => void loadStatus()}
            loading={loading}
          >
            Обновить
          </Button>
        }
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              padding: '8px 12px',
              background: 'var(--pk-surface-muted, rgba(255, 255, 255, 0.03))',
              borderRadius: 6,
              border: '1px solid var(--pk-border, #2a3350)',
            }}
          >
            <Space size={12} wrap>
              <Typography.Text>Очистить завершённые прогоны старше:</Typography.Text>
              <Radio.Group
                value={cleaningDays}
                onChange={(e) => setCleaningDays(e.target.value)}
                optionType="button"
                buttonStyle="solid"
                size="small"
              >
                <Radio.Button value={3}>3 дней</Radio.Button>
                <Radio.Button value={7}>7 дней</Radio.Button>
                <Radio.Button value={30}>30 дней</Radio.Button>
              </Radio.Group>
            </Space>

            <Popconfirm
              title={`Удалить данные прогонов старше ${cleaningDays} дней?`}
              description="Allure-отчёты, логи и видео старше указанного срока будут удалены. Защищённые прогоны и мета-индекс останутся."
              okText="Да, очистить"
              cancelText="Отмена"
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleCleanByDays()}
            >
              <Button
                type="primary"
                danger
                icon={<DeleteOutlined />}
                loading={cleanActionLoading}
                data-testid="clean-by-days-btn"
              >
                Очистить старше {cleaningDays} дней
              </Button>
            </Popconfirm>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              padding: '8px 12px',
              background: 'var(--pk-surface-muted, rgba(255, 255, 255, 0.03))',
              borderRadius: 6,
              border: '1px solid var(--pk-border, #2a3350)',
            }}
          >
            <div>
              <Typography.Text strong>Глубокая чистка временных дампов</Typography.Text>
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Удаляет незавершённые сессионные дампы, ZAP scratchpad и кеши без изменения истории прогонов
              </Typography.Text>
            </div>

            <Popconfirm
              title="Запустить глубокую чистку временных дампов?"
              description="Временные файлы будут удалены безвозвратно."
              okText="Очистить"
              cancelText="Отмена"
              onConfirm={() => void handleCleanTemp()}
            >
              <Button
                icon={<ClearOutlined />}
                loading={cleanActionLoading}
                data-testid="clean-temp-btn"
              >
                Очистить временные дампы
              </Button>
            </Popconfirm>
          </div>
        </Space>
      </Card>

      {/* Таблица категорий */}
      <Card size="small" title="Структура хранилища" className="pk-admin-card">
        {categories.length === 0 ? (
          <Empty description="Нет данных о хранилище" />
        ) : (
          <Table<StorageCategory>
            rowKey="key"
            size="small"
            loading={loading}
            columns={columns}
            dataSource={categories}
            pagination={false}
            locale={{ emptyText: 'Нет данных' }}
          />
        )}
      </Card>
    </div>
  );
}
