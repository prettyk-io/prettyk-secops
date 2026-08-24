import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ProCard } from '@ant-design/pro-components';
import { PlusOutlined } from '@ant-design/icons';
import { listChecks } from '../../checks/checksStore';
import {
  listDeploys,
  loadAdminPolicies,
} from '../deployStore';
import { listAllEvidence } from '../evidenceRegistry';
import { listAllDeployLinks } from '../deployStore';
import { formatAppCodeOption } from '../appCode';
import {
  collectNotifySignals,
  deleteNotifyRule,
  deriveNotifyFirings,
  listNotifyRules,
  setNotifyRuleEnabled,
  upsertNotifyRule,
  NOTIFY_CHANNEL_LABEL,
  NOTIFY_KIND_LABEL,
  NOTIFY_ROLE_OPTIONS,
  type NotifyChannel,
  type NotifyRule,
  type NotifyRuleKind,
} from '../notifyRules';

const WINDOW_OPTIONS = [
  { value: 7, label: '7 дней' },
  { value: 30, label: '30 дней' },
];

function ruleKindColor(kind: NotifyRuleKind): string {
  if (kind === 'run_result' || kind === 'gate_change') return 'warning';
  if (kind === 'waiver_expiry' || kind === 'dojo_drift') return 'error';
  return 'processing';
}

