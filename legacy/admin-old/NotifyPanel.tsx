/**
 * VN-CUT2-FF2: NotifyPanel — секция «Оповещения» в Admin.
 * Список правил (тип/заголовок/окно/каналы/вкл), «Добавить» → форма,
 * toggle enabled, delete. Empty-state «Нет правил».
 * Honesty: всё localStorage, без live-сигналов (INTEGRATION не тащим).
 */
import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import {
  deleteNotifyRule,
  listNotifyRules,
  setNotifyRuleEnabled,
  upsertNotifyRule,
  NOTIFY_CHANNEL_LABEL,
  NOTIFY_KIND_LABEL,
  type NotifyChannel,
  type NotifyRule,
  type NotifyRuleKind,
} from './notifyRules';

const WINDOW_OPTIONS = [
  { value: 7, label: '7 дней' },
  { value: 30, label: '30 дней' },
];

function ruleKindColor(kind: NotifyRuleKind): string {
  if (kind === 'run_result' || kind === 'gate_change') return 'warning';
  if (kind === 'waiver_expiry' || kind === 'dojo_drift') return 'error';
  return 'processing';
}

export function NotifyPanel(): React.JSX.Element {
  const { message } = App.useApp();
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const rules = useMemo(() => listNotifyRules(), [tick]);

  const onSubmit = () => {
    const values = form.getFieldsValue();
    const channels: NotifyChannel[] = values.channels ?? [];
    if (channels.length === 0) {
      message.warning('Выбери хотя бы канал доставки');
      return;
    }
    upsertNotifyRule({
      kind: values.kind,
      title: String(values.title || '').trim(),
      teams: [],
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
      width: 190,
      render: (kind: NotifyRuleKind) => (
        <Tag color={ruleKindColor(kind)}>{NOTIFY_KIND_LABEL[kind]}</Tag>
      ),
    },
    {
      title: 'Заголовок',
      dataIndex: 'title',
      render: (v: string, row) => (
        <Typography.Text>{v || row.id}</Typography.Text>
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
      width: 64,
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
    <div data-testid="admin-notify" className="pk-admin-page">
      <Card
        size="small"
        className="pk-admin-card"
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setOpen(true)}
            data-testid="notify-add"
          >
            Добавить
          </Button>
        }
      >
        <Typography.Text className="pk-admin-card-title">Правила оповещений</Typography.Text>
        {rules.length === 0 ? (
          <Empty
            description="Нет правил"
            data-testid="notify-empty"
            style={{ margin: '16px 0' }}
          />
        ) : (
          <Table<NotifyRule>
            rowKey="id"
            size="small"
            dataSource={rules}
            columns={columns}
            pagination={rules.length > 8 ? { pageSize: 8 } : false}
            style={{ marginTop: 8 }}
          />
        )}
      </Card>

      <Modal
        title="Новое оповещение"
        open={open}
        onOk={onSubmit}
        onCancel={() => {
          setOpen(false);
          form.resetFields();
        }}
        width={520}
        okText="Создать"
        cancelText="Отмена"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            kind: 'run_result',
            window_days: 7,
            channels: ['gui'],
            enabled: true,
          }}
        >
          <Form.Item name="kind" label="Тип события" rules={[{ required: true }]}>
            <Select
              options={(Object.keys(NOTIFY_KIND_LABEL) as NotifyRuleKind[]).map((k) => ({
                value: k,
                label: NOTIFY_KIND_LABEL[k],
              }))}
            />
          </Form.Item>
          <Form.Item
            name="title"
            label="Заголовок"
            rules={[{ required: true, message: 'Введи заголовок' }]}
          >
            <Input placeholder="Например: FAIL по IB-гейтам" />
          </Form.Item>
          <Form.Item
            name="window_days"
            label="Окно"
            tooltip="За какой период считать события для правила"
          >
            <Select options={WINDOW_OPTIONS} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item
            name="channels"
            label="Каналы доставки"
            rules={[{ required: true, message: 'Выбери канал' }]}
          >
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
        </Form>
      </Modal>
    </div>
  );
}
