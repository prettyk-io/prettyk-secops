import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Empty, Result, Table, Tabs, Tag, Typography } from 'antd';
import { ProCard, StatisticCard } from '@ant-design/pro-components';
import { listChecks } from '../../checks/checksStore';
import { readLastDojoProgramStatus } from '../applyDojoProgram';
import { listDeploys, syncDeployGatesFromChecks } from '../deployStore';
import { resolveDeployEvidencePack } from '../evidenceRegistry';
import { loadLiveProgramKpi } from '../loadLiveProgramKpi';
import { pickPrimaryEvidencePack } from '../pickPrimaryEvidencePack';
import { syncAdminDojoFromLive } from '../syncAdminDojo';
import { IntegrationEvidence } from './IntegrationEvidence';
import { PassRateLine, SeverityDonut, SeverityTrendChart } from './EvidenceCharts';
import { DojoFindingsTable } from './DojoFindingsTable';

export type EvidencePanelProps = {
  onOpenDeploy?: (deployId: string) => void;
};

/** Program-level evidence hub + deep dive (Live refs first, showcase fallback). ADM-VIS-4 tabs. */
export function EvidencePanel({
  onOpenDeploy,
}: EvidencePanelProps): React.JSX.Element {
  const { message } = App.useApp();
  const [tick, setTick] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    syncDeployGatesFromChecks();
    void syncAdminDojoFromLive().finally(() => setTick((n) => n + 1));
  }, []);

  const checks = useMemo(() => listChecks(), [tick]);
  const deploys = useMemo(() => listDeploys(), [tick]);
  const kpi = useMemo(() => loadLiveProgramKpi(), [tick]);
  const dojoStatus = useMemo(() => readLastDojoProgramStatus(), [tick]);
  const showcase = useMemo(
    () => resolveDeployEvidencePack('dep_ib_web_2401', 'Интернет-банк Web', 'ib-web'),
    [tick],
  );
  const primary = useMemo(
    () => pickPrimaryEvidencePack(deploys, checks, showcase),
    [tick, deploys, checks, showcase],
  );

  const onSyncLive = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncAdminDojoFromLive();
      syncDeployGatesFromChecks();
      if (!result.evidenceOk && result.dojoStatus === 'down') {
        message.warning(result.evidenceError || result.dojoError || 'Live / Dojo недоступны');
      } else {
        message.success(
          `Evidence +${result.evidenceUpserted} · Dojo ${result.dojoStatus} (+${result.dojoApplied})`,
        );
      }
      setTick((n) => n + 1);
    } finally {
      setSyncing(false);
    }
  }, [message]);

  const rows = deploys.map((d) => {
    const pack = resolveDeployEvidencePack(d.deploy_id, d.application_name, d.project_id);
    return {
      key: d.deploy_id,
      app: d.application_name,
      gate: d.last_gate ?? 'unknown',
      allure_project_id: pack.allure?.allure_project_id ?? '—',
      critical: pack.dojo?.stats?.critical ?? 0,
      high: pack.dojo?.stats?.high ?? 0,
      history_n: pack.history.length,
      allure_url: pack.allure?.report_url,
      dojo_url: pack.dojo?.engagement_url,
    };
  });

  const hasCharts =
    primary.pack.severity_trend.length > 0 || primary.pack.pass_rate_trend.length > 0;

  const portfolioTab = (
    <ProCard title="Портфель: Allure / Dojo extract" bordered data-testid="evidence-tab-portfolio">
      {rows.length === 0 ? (
        <Empty description="Нет деплоев в реестре — добавь приложение или сид" />
      ) : (
        <Table
          size="small"
          pagination={false}
          dataSource={rows}
          onRow={(row) => ({
            onClick: () => onOpenDeploy?.(row.key),
            style: onOpenDeploy ? { cursor: 'pointer' } : undefined,
          })}
          columns={[
            {
              title: 'Приложение',
              dataIndex: 'app',
              render: (app: string, row) =>
                onOpenDeploy ? (
                  <Typography.Link
                    data-testid={`evidence-open-deploy-${row.key}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDeploy(row.key);
                    }}
                  >
                    {app}
                  </Typography.Link>
                ) : (
                  app
                ),
            },
            {
              title: 'Gate',
              dataIndex: 'gate',
              render: (g: string) => <Tag>{g}</Tag>,
            },
            {
              title: 'allure_project_id',
              dataIndex: 'allure_project_id',
              render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
            },
            {
              title: 'C / H',
              key: 'sev',
              render: (_, r) => `${r.critical} / ${r.high}`,
            },
            { title: 'История', dataIndex: 'history_n', width: 90 },
            {
              title: 'Allure',
              dataIndex: 'allure_url',
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
              dataIndex: 'dojo_url',
              render: (url?: string) =>
                url ? (
                  <Typography.Link href={url} target="_blank" rel="noreferrer">
                    eng
                  </Typography.Link>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      )}
    </ProCard>
  );

  const trendsTab = (
    <ProCard title="Тренды" bordered data-testid="evidence-tab-trends">
      {hasCharts ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
          }}
          data-testid="evidence-primary-charts"
          data-from-live={primary.fromLive ? '1' : '0'}
        >
          <div>
            <Typography.Text type="secondary">
              {primary.caption}
              {primary.fromLive ? ' · Live' : ' · Showcase'}: динамика severity
            </Typography.Text>
            <SeverityTrendChart points={primary.pack.severity_trend} />
          </div>
          <div>
            <Typography.Text type="secondary">
              {primary.caption}
              {primary.fromLive ? ' · Live' : ' · Showcase'}: Allure pass-rate
            </Typography.Text>
            <PassRateLine points={primary.pack.pass_rate_trend} />
          </div>
          {primary.pack.dojo?.stats ? (
            <div>
              <Typography.Text type="secondary">
                {primary.caption}
                {primary.fromLive ? ' · Live' : ' · Showcase'}: уязвимости по критичности
              </Typography.Text>
              <SeverityDonut stats={primary.pack.dojo.stats} />
            </div>
          ) : null}
        </div>
      ) : (
        <Result
          status="info"
          title="Нет точек тренда"
          subTitle="Подтяни данные с Live или запусти проверку — демонстрационные данные подставятся, если есть база."
          extra={
            <Button type="primary" loading={syncing} onClick={() => void onSyncLive()}>
              Подтянуть с Live
            </Button>
          }
        />
      )}
    </ProCard>
  );

  const linksTab = (
    <div data-testid="evidence-tab-links">
      <IntegrationEvidence pack={primary.pack} />
    </div>
  );

  const findingsTab = (
    <DojoFindingsTable deploys={deploys} onOpenDeploy={onOpenDeploy} />
  );

  return (
    <div data-testid="admin-evidence" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
        <Tag
          color={primary.fromLive ? 'success' : 'default'}
          data-testid="evidence-source-tag"
        >
          {primary.fromLive ? 'Чарты: Live' : 'Чарты: Showcase (demo)'}
        </Tag>
        {dojoStatus ? (
          <Tag
            data-testid="evidence-dojo-status-tag"
            color={
              dojoStatus.status === 'ok'
                ? 'success'
                : dojoStatus.status === 'unconfigured'
                  ? 'default'
                  : 'warning'
            }
          >
            Dojo: {dojoStatus.status}
          </Tag>
        ) : null}
        <Button size="small" loading={syncing} onClick={() => void onSyncLive()}>
          Подтянуть с Live
        </Button>
      </div>
      {dojoStatus &&
      (dojoStatus.status === 'down' || dojoStatus.status === 'unconfigured') ? (
        <Alert
          type={dojoStatus.status === 'down' ? 'error' : 'info'}
          showIcon
          data-testid="evidence-dojo-honesty"
          message={
            dojoStatus.status === 'unconfigured'
              ? 'DefectDojo не сконфигурирован — чарты не маскируем нулями'
              : 'DefectDojo недоступен (down) — см. Integrations / стенд :8081'
          }
        />
      ) : null}
      <StatisticCard.Group direction="row">
        <StatisticCard statistic={{ title: 'Проверки (local)', value: checks.length }} />
        <StatisticCard
          statistic={{
            title: 'Проход по гейтам',
            value: Math.round(kpi.gate_pass_rate * 100),
            suffix: '%',
          }}
        />
        <StatisticCard statistic={{ title: 'Проверки · 7д', value: kpi.checks_last_7d }} />
        <StatisticCard
          statistic={{
            title: 'Открытые критические',
            value: kpi.open_critical,
          }}
        />
      </StatisticCard.Group>

      <Tabs
        data-testid="evidence-tabs"
        items={[
          { key: 'portfolio', label: 'Портфель', children: portfolioTab },
          { key: 'trends', label: 'Тренды', children: trendsTab },
          { key: 'findings', label: 'Находки', children: findingsTab },
          { key: 'links', label: 'Ссылки', children: linksTab },
        ]}
      />
    </div>
  );
}
