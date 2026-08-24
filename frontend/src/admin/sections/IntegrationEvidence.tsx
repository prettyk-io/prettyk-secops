import { Button, Descriptions, Space, Table, Tag, Typography } from 'antd';
import { ProCard, StatisticCard } from '@ant-design/pro-components';
import type { DeployEvidencePack } from '../evidenceTypes';
import { PassRateLine, SeverityBars, SeverityTrendChart } from './EvidenceCharts';

export type IntegrationEvidenceProps = {
  pack: DeployEvidencePack;
};

/**
 * Allure + Dojo showcase blocks: meta, history, charts.
 * Deep-links only — no iframe clone (backlog RES canon).
 */
export function IntegrationEvidence({ pack }: IntegrationEvidenceProps): React.JSX.Element {
  const allure = pack.allure;
  const dojo = pack.dojo;
  const summary = allure?.summary;

  return (
    <Space
      direction="vertical"
      size={16}
      style={{ width: '100%' }}
      data-testid="admin-integration-evidence"
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Болванка для банка: meta + история + чарты. Полный UI Allure/Dojo не клонируем —
        только extract и deep-link. Figma↔Pro: отдельный kit (Ant Design System for Figma / Pro
        Template), в Cursor MCP нет.
      </Typography.Paragraph>

      <ProCard
        title="Allure"
        subTitle={allure?.allure_project_id ?? '—'}
        bordered
        extra={
          allure?.report_url ? (
            <Button type="primary" size="small" href={allure.report_url} target="_blank">
              Открыть отчёт
            </Button>
          ) : null
        }
        data-testid="admin-allure-block"
      >
        <StatisticCard.Group direction="row">
          <StatisticCard statistic={{ title: 'Total', value: summary?.total ?? 0 }} />
          <StatisticCard statistic={{ title: 'Passed', value: summary?.passed ?? 0 }} />
          <StatisticCard statistic={{ title: 'Failed', value: summary?.failed ?? 0 }} />
          <StatisticCard statistic={{ title: 'Broken', value: summary?.broken ?? 0 }} />
          <StatisticCard statistic={{ title: 'Skipped', value: summary?.skipped ?? 0 }} />
        </StatisticCard.Group>

        <Descriptions
          size="small"
          column={2}
          bordered
          style={{ marginTop: 12 }}
          items={[
            {
              key: 'pid',
              label: 'allure_project_id',
              children: <Typography.Text code>{allure?.allure_project_id ?? '—'}</Typography.Text>,
            },
            {
              key: 'status',
              label: 'Generate',
              children: <Tag color={allure?.status === 'ok' ? 'success' : 'default'}>{allure?.status ?? '—'}</Tag>,
            },
            {
              key: 'gen',
              label: 'generated_at',
              children: allure?.generated_at ?? '—',
            },
            {
              key: 'dur',
              label: 'duration',
              children:
                summary?.duration_ms != null
                  ? `${Math.round(summary.duration_ms / 1000)} с`
                  : '—',
            },
            {
              key: 'meta',
              label: '≠ meta.project_id',
              children: (
                <Typography.Text type="secondary">
                  банк: <Typography.Text code>{pack.meta_project_id}</Typography.Text>
                </Typography.Text>
              ),
            },
            {
              key: 'url',
              label: 'report_url',
              children: allure?.report_url ? (
                <Typography.Link href={allure.report_url} target="_blank" rel="noreferrer">
                  {allure.report_url}
                </Typography.Link>
              ) : (
                '—'
              ),
            },
          ]}
        />

        <div style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">Pass-rate по прогонам (Allure summary)</Typography.Text>
          <PassRateLine points={pack.pass_rate_trend} />
        </div>
      </ProCard>

      <ProCard
        title="DefectDojo"
        subTitle={dojo?.product_name ?? pack.meta_project_id}
        bordered
        extra={
          dojo?.engagement_url ? (
            <Button type="primary" size="small" href={dojo.engagement_url} target="_blank">
              Engagement
            </Button>
          ) : null
        }
        data-testid="admin-dojo-block"
      >
        <StatisticCard.Group direction="row">
          <StatisticCard
            statistic={{ title: 'Critical', value: dojo?.stats?.critical ?? 0 }}
          />
          <StatisticCard statistic={{ title: 'High', value: dojo?.stats?.high ?? 0 }} />
          <StatisticCard
            statistic={{ title: 'Active', value: dojo?.active_findings ?? 0 }}
          />
          <StatisticCard
            statistic={{ title: 'Mitigated', value: dojo?.mitigated_findings ?? 0 }}
          />
        </StatisticCard.Group>

        <Descriptions
          size="small"
          column={2}
          bordered
          style={{ marginTop: 12 }}
          items={[
            { key: 'prod', label: 'product_id', children: dojo?.product_id ?? '—' },
            { key: 'eng', label: 'engagement_id', children: dojo?.engagement_id ?? '—' },
            { key: 'test', label: 'test_id', children: dojo?.test_id ?? '—' },
            {
              key: 'ename',
              label: 'engagement',
              children: dojo?.engagement_name ?? '—',
            },
            {
              key: 'eurl',
              label: 'engagement_url',
              children: dojo?.engagement_url ? (
                <Typography.Link href={dojo.engagement_url} target="_blank" rel="noreferrer">
                  {dojo.engagement_url}
                </Typography.Link>
              ) : (
                '—'
              ),
            },
            {
              key: 'turl',
              label: 'test_url',
              children: dojo?.test_url ? (
                <Typography.Link href={dojo.test_url} target="_blank" rel="noreferrer">
                  {dojo.test_url}
                </Typography.Link>
              ) : (
                '—'
              ),
            },
          ]}
        />

        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Typography.Text type="secondary">Severity (последний import)</Typography.Text>
            <SeverityBars stats={dojo?.stats} />
          </div>
          <div>
            <Typography.Text type="secondary">Тренд severity по прогонам</Typography.Text>
            <SeverityTrendChart points={pack.severity_trend} />
          </div>
        </div>
      </ProCard>

      <ProCard title="История проверок / импортов" bordered data-testid="admin-evidence-history">
        <Table
          size="small"
          pagination={false}
          rowKey={(r) => `${r.check_id}-${r.at}`}
          dataSource={[...pack.history].reverse()}
          columns={[
            {
              title: 'Когда',
              dataIndex: 'at',
              width: 180,
              render: (v: string) => v.slice(0, 19).replace('T', ' '),
            },
            { title: 'check_id', dataIndex: 'check_id', ellipsis: true },
            {
              title: 'Gate',
              dataIndex: 'gate',
              width: 90,
              render: (g?: string) => <Tag>{g ?? '—'}</Tag>,
            },
            {
              title: 'Allure',
              key: 'allure',
              width: 100,
              render: (_, row) =>
                row.allure_report_url ? (
                  <Typography.Link href={row.allure_report_url} target="_blank" rel="noreferrer">
                    {row.allure_project_id ?? 'report'}
                  </Typography.Link>
                ) : (
                  '—'
                ),
            },
            {
              title: 'Dojo',
              key: 'dojo',
              width: 90,
              render: (_, row) =>
                row.dojo_engagement_url ? (
                  <Typography.Link
                    href={row.dojo_engagement_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    eng
                  </Typography.Link>
                ) : (
                  '—'
                ),
            },
            {
              title: 'C/H/M',
              key: 'sev',
              width: 100,
              render: (_, row) => {
                const s = row.dojo_stats;
                if (!s) return '—';
                return `${s.critical ?? 0}/${s.high ?? 0}/${s.medium ?? 0}`;
              },
            },
            {
              title: 'Pass%',
              key: 'pass',
              width: 80,
              render: (_, row) => {
                const s = row.allure_summary;
                if (!s?.total) return '—';
                return `${Math.round((s.passed / s.total) * 100)}%`;
              },
            },
            { title: 'Заметка', dataIndex: 'note', ellipsis: true },
          ]}
        />
      </ProCard>
    </Space>
  );
}