/** ADM-NOTIFY: смысл оповещений Admin (не копипаст портала Cosmo). */
export function NotifyPanel(): React.JSX.Element {
  const { message } = App.useApp();
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const rules = useMemo(() => listNotifyRules(), [tick]);
  const signals = useMemo(
    () =>
      collectNotifySignals({
        checks: listChecks(),
        deploys: listDeploys(),
        evidence: listAllEvidence(),
        waivers: loadAdminPolicies().waivers,
        links: listAllDeployLinks(),
      }),
    [tick],
  );
  const firings = useMemo(() => deriveNotifyFirings(rules, signals), [rules, signals]);

  const appOptions = useMemo(
    () =>
      listDeploys()
        .map((d) => formatAppCodeOption(d.project_id, d.application_name))
        .filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tick],
  );

  const onSubmit = () => {
    const values = form.getFieldsValue();
    const teams = (values.teams ?? []).filter(
      (t: { app_code?: string; role?: string }) => t.app_code && t.role,
    );
    if (teams.length === 0) {
      message.warning('Добавь хотя бы одну команду (код приложения + роль)');
      return;
    }
    const channels: NotifyChannel[] = values.channels ?? [];
    if (channels.length === 0) {
      message.warning('Выбери хотя бы канал доставки');
      return;
    }
    upsertNotifyRule({
      kind: values.kind,
      title: String(values.title || '').trim(),
      teams,
      channels,
      window_days: values.window_days,
      enabled: values.enabled !== false,
    });
    message.success('Правило оповещения создано');
    setOpen(false);
    form.resetFields();
    setTick((n) => n + 1);
  };

  const columns: ColumnsType<NotifyRule> = [
    {
      title: 'Тип',
      dataIndex: 'kind',
      width: 170,
      render: (kind: NotifyRuleKind) => (
        <Tag color={ruleKindColor(kind)}>{NOTIFY_KIND_LABEL[kind]}</Tag>
      ),
    },
    {
      title: 'Заголовок',
      dataIndex: 'title',
      render: (v: string, row) => (
        <Typography.Text>
          {v || row.id}
        </Typography.Text>
      ),
    },
    {
      title: 'Команда',
      key: 'teams',
      width: 240,
      render: (_, row) => (
        <Space size={4} wrap>
          {row.teams.map((t) => (
            <Tag key={`${t.app_code}:${t.role}`} style={{ marginInlineEnd: 4 }}>
              {t.app_code} · {t.role}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Каналы',
      dataIndex: 'channels',
      width: 120,
      render: (ch: NotifyChannel[]) =>
        ch.map((c) => NOTIFY_CHANNEL_LABEL[c]).join(', '),
    },
    {
      title: 'Окно',
      dataIndex: 'window_days',
      width: 90,
      render: (d: number) => `${d}д`,
    },
    {
      title: 'Сработало',
      key: 'firing',
      width: 96,
      render: (_, row) => {
        const n = firings.find((f) => f.rule.id === row.id)?.signals.length ?? 0;
        return n > 0 ? <Tag color="error">{n}</Tag> : <Tag>—</Tag>;
      },
    },
    {
      title: 'Вкл',
      dataIndex: 'enabled',
      width: 60,
      render: (enabled: boolean, row) => (
        <Switch
          size="small"
          checked={enabled}
          onChange={(v) => {
            setNotifyRuleEnabled(row.id, v);
            setTick((n) => n + 1);
          }}
        />
      ),
    },
    {
      title: '',
      key: 'del',
      width: 56,
      render: (_, row) => (
        <Button
          type="link"
          size="small"
          danger
          onClick={() => {
            deleteNotifyRule(row.id);
            setTick((n) => n + 1);
          }}
        >
          Удалить
        </Button>
      ),
    },
  ];

  return (
    <div data-testid="admin-notify" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {firings.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          data-testid="admin-notify-firing-alert"
          message={`Сработало сейчас: ${firings.length} ${
            firings.length === 1 ? 'правило' : 'правил(а)'
          }`}
          description={firings
            .slice(0, 5)
            .map((f) => `${f.rule.title} · ${f.signals.length}`)
            .join('; ')}
        />
      ) : null}

      <ProCard
        title="Правила оповещений"
        bordered
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setOpen(true)}
          >
            Добавить правило
          </Button>
        }
      >
        <Table<NotifyRule>
          rowKey="id"
          size="small"
          dataSource={rules}
          columns={columns}
          pagination={rules.length > 8 ? { pageSize: 8 } : false}
          locale={{ emptyText: 'Правил пока нет — создай первое' }}
        />
      </ProCard>

      <Modal
        title="Новое оповещение"
        open={open}
        onOk={onSubmit}
        onCancel={() => {
          setOpen(false);
          form.resetFields();
        }}
        width={560}
        okText="Создать"
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical" initialValues={{ kind: 'run_result', window_days: 7, channels: ['gui'], enabled: true, teams: [] }}>
          <Form.Item name="kind" label="Тип события" rules={[{ required: true }]}>
            <Select
              options={(Object.keys(NOTIFY_KIND_LABEL) as NotifyRuleKind[]).map((k) => ({
                value: k,
                label: NOTIFY_KIND_LABEL[k],
              }))}
            />
          </Form.Item>
          <Form.Item name="title" label="Заголовок" rules={[{ required: true, message: 'Введи заголовок' }]}>
            <Input placeholder="Например: FAIL по IB-гейтам" />
          </Form.Item>
          <Form.Item
            name="window_days"
            label="Окно"
            tooltip="За какой период считать события для правила"
          >
            <Select options={WINDOW_OPTIONS} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="channels" label="Каналы доставки" rules={[{ required: true, message: 'Выбери канал' }]}>
            <Select
              mode="multiple"
              placeholder="GUI / Email"
              options={(Object.keys(NOTIFY_CHANNEL_LABEL) as NotifyChannel[]).map((c) => ({
                value: c,
                label: NOTIFY_CHANNEL_LABEL[c],
              }))}
            />
          </Form.Item>
          <Form.Item name="enabled" label="Включено" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            label="Команда (код приложения + роль)"
            tooltip="Адресаты оповещения: как в портале — Команда = приложение + роль"
          >
            <Form.List name="teams">
              {(fields, { add, remove }) => (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {fields.map((field) => (
                    <Space key={field.key} align="baseline">
                      <Form.Item
                        name={[field.name, 'app_code']}
                        rules={[{ required: true, message: 'Код приложения' }]}
                      >
                        <Select
                          placeholder="Код приложения"
                          showSearch
                          style={{ width: 220 }}
                          options={appOptions}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'role']}
                        rules={[{ required: true, message: 'Роль' }]}
                      >
                        <Select
                          placeholder="Роль"
                          style={{ width: 190 }}
                          options={NOTIFY_ROLE_OPTIONS}
                        />
                      </Form.Item>
                      <Button type="link" onClick={() => remove(field.name)}>
                        Удалить
                      </Button>
                    </Space>
                  ))}
                  <Button type="dashed" onClick={() => add({})} icon={<PlusOutlined />}>
                    Добавить команду
                  </Button>
                </Space>
              )}
            </Form.List>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
