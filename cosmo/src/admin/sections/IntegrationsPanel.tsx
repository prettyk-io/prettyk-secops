import { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Tag,
  message,
} from 'antd';
import { ProCard } from '@ant-design/pro-components';
import { loadConnectors, probeConnectors, saveConnectors } from '../deployStore';
import {
  METRIC_PACKS,
  parseMetricPacks,
  serializeMetricPacks,
  type MetricPackId,
} from '../metricPacks';
import type { AirgapConnectors, ConnectorHealth, PromAuthMode } from '../types';

function healthColor(h: ConnectorHealth): string {
  if (h === 'ok') return 'success';
  if (h === 'degraded') return 'warning';
  if (h === 'down') return 'error';
  return 'default';
}

function healthTag(h: ConnectorHealth): React.JSX.Element {
  return <Tag color={healthColor(h)}>{h}</Tag>;
}

const DB_ENGINE_OPTIONS = [
  'PostgreSQL',
  'MySQL/MariaDB',
  'Microsoft SQL Server',
  'MongoDB',
].map((v) => ({ value: v, label: v }));

const SIEM_SOURCE_OPTIONS = [
  'Splunk',
  'Elasticsearch',
  'Grafana Loki',
  'HTTP endpoint',
].map((v) => ({ value: v, label: v }));

const MQ_ENGINE_OPTIONS = ['Kafka', 'RabbitMQ'].map((v) => ({ value: v, label: v }));

const PROM_AUTH_OPTIONS: { value: PromAuthMode; label: string }[] = [
  { value: 'none', label: 'Без auth' },
  { value: 'bearer', label: 'Bearer' },
  { value: 'basic', label: 'Basic' },
];

