import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Descriptions,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { ProCard } from '@ant-design/pro-components';
import {
  KeyOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  fetchAuthVaultStatus,
  postAuthVaultCheck,
  type AuthProfileSummary,
  type AuthVaultStatus,
} from '../adminApi';

function fmtTtl(ttlSec: number): string {
  if (ttlSec <= 0) return '—';
  if (ttlSec < 60) return `${Math.round(ttlSec)}с`;
  if (ttlSec < 3600) return `${Math.round(ttlSec / 60)}м`;
  return `${Math.round(ttlSec / 3600)}ч`;
}

export function AuthVaultPanel(): React.JSX.Element {
  const [status, setStatus] = useState<AuthVaultStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<{ id: string; ok: boolean; error: string } | null>(
    null,
  );

  const refresh = () => {
    setLoading(true);
    fetchAuthVaultStatus()
      .then(setStatus)
      .catch(() => setStatus({ ok: false, down: true, profiles: [] }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCheck = async (profileId: string) => {
    setCheckingId(profileId);
    setCheckResult(null);
    const res = await postAuthVaultCheck(profileId);
    setCheckResult({ id: profileId, ok: res.ok, error: res.error });
    if (res.ok) {
      message.success(`Auth flow OK · токенов: ${res.tokens.length}`);
    } else {
      message.error(`Auth flow failed: ${res.error}`);
    }
    setCheckingId(null);
    setTimeout(refresh, 1500);
  };

  const activeCount = status?.profiles.filter((p) => p.session_ok).length ?? 0;
  const totalCount = status?.profiles.length ?? 0;

  return (
    <div data-testid="auth-vault-panel" className="pk-admin-page">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          icon={<SafetyCertificateOutlined />}
          message="Auth Vault — pre-flight аутентификация и динамическая инъекция токенов"
          description="OAuth2/OIDC · HTTP-цепочки · Browser headless · mTLS. Секреты шифруются (AES-256-GCM) и маскируются в логах."
        />

        <ProCard title="Сводка" bordered>
          <Space size={48} wrap>
            <Statistic
              title="Активные сессии"
              value={activeCount}
              suffix={`/ ${totalCount}`}
              valueStyle={{ color: activeCount > 0 ? 'var(--pk-success, #52c41a)' : 'var(--pk-error, #cf1322)' }}
            />
            <Statistic title="Профилей" value={totalCount} />
          </Space>
        </ProCard>

        <ProCard
          title="Профили авторизации"
          bordered
          extra={
            <Button
              icon={<ReloadOutlined />}
              onClick={refresh}
              loading={loading}
              data-testid="auth-vault-refresh"
            >
              Обновить
            </Button>
          }
        >
          {loading ? (
            <Spin data-testid="auth-vault-loading" />
          ) : status?.down ? (
            <Alert type="warning" showIcon message="Live недоступен" data-testid="auth-vault-down" />
          ) : (
            <Table<AuthProfileSummary>
              rowKey="id"
              dataSource={status?.profiles ?? []}
              size="small"
              pagination={false}
              columns={[
                {
                  title: 'Профиль',
                  dataIndex: 'id',
                  render: (v: string, r) => (
                    <Space direction="vertical" size={0}>
                      <Typography.Text strong>{v}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {r.kind} · {r.auth_type}
                      </Typography.Text>
                    </Space>
                  ),
                },
                {
                  title: 'Сессия',
                  dataIndex: 'session_ok',
                  width: 140,
                  render: (ok: boolean, r) =>
                    ok ? (
                      <Tag color="success" icon={<KeyOutlined />}>
                        Валидна · {fmtTtl(r.ttl_sec)}
                      </Tag>
                    ) : (
                      <Tag color="error">Нет сессии</Tag>
                    ),
                },
                {
                  title: 'Токен',
                  dataIndex: 'masked_token',
                  width: 200,
                  ellipsis: true,
                  render: (v: string) => (
                    <Typography.Text code style={{ fontSize: 12 }}>
                      {v || '—'}
                    </Typography.Text>
                  ),
                },
                {
                  title: 'Ошибка',
                  dataIndex: 'last_error',
                  ellipsis: true,
                  render: (v: string) =>
                    v ? (
                      <Typography.Text type="danger" style={{ fontSize: 12 }}>
                        {v}
                      </Typography.Text>
                    ) : (
                      <Typography.Text type="secondary">—</Typography.Text>
                    ),
                },
                {
                  title: '',
                  key: 'action',
                  width: 140,
                  render: (_: unknown, r) => (
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      icon={<ThunderboltOutlined />}
                      loading={checkingId === r.id}
                      onClick={() => handleCheck(r.id)}
                      data-testid={`auth-vault-check-${r.id}`}
                    >
                      Check Auth Flow
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </ProCard>

        {checkResult && (
          <ProCard title={`Результат проверки: ${checkResult.id}`} bordered>
            {checkResult.ok ? (
              <Alert type="success" showIcon message="Auth flow успешен" description="Токен получен и проброшен в ZAP Replacer." />
            ) : (
              <Alert type="error" showIcon message="Auth flow провален" description={checkResult.error || 'Неизвестная ошибка'} />
            )}
          </ProCard>
        )}

        <ProCard title="Хранилище секретов" bordered>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Шифрование">
              <Badge status="success" text="AES-256-GCM (at-rest)" />
            </Descriptions.Item>
            <Descriptions.Item label="Маскирование">
              <Badge status="success" text="Bearer/JWT/password в логах Allure3 и PrettyK Live" />
            </Descriptions.Item>
            <Descriptions.Item label="Ключ">
              <Typography.Text code>KDT_VAULT_KEY</Typography.Text>
              <Typography.Text type="secondary"> (или производный от KDT_MANIFEST_KEY)</Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        </ProCard>
      </Space>
    </div>
  );
}
