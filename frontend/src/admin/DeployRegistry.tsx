/**
 * VN-ADM-5: DeployRegistry — коробочный read-only реестр деплойментов.
 * ensureDeploy hook (idempotent) без банковских/Cosmo-полей.
 * Данные — локальный реестр коробки (нет Live-ручки). Пусто → «Нет данных».
 */
import { useMemo, useState } from 'react';
import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

export type BoxDeploy = {
  deploy_id: string;
  name: string;
  env: string;
  url: string;
  status: string;
  updated_at?: string;
};

const STORAGE_KEY = 'pk.admin.deploys';
const DEFAULT_DEPLOYS: BoxDeploy[] = [];

function loadDeploys(): BoxDeploy[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DEPLOYS;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as BoxDeploy[]) : DEFAULT_DEPLOYS;
  } catch {
    return DEFAULT_DEPLOYS;
  }
}

function saveDeploys(deploys: BoxDeploy[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deploys));
  } catch {
    /* ignore */
  }
}

export type EnsureDeployInput = {
  project_id: string;
  application_name?: string;
  deploy_env: string;
  deploy_url: string;
};

export type EnsureDeployResult = {
  created: boolean;
  deploy: BoxDeploy;
};

/** Idempotent ensure: при совпадении project_id+env не создаёт дубль. */
export function ensureDeploy(input: EnsureDeployInput): EnsureDeployResult {
  const list = loadDeploys();
  const existing = list.find(
    (d) => d.name === input.project_id && d.env === input.deploy_env,
  );
  if (existing) {
    return { created: false, deploy: existing };
  }
  const deploy: BoxDeploy = {
    deploy_id: `${input.project_id}-${Date.now().toString(36)}`,
    name: input.project_id,
    env: input.deploy_env,
    url: input.deploy_url,
    status: 'active',
  };
  saveDeploys([...list, deploy]);
  return { created: true, deploy };
}

export function DeployRegistry(): React.JSX.Element {
  const [tick, setTick] = useState(0);
  const deploys = useMemo(() => loadDeploys(), [tick]);

  const columns: ColumnsType<BoxDeploy> = [
    { title: 'Приложение', dataIndex: 'name', render: (v) => <code>{v}</code> },
    { title: 'Окружение', dataIndex: 'env', width: 120 },
    { title: 'URL', dataIndex: 'url', ellipsis: true },
    { title: 'Статус', dataIndex: 'status', width: 100, render: (v) => <Tag>{v}</Tag> },
  ];

  return (
    <div data-testid="admin-deploy-registry" className="pk-admin-page">
      {deploys.length === 0 ? (
        <Typography.Text type="secondary" data-testid="admin-deploy-empty">
          Нет данных — реестр деплойментов пуст
        </Typography.Text>
      ) : (
        <Table<BoxDeploy>
          rowKey="deploy_id"
          size="small"
          columns={columns}
          dataSource={deploys}
          pagination={false}
          locale={{ emptyText: 'Нет деплойментов' }}
        />
      )}
      <Space style={{ marginTop: 16 }}>
        <Button size="small" onClick={() => setTick((n) => n + 1)}>
          Обновить
        </Button>
      </Space>
    </div>
  );
}
