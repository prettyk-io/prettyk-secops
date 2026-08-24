import { useMemo } from 'react';
import { Button, Descriptions, Empty, Space, Table, Tag, Typography } from 'antd';
import { ProCard } from '@ant-design/pro-components';
import { getCheck } from '../../checks/checksStore';
import {
  resolveDeployEvidencePack,
  resolveDeployEvidenceStrip,
} from '../evidenceRegistry';
import { getDeploy, listLinksForDeploy } from '../deployStore';
import type { DeployGate } from '../types';
import { IntegrationEvidence } from './IntegrationEvidence';

export type DeployCardProps = {
  deployId: string;
  onBack: () => void;
  onInitCheck: (deployId: string) => void;
  onOpenCheck: (checkId: string) => void;
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

export function DeployCard({
  deployId,
  onBack,
  onInitCheck,
  onOpenCheck,
}: DeployCardProps): React.JSX.Element {
  const deploy = useMemo(() => getDeploy(deployId), [deployId]);
  const links = useMemo(() => listLinksForDeploy(deployId), [deployId]);

  const evidence = useMemo(() => {
    if (!deploy) {
      return [];
    }
    return resolveDeployEvidenceStrip(
      deploy.deploy_id,
      links.map((l) => l.check_id),
      deploy.hooks,
    );
  }, [deploy, links]);

  const pack = useMemo(() => {
    if (!deploy) {
      return null;
    }
    return resolveDeployEvidencePack(
      deploy.deploy_id,
      deploy.application_name,
      deploy.project_id,
    );
  }, [deploy]);

  if (!deploy) {
    return (
      <ProCard data-testid="admin-deploy-card">
        <Empty description="Деплой не найден" />
        <Button type="link" onClick={onBack}>
          К реестру
        </Button>
      </ProCard>
    );
  }

  const lastEvidence = evidence[0];
  const checkRows = links.map((link) => {
    const check = getCheck(link.check_id);
    const ref = evidence.find((e) => e.check_id === link.check_id);
    return {
      key: link.check_id,
      check_id: link.check_id,
      title: check?.title ?? link.check_id,
      status: check?.status ?? '—',
      linked_at: link.linked_at,
      allure: ref?.allure?.report_url,
      dojo: ref?.dojo?.engagement_url ?? ref?.dojo?.test_url,
      allure_project_id: ref?.allure?.allure_project_id,
    };
  });

  /** ADM-B3: last N runs across linked checks (newest first). */
  const lastRuns = links
    .flatMap((link) => {
      const check = getCheck(link.check_id);
      return (check?.runs ?? []).map((run) => ({
        key: `${link.check_id}:${run.run_id}`,
        check_id: link.check_id,
        title: check?.title ?? link.check_id,
        run_id: run.run_id,
        status: run.status,
        ci_verdict: run.ci_verdict,
        started_at: run.started_at,
      }));
    })
    .sort((a, b) =>
      String(b.started_at ?? '').localeCompare(String(a.started_at ?? '')),
    )
    .slice(0, 8);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }} data-testid="admin-deploy-card">
      <ProCard
        title={deploy.application_name}
        subTitle={deploy.deploy_id}
        extra={
          <Space>
            <Button onClick={onBack}>К реестру</Button>
            <Button type="primary" onClick={() => onInitCheck(deploy.deploy_id)}>
              Инициировать проверку
            </Button>
          </Space>
        }
      >
        <Descriptions
          column={2}
          size="small"
          bordered
          layout="horizontal"
          data-testid="admin-deploy-descriptions"
        >
          <Descriptions.Item label="Группа">{deploy.app_group}</Descriptions.Item>
          <Descriptions.Item label="Env">{deploy.deploy_env}</Descriptions.Item>
          <Descriptions.Item label="Код приложения">
            <Typography.Text code copyable>
              {deploy.project_id}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Сборка">
            {deploy.build_number ?? deploy.build_id}
          </Descriptions.Item>
          <Descriptions.Item label="Repo">{deploy.repo}</Descriptions.Item>
          <Descriptions.Item label="Статус">
            <Tag>{deploy.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="URL" span={2}>
            <Typography.Link href={deploy.deploy_url} target="_blank" rel="noreferrer">
              {deploy.deploy_url}
            </Typography.Link>
          </Descriptions.Item>
          <Descriptions.Item label="Ответственный">{deploy.app_leader ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Gate">
            <Tag color={gateColor(deploy.last_gate)}>{deploy.last_gate ?? 'unknown'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Allure (last)">
            {lastEvidence?.allure?.report_url ? (
              <Typography.Link
                href={lastEvidence.allure.report_url}
                target="_blank"
                rel="noreferrer"
              >
                report
                {lastEvidence.allure.allure_project_id
                  ? ` · ${lastEvidence.allure.allure_project_id}`
                  : ''}
              </Typography.Link>
            ) : (
              '—'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="DefectDojo (last)">
            {lastEvidence?.dojo?.engagement_url || lastEvidence?.dojo?.test_url ? (
              <Typography.Link
                href={
                  lastEvidence.dojo.engagement_url ?? lastEvidence.dojo.test_url ?? '#'
                }
                target="_blank"
                rel="noreferrer"
              >
                {lastEvidence.dojo.engagement_id
                  ? `engagement ${lastEvidence.dojo.engagement_id}`
                  : 'engagement'}
              </Typography.Link>
            ) : (
              '—'
            )}
          </Descriptions.Item>
        </Descriptions>
      </ProCard>

      <ProCard title="Последние запуски" bordered data-testid="admin-deploy-last-runs">
        <Table
          size="small"
          pagination={false}
          locale={{ emptyText: 'Нет запусков у связанных проверок' }}
          dataSource={lastRuns}
          columns={[
            {
              title: 'Проверка',
              dataIndex: 'title',
              render: (title: string, row) => (
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={() => onOpenCheck(row.check_id)}
                >
                  {title}
                </Button>
              ),
            },
            { title: 'run_id', dataIndex: 'run_id', width: 120, ellipsis: true },
            { title: 'status', dataIndex: 'status', width: 90 },
            {
              title: 'ci_verdict',
              dataIndex: 'ci_verdict',
              width: 110,
              render: (v?: string) => v || '—',
            },
          ]}
        />
      </ProCard>

      <ProCard title="Инстансы проверок" bordered data-testid="admin-deploy-checks">
        <Table
          size="small"
          pagination={false}
          locale={{ emptyText: 'Проверок ещё нет — инициируйте из деплоя' }}
          dataSource={checkRows}
          columns={[
            {
              title: 'Проверка',
              dataIndex: 'title',
              render: (title: string, row) => (
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={() => onOpenCheck(row.check_id)}
                >
                  {title}
                </Button>
              ),
            },
            { title: 'Статус', dataIndex: 'status', width: 100 },
            {
              title: 'allure_project_id',
              dataIndex: 'allure_project_id',
              width: 140,
              render: (v?: string) => (v ? <Typography.Text code>{v}</Typography.Text> : '—'),
            },
            {
              title: 'Allure',
              dataIndex: 'allure',
              width: 90,
              render: (url?: string) =>
                url ? (
                  <Typography.Link href={url} target="_blank" rel="noreferrer">
                    report
                  </Typography.Link>
                ) : (
                  '—'
                ),
            },
            {
              title: 'Dojo',
              dataIndex: 'dojo',
              width: 90,
              render: (url?: string) =>
                url ? (
                  <Typography.Link href={url} target="_blank" rel="noreferrer">
                    open
                  </Typography.Link>
                ) : (
                  '—'
                ),
            },
            { title: 'Связано', dataIndex: 'linked_at', width: 180 },
          ]}
        />
      </ProCard>

      {pack && (pack.history.length > 0 || pack.allure || pack.dojo) ? (
        <IntegrationEvidence pack={pack} />
      ) : (
        <ProCard title="Allure / Dojo" bordered data-testid="admin-deploy-evidence">
          <Typography.Text type="secondary">
            Нет evidence pack — init проверки или дождись finalize/hooks.
          </Typography.Text>
        </ProCard>
      )}
    </Space>
  );
}
