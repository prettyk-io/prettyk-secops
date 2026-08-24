import { useMemo, useState } from 'react';
import { Button, Checkbox, Form, Input, Modal, Select, Space, Tag, message } from 'antd';
import { ProCard, ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { listChecks } from '../../checks/checksStore';
import {
  applyBulkLink,
  filterCheckIdsByQuery,
  formatBulkLinkPreview,
  planBulkLink,
} from '../bulkLinkChecks';
import { APP_CODE_LABEL, formatAppCodeOption } from '../appCode';
import type { BankDeploy, DeployGate } from '../types';
import { ensureDeploy, listAppCodes, listDeploys } from '../deployStore';

export type DeployRegistryProps = {
  onOpenDeploy: (deployId: string) => void;
  onInitCheck: (deployId: string) => void;
};

function gateColor(gate?: DeployGate): string {
  switch (gate) {
    case 'pass':
      return 'success';
    case 'watch':
      return 'warning';
    case 'fail':
      return 'error';
    default:
      return 'default';
  }
}

type EnsureForm = {
  project_id: string;
  application_name?: string;
  deploy_env: string;
  deploy_url: string;
  app_group?: string;
};

/** Реестр деплоев — ProTable (ADM-VIS-2) + ensure (ADM-DEPLOY-ENSURE). */
export function DeployRegistry({
  onOpenDeploy,
  onInitCheck,
}: DeployRegistryProps): React.JSX.Element {
  const [q, setQ] = useState('');
  const [projectId, setProjectId] = useState<string | undefined>();
  const [tick, setTick] = useState(0);
  const [selectedDeployIds, setSelectedDeployIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [ensureOpen, setEnsureOpen] = useState(false);
  const [ensureBusy, setEnsureBusy] = useState(false);
  const [selectedCheckIds, setSelectedCheckIds] = useState<string[]>([]);
  const [checkQuery, setCheckQuery] = useState('');
  const [ensureForm] = Form.useForm<EnsureForm>();

  const appCodeOptions = useMemo(() => {
    void tick;
    return listAppCodes().map((a) => formatAppCodeOption(a.project_id, a.application_name));
  }, [tick]);

  const data = useMemo(
    () =>
      listDeploys({
        q: q.trim() || undefined,
        project_id: projectId,
      }),
    [q, projectId, tick],
  );
  const checks = useMemo(() => listChecks(), [tick, bulkOpen]);
  const filteredCheckIds = useMemo(
    () => filterCheckIdsByQuery(checks, checkQuery),
    [checks, checkQuery],
  );
  const bulkPlan = useMemo(
    () => planBulkLink(selectedDeployIds, selectedCheckIds),
    [selectedDeployIds, selectedCheckIds],
  );

  const columns: ProColumns<BankDeploy>[] = useMemo(
    () => [
      { title: 'Группа', dataIndex: 'app_group', width: 120, search: false },
      {
        title: 'Приложение',
        dataIndex: 'application_name',
        render: (_, row) => (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto' }}
            onClick={() => onOpenDeploy(row.deploy_id)}
          >
            {row.application_name}
          </Button>
        ),
      },
      {
        title: APP_CODE_LABEL,
        dataIndex: 'project_id',
        width: 140,
        search: false,
        render: (_, row) => <code>{row.project_id}</code>,
      },
      {
        title: 'Сборка',
        dataIndex: 'build_number',
        width: 100,
        search: false,
        render: (_, row) => row.build_number ?? row.build_id,
      },
      { title: 'Окружение', dataIndex: 'deploy_env', width: 90, search: false },
      {
        title: 'URL',
        dataIndex: 'deploy_url',
        ellipsis: true,
        search: false,
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        width: 90,
        search: false,
        render: (_, row) => <Tag>{row.status}</Tag>,
      },
      {
        title: 'Gate',
        dataIndex: 'last_gate',
        width: 90,
        search: false,
        render: (_, row) => (
          <Tag color={gateColor(row.last_gate)}>{row.last_gate ?? 'unknown'}</Tag>
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 180,
        search: false,
        render: (_, row) => (
          <Space size={4}>
            <Button type="link" size="small" onClick={() => onOpenDeploy(row.deploy_id)}>
              Карточка
            </Button>
            <Button type="link" size="small" onClick={() => onInitCheck(row.deploy_id)}>
              Проверка
            </Button>
          </Space>
        ),
      },
    ],
    [onInitCheck, onOpenDeploy],
  );

  const onBulkApply = () => {
    const plan = planBulkLink(selectedDeployIds, selectedCheckIds);
    if (plan.pairs.length === 0) {
      message.warning('Выбери деплои и checks');
      return;
    }
    const n = applyBulkLink(plan);
    message.success(`Связано пар: ${n} (${plan.deployIds.length}×${plan.checkIds.length})`);
    setBulkOpen(false);
    setSelectedCheckIds([]);
    setTick((t) => t + 1);
  };

  const onEnsure = async () => {
    try {
      const values = await ensureForm.validateFields();
      setEnsureBusy(true);
      const result = ensureDeploy({
        project_id: values.project_id,
        application_name: values.application_name,
        deploy_env: values.deploy_env,
        deploy_url: values.deploy_url,
        app_group: values.app_group,
      });
      message.success(
        result.created
          ? `Деплой создан: ${result.deploy.deploy_id}`
          : `Деплой уже в реестре: ${result.deploy.deploy_id}`,
      );
      setEnsureOpen(false);
      ensureForm.resetFields();
      setTick((t) => t + 1);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return;
      }
      message.error(err instanceof Error ? err.message : 'Не удалось ensure деплой');
    } finally {
      setEnsureBusy(false);
    }
  };

  return (
    <ProCard
      data-testid="admin-deploy-registry"
      size="small"
      title="Реестр деплоев"
      bordered
      extra={
        <Space wrap>
          <Select
            allowClear
            placeholder={APP_CODE_LABEL}
            style={{ width: 200 }}
            options={appCodeOptions}
            value={projectId}
            onChange={(v) => setProjectId(v)}
            data-testid="admin-deploy-filter-appcode"
          />
          <Input.Search
            allowClear
            placeholder={`${APP_CODE_LABEL}, URL…`}
            style={{ width: 220 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onSearch={() => setTick((n) => n + 1)}
          />
          <Button
            type="primary"
            data-testid="admin-deploy-ensure"
            onClick={() => setEnsureOpen(true)}
          >
            Создать / ensure
          </Button>
          <Button onClick={() => setTick((n) => n + 1)}>Обновить</Button>
          <Button
            data-testid="admin-deploy-bulk-link"
            disabled={selectedDeployIds.length === 0}
            onClick={() => setBulkOpen(true)}
          >
            Связать checks…
          </Button>
        </Space>
      }
    >
      <ProTable<BankDeploy>
        size="small"
        rowKey="deploy_id"
        search={false}
        options={{ density: true, reload: false, setting: true }}
        columns={columns}
        dataSource={data}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        rowSelection={{
          selectedRowKeys: selectedDeployIds,
          onChange: (keys) => setSelectedDeployIds(keys.map(String)),
        }}
        cardProps={{ bodyStyle: { padding: 0 } }}
      />

      <Modal
        title="Создать или ensure деплой"
        open={ensureOpen}
        onCancel={() => {
          setEnsureOpen(false);
          ensureForm.resetFields();
        }}
        onOk={() => void onEnsure()}
        okText="Ensure"
        confirmLoading={ensureBusy}
        data-testid="admin-deploy-ensure-modal"
        destroyOnClose
      >
        <Form form={ensureForm} layout="vertical" requiredMark={false}>
          <Form.Item
            name="project_id"
            label={APP_CODE_LABEL}
            rules={[{ required: true, message: 'Укажите код приложения' }]}
          >
            <Input placeholder="например ib-web" data-testid="admin-deploy-ensure-appcode" />
          </Form.Item>
          <Form.Item name="application_name" label="Название приложения">
            <Input placeholder="отображаемое имя" />
          </Form.Item>
          <Form.Item name="app_group" label="Группа">
            <Input placeholder="опционально" />
          </Form.Item>
          <Form.Item
            name="deploy_env"
            label="Env"
            rules={[{ required: true, message: 'Укажите env' }]}
            initialValue="lab"
          >
            <Input placeholder="lab / stage / preprod" data-testid="admin-deploy-ensure-env" />
          </Form.Item>
          <Form.Item
            name="deploy_url"
            label="URL сканирования"
            rules={[{ required: true, message: 'Укажите URL' }]}
          >
            <Input placeholder="https://…" data-testid="admin-deploy-ensure-url" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Связать выбранные деплои с checks"
        open={bulkOpen}
        onCancel={() => {
          setBulkOpen(false);
          setCheckQuery('');
        }}
        onOk={onBulkApply}
        okText="Связать"
        data-testid="admin-deploy-bulk-modal"
        destroyOnClose
      >
        <p style={{ opacity: 0.7, marginBottom: 8 }}>
          Деплои: {selectedDeployIds.length}. Preview:{' '}
          <span data-testid="admin-deploy-bulk-preview">
            {formatBulkLinkPreview(bulkPlan)}
          </span>
        </p>
        <Input.Search
          allowClear
          placeholder="Поиск check…"
          value={checkQuery}
          onChange={(e) => setCheckQuery(e.target.value)}
          style={{ marginBottom: 12 }}
          data-testid="admin-deploy-bulk-check-search"
        />
        <Checkbox.Group
          style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflow: 'auto' }}
          value={selectedCheckIds}
          onChange={(vals) => setSelectedCheckIds(vals.map(String))}
          options={checks
            .filter((c) => filteredCheckIds.includes(c.check_id))
            .map((c) => ({
              label: `${c.title} (${c.check_id.slice(0, 8)}…)`,
              value: c.check_id,
            }))}
        />
        {checks.length === 0 ? (
          <div style={{ opacity: 0.65 }}>Нет проверок в реестре — создайте проверку</div>
        ) : null}
      </Modal>
    </ProCard>
  );
}