/** On-prem Allure / Dojo / Prometheus / evidence connectors — no SaaS outbound. */
export function IntegrationsPanel(): React.JSX.Element {
  const [connectors, setConnectors] = useState<AirgapConnectors>(() => loadConnectors());
  const [probing, setProbing] = useState(false);
  const [probeSummary, setProbeSummary] = useState<string>('');
  const [dojoTokenDraft, setDojoTokenDraft] = useState('');
  const [promTokenDraft, setPromTokenDraft] = useState('');
  const [siemTokenDraft, setSiemTokenDraft] = useState('');

  const patch = (partial: Partial<AirgapConnectors>): void => {
    setConnectors((c) => ({ ...c, ...partial }));
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }} data-testid="admin-integrations">
      <Alert
        type="info"
        showIcon
        data-testid="admin-integrations-airgap"
        message="Airgap"
        description="On-prem в периметре: allure-light-secops, DefectDojo, Prometheus, БД/SIEM/SSH/очередь. Studio-модуль коннектора берёт доступ отсюда. Probe = HTTP fetch; DB/SSH/MQ не зондируются."
      />
      {probeSummary ? (
        <Alert
          type="warning"
          showIcon
          data-testid="admin-integrations-probe-summary"
          message="Последний probe"
          description={probeSummary}
        />
      ) : null}

      <ProCard title="allure-light-secops" bordered>
        <Form layout="vertical" style={{ maxWidth: 560 }}>
          <Form.Item label="Base URL">
            <Input
              value={connectors.allure_base_url}
              onChange={(e) => patch({ allure_base_url: e.target.value })}
              placeholder="http://127.0.0.1:5050"
            />
          </Form.Item>
          <Form.Item label="Project id">
            <Input
              value={connectors.allure_project_id}
              onChange={(e) => patch({ allure_project_id: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="Health">{healthTag(connectors.allure_health)}</Form.Item>
        </Form>
      </ProCard>

      <ProCard title="DefectDojo" bordered>
        <Form layout="vertical" style={{ maxWidth: 560 }}>
          <Form.Item label="Base URL">
            <Input
              value={connectors.dojo_base_url}
              onChange={(e) => patch({ dojo_base_url: e.target.value })}
              placeholder="http://127.0.0.1:8081"
            />
          </Form.Item>
          <Form.Item label="API token (не в git)">
            <Input.Password
              value={dojoTokenDraft}
              onChange={(e) => setDojoTokenDraft(e.target.value)}
              placeholder={connectors.dojo_token_set ? '•••••••• (задан)' : 'токен'}
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item label="Token set">
            <Switch
              checked={connectors.dojo_token_set || Boolean(dojoTokenDraft.trim())}
              onChange={(checked) => {
                if (!checked) {
                  setDojoTokenDraft('');
                  patch({ dojo_token_set: false });
                }
              }}
            />
          </Form.Item>
          <Form.Item label="Health">{healthTag(connectors.dojo_health)}</Form.Item>
        </Form>
      </ProCard>

      <ProCard title="Prometheus" bordered data-testid="admin-integrations-prometheus">
        <Form layout="vertical" style={{ maxWidth: 560 }}>
          <Form.Item label="Base URL">
            <Input
              value={connectors.prom_url}
              onChange={(e) => patch({ prom_url: e.target.value })}
              placeholder="http://127.0.0.1:9090"
            />
          </Form.Item>
          <Form.Item label="Auth">
            <Select
              value={connectors.prom_auth}
              options={PROM_AUTH_OPTIONS}
              onChange={(v: PromAuthMode) => patch({ prom_auth: v })}
              style={{ width: 200 }}
            />
          </Form.Item>
          {connectors.prom_auth === 'basic' ? (
            <Form.Item label="Username">
              <Input
                value={connectors.prom_username}
                onChange={(e) => patch({ prom_username: e.target.value })}
              />
            </Form.Item>
          ) : null}
          {connectors.prom_auth !== 'none' ? (
            <Form.Item label="Token / password (не в git)">
              <Input.Password
                value={promTokenDraft}
                onChange={(e) => setPromTokenDraft(e.target.value)}
                placeholder={connectors.prom_token_set ? '•••••••• (задан)' : 'секрет'}
                autoComplete="off"
              />
            </Form.Item>
          ) : null}
          <Form.Item label="Lookback по умолчанию">
            <Input
              value={connectors.prom_lookback}
              onChange={(e) => patch({ prom_lookback: e.target.value })}
              placeholder="15m"
              style={{ width: 160 }}
            />
          </Form.Item>
          <Form.Item label="Metric packs">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(() => {
                const packs = parseMetricPacks(connectors.prom_metric_packs ?? '');
                return METRIC_PACKS.map((pack) => (
                  <Checkbox
                    key={pack.id}
                    checked={packs.includes(pack.id)}
                    onChange={(e) => {
                      const next: MetricPackId[] = e.target.checked
                        ? [...packs, pack.id]
                        : packs.filter((id) => id !== pack.id);
                      patch({ prom_metric_packs: serializeMetricPacks(next) });
                    }}
                  >
                    {pack.label}
                  </Checkbox>
                ));
              })()}
            </div>
          </Form.Item>
          <Form.Item label="Health">{healthTag(connectors.prom_health)}</Form.Item>
        </Form>
      </ProCard>

      <ProCard title="База данных (RO)" bordered>
        <Form layout="vertical" style={{ maxWidth: 560 }}>
          <Form.Item label="СУБД">
            <Select
              value={connectors.db_engine}
              options={DB_ENGINE_OPTIONS}
              onChange={(v: string) => patch({ db_engine: v })}
              style={{ width: 280 }}
            />
          </Form.Item>
          <Form.Item label="DSN">
            <Input.Password
              value={connectors.db_dsn}
              onChange={(e) => patch({ db_dsn: e.target.value })}
              placeholder="postgresql://ro@db:5432/app"
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item label="Схема / БД">
            <Input
              value={connectors.db_schema}
              onChange={(e) => patch({ db_schema: e.target.value })}
            />
          </Form.Item>
          <Form.Item>
            <Checkbox
              checked={connectors.db_read_only}
              onChange={(e) => patch({ db_read_only: e.target.checked })}
            >
              Только чтение
            </Checkbox>
          </Form.Item>
          <Form.Item label="Health">{healthTag(connectors.db_health)}</Form.Item>
        </Form>
      </ProCard>

      <ProCard title="Журналы / SIEM" bordered>
        <Form layout="vertical" style={{ maxWidth: 560 }}>
          <Form.Item label="Источник">
            <Select
              value={connectors.siem_source}
              options={SIEM_SOURCE_OPTIONS}
              onChange={(v: string) => patch({ siem_source: v })}
              style={{ width: 280 }}
            />
          </Form.Item>
          <Form.Item label="API URL">
            <Input
              value={connectors.siem_url}
              onChange={(e) => patch({ siem_url: e.target.value })}
              placeholder="https://splunk.bank.local:8089"
            />
          </Form.Item>
          <Form.Item label="API token (не в git)">
            <Input.Password
              value={siemTokenDraft}
              onChange={(e) => setSiemTokenDraft(e.target.value)}
              placeholder={connectors.siem_token_set ? '•••••••• (задан)' : 'токен'}
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item label="Запрос по умолчанию">
            <Input.TextArea
              value={connectors.siem_query}
              onChange={(e) => patch({ siem_query: e.target.value })}
              rows={2}
              placeholder="correlation_id:$run_id"
            />
          </Form.Item>
          <Form.Item label="Окно выборки">
            <Input
              value={connectors.siem_window}
              onChange={(e) => patch({ siem_window: e.target.value })}
              placeholder="last 15m"
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item label="Health">{healthTag(connectors.siem_health)}</Form.Item>
        </Form>
      </ProCard>

      <ProCard title="SSH" bordered>
        <Form layout="vertical" style={{ maxWidth: 560 }}>
          <Form.Item label="Хост">
            <Input
              value={connectors.ssh_host}
              onChange={(e) => patch({ ssh_host: e.target.value })}
              placeholder="jump.bank.local"
            />
          </Form.Item>
          <Form.Item label="Порт">
            <Input
              value={connectors.ssh_port}
              onChange={(e) => patch({ ssh_port: e.target.value })}
              style={{ width: 120 }}
            />
          </Form.Item>
          <Form.Item label="Пользователь">
            <Input
              value={connectors.ssh_username}
              onChange={(e) => patch({ ssh_username: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="Ключ задан">
            <Switch
              checked={connectors.ssh_key_set}
              onChange={(checked) => patch({ ssh_key_set: checked })}
            />
          </Form.Item>
          <Form.Item label="Allowlist команд">
            <Input.TextArea
              value={connectors.ssh_allowlist}
              onChange={(e) => patch({ ssh_allowlist: e.target.value })}
              rows={2}
              placeholder="ls, cat /var/log/app.log"
            />
          </Form.Item>
          <Form.Item label="Health">{healthTag(connectors.ssh_health)}</Form.Item>
        </Form>
      </ProCard>

      <ProCard title="Очередь сообщений" bordered>
        <Form layout="vertical" style={{ maxWidth: 560 }}>
          <Form.Item label="Брокер">
            <Select
              value={connectors.mq_engine}
              options={MQ_ENGINE_OPTIONS}
              onChange={(v: string) => patch({ mq_engine: v })}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item label="Broker URL">
            <Input
              value={connectors.mq_broker_url}
              onChange={(e) => patch({ mq_broker_url: e.target.value })}
              placeholder="kafka://broker:9092"
            />
          </Form.Item>
          <Form.Item label="Topic / queue">
            <Input
              value={connectors.mq_topic}
              onChange={(e) => patch({ mq_topic: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="Health">{healthTag(connectors.mq_health)}</Form.Item>
        </Form>
      </ProCard>

      <Space>
        <Button
          type="primary"
          onClick={() => {
            const next: AirgapConnectors = {
              ...connectors,
              dojo_token_set: connectors.dojo_token_set || Boolean(dojoTokenDraft.trim()),
              prom_token_set:
                connectors.prom_auth === 'none'
                  ? false
                  : connectors.prom_token_set || Boolean(promTokenDraft.trim()),
              siem_token_set: connectors.siem_token_set || Boolean(siemTokenDraft.trim()),
            };
            saveConnectors(next);
            setConnectors(next);
            setDojoTokenDraft('');
            setPromTokenDraft('');
            setSiemTokenDraft('');
            message.success('Интеграции сохранены локально (токены не в репозитории)');
          }}
        >
          Сохранить
        </Button>
        <Button
          loading={probing}
          data-testid="admin-integrations-probe"
          onClick={async () => {
            setProbing(true);
            try {
              const result = await probeConnectors(connectors);
              setConnectors(result.connectors);
              setProbeSummary(result.summary);
              message.info(result.summary);
            } finally {
              setProbing(false);
            }
          }}
        >
          Проверить health
        </Button>
      </Space>
      {connectors.last_probe_at ? (
        <TypographyMuted>Последний probe: {connectors.last_probe_at}</TypographyMuted>
      ) : null}
    </Space>
  );
}

function TypographyMuted({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span style={{ opacity: 0.65, fontSize: 12 }}>{children}</span>;
}
