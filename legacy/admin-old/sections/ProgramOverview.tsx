import { useEffect, useMemo, useState } from 'react';
import { Alert, Progress, Select, Tag, Typography } from 'antd';
import { ProCard, ProTable, StatisticCard } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { listChecks } from '../../checks/checksStore';
import type { CheckView } from '../../checks/types';
import { readLastDojoProgramStatus } from '../applyDojoProgram';
import {
  collectAdminRuns,
  type AdminRunRow,
} from '../collectAdminRuns';
import { APP_CODE_LABEL, formatAppCodeOption } from '../appCode';
import {
  listAllDeployLinks,
  listDeploys,
  loadAdminPolicies,
  syncDeployGatesFromChecks,
} from '../deployStore';
import { listAllEvidence, resolveDeployEvidencePack } from '../evidenceRegistry';
import { loadLiveProgramKpi } from '../loadLiveProgramKpi';
import { readLastGatePolicyPush } from '../gatePolicyFingerprint';
import { syncAdminDojoFromLive } from '../syncAdminDojo';
import { summarizeWaiversExpiry } from '../waiverExpiry';
import {
  gateLabel,
  gateTagColor,
  portfolioHeroHint,
  portfolioHeroTone,
  toneFromVerdict,
} from '../adminGateUi';
import { SeverityDonut, SeverityTrendChart } from './EvidenceCharts';

export type ProgramOverviewProps = {
  onOpenRuns7d?: () => void;
  onOpenCheck?: (checkId: string, view?: CheckView) => void;
};

const MINI_RUNS = 8;
const MS_DAY = 24 * 60 * 60 * 1000;

type WindowDays = 7 | 30;

function formatRunTime(iso?: string): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(t);
  } catch {
    return iso;
  }
}

function formatUpdatedAgo(atMs: number, nowMs: number): string {
  const sec = Math.max(0, Math.floor((nowMs - atMs) / 1000));
  if (sec < 60) return 'только что';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин. назад`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr} ч. назад`;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(atMs);
}

/** Program KPIs over deploy portfolio + checks.runs + evidence (ADM-1…3). Analysis layout. */
export function ProgramOverview({
  onOpenRuns7d,
  onOpenCheck,
}: ProgramOverviewProps): React.JSX.Element {
  const [tick, setTick] = useState(0);
  const [projectId, setProjectId] = useState('');
  const [windowDays, setWindowDays] = useState<WindowDays>(7);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    syncDeployGatesFromChecks();
    void syncAdminDojoFromLive().finally(() => {
      setRefreshedAt(Date.now());
      setTick((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const kpi = useMemo(() => loadLiveProgramKpi(windowDays), [tick, windowDays]);
  const deploys = useMemo(() => listDeploys(), [tick]);
  const recentRuns = useMemo(() => {
    const floor = Date.now() - windowDays * MS_DAY;
    const rows = collectAdminRuns({
      checks: listChecks(),
      evidence: listAllEvidence(),
      links: listAllDeployLinks(),
    });
    return [...rows]
      .filter((row) => {
        const raw = row.ended_at || row.started_at;
        if (!raw) return true;
        const t = Date.parse(raw);
        return Number.isFinite(t) ? t >= floor : true;
      })
      .sort((a, b) => String(b.started_at ?? '').localeCompare(String(a.started_at ?? '')))
      .slice(0, MINI_RUNS);
  }, [tick, windowDays]);
  const miniColumns: ProColumns<AdminRunRow>[] = useMemo(
    () => [
      {
        title: 'Время',
        dataIndex: 'started_at',
        width: 148,
        render: (_, row) => formatRunTime(row.started_at || row.ended_at),
      },
      {
        title: 'Проверка',
        dataIndex: 'check_title',
        ellipsis: true,
        render: (_, row) =>
          onOpenCheck ? (
            <Typography.Link
              data-testid={`admin-overview-run-${row.run_id}`}
              onClick={() => onOpenCheck(row.check_id, 'results')}
            >
              {row.check_title}
            </Typography.Link>
          ) : (
            row.check_title
          ),
      },
      {
        title: 'Вердикт',
        dataIndex: 'ci_verdict',
        width: 110,
        render: (_, row) => {
          const tone = toneFromVerdict(row.ci_verdict);
          return (
            <Tag color={gateTagColor(tone)}>
              {row.ci_verdict ? gateLabel(tone) : '—'}
            </Tag>
          );
        },
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        width: 108,
        render: (_, row) => {
          const tone = toneFromVerdict(row.status);
          return <Tag color={gateTagColor(tone)}>{row.status || '—'}</Tag>;
        },
      },
      {
        title: 'Владелец',
        dataIndex: 'owner_user_id',
        width: 118,
        render: (_, row) =>
          row.owner_user_id ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.owner_user_id}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary" style={{ opacity: 0.55 }}>
              —
            </Typography.Text>
          ),
      },
    ],
    [onOpenCheck],
  );
  const policyFp = useMemo(() => readLastGatePolicyPush(), [tick]);
  const dojoStatus = useMemo(() => readLastDojoProgramStatus(), [tick]);
  const waiverWarn = useMemo(() => {
    const policies = loadAdminPolicies();
    return summarizeWaiversExpiry(policies.waivers);
  }, [tick]);
  const active = deploys.filter((d) => d.status === 'active').length;
  const activePct =
    deploys.length > 0 ? Math.round((active / deploys.length) * 100) : 0;
  const coverage =
    kpi.apps_total > 0 ? Math.round((kpi.apps_covered / kpi.apps_total) * 100) : 0;
  const heroTone = portfolioHeroTone(kpi);
  const heroLabel = gateLabel(heroTone);

  const projectOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    for (const d of deploys) {
      const pid = (d.project_id || '').trim();
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      opts.push(formatAppCodeOption(pid, d.application_name));
    }
    return opts;
  }, [deploys]);

  useEffect(() => {
    if (projectId || !projectOptions.length) return;
    const preferred = projectOptions.find((o) => o.value === 'ib-web');
    const target = preferred ?? projectOptions[0];
    if (target) {
      setProjectId(target.value);
    }
  }, [projectId, projectOptions]);

  const selectedDeploy = useMemo(
    () => deploys.find((d) => d.project_id === projectId),
    [deploys, projectId],
  );
  const dojoPack = useMemo(() => {
    if (!selectedDeploy) return null;
    return resolveDeployEvidencePack(
      selectedDeploy.deploy_id,
      selectedDeploy.application_name,
      selectedDeploy.project_id,
    );
  }, [selectedDeploy, tick]);
  const hasLiveDojoStats = Boolean(dojoPack?.dojo?.stats);

  const refresh = () => {
    syncDeployGatesFromChecks();
    void syncAdminDojoFromLive().finally(() => {
      setRefreshedAt(Date.now());
      setTick((n) => n + 1);
    });
  };

  return (
    <div data-testid="admin-overview" className="pk-admin-analysis">
      <div className="pk-admin-analysis-toolbar" data-testid="admin-overview-toolbar">
        <Typography.Title level={4} className="pk-admin-analysis-title">
          Обзор
        </Typography.Title>
        <div className="pk-admin-analysis-toolbar-right">
          {dojoStatus ? (
            <Tag
              data-testid="admin-overview-dojo-status"
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
          <Typography.Text
            type="secondary"
            className="pk-admin-analysis-updated"
            data-testid="admin-overview-updated"
          >
            Обновлено: {formatUpdatedAgo(refreshedAt, nowTick)}
          </Typography.Text>
          <Select
            size="small"
            className="pk-admin-analysis-period"
            data-testid="admin-overview-period"
            value={windowDays}
            options={[
              { value: 7, label: 'Последние 7 дней' },
              { value: 30, label: 'Последние 30 дней' },
            ]}
            onChange={(v) => setWindowDays(v as WindowDays)}
          />
          <Typography.Link data-testid="admin-overview-refresh" onClick={refresh}>
            Обновить
          </Typography.Link>
        </div>
      </div>

      {waiverWarn.expired.length > 0 || waiverWarn.soon.length > 0 ? (
        <Alert
          style={{ marginBottom: 12 }}
          type={waiverWarn.expired.length > 0 ? 'error' : 'warning'}
          showIcon
          data-testid="admin-overview-waiver-warn"
          message={
            waiverWarn.expired.length > 0
              ? `Waivers expired: ${waiverWarn.expired.length}`
              : `Waivers soon: ${waiverWarn.soon.length}`
          }
          description="См. Admin → Политики"
        />
      ) : null}

      {/* Analysis: hero → KPI → legend → mini Runs */}
      <StatisticCard.Group direction="row" className="pk-admin-kpi-row">
        <StatisticCard
          className="pk-admin-status-hero"
          data-testid="admin-overview-semaphore"
          title="Общий статус"
          extra={
            <Tag
              color={gateTagColor(heroTone)}
              className="pk-admin-status-hero-tag"
            >
              {heroLabel}
            </Tag>
          }
          statistic={{
            title: portfolioHeroHint(heroTone),
            value: heroLabel,
            valueStyle: { display: 'none' },
          }}
        />
        <StatisticCard
          statistic={{
            title: 'Покрытие',
            value: coverage,
            suffix: '%',
            description: (
              <Typography.Text type="secondary">
                {kpi.apps_covered} / {kpi.apps_total}
              </Typography.Text>
            ),
          }}
        />
        <StatisticCard
          statistic={{
            title: 'Открытые критические',
            value: kpi.open_critical,
            description: (
              <Typography.Text type="secondary">
                Δ {kpi.trend_critical_delta >= 0 ? '+' : ''}
                {kpi.trend_critical_delta} (история)
              </Typography.Text>
            ),
          }}
        />
        <StatisticCard
          statistic={{
            title: 'Проход по гейтам',
            value: Math.round(kpi.gate_pass_rate * 100),
            suffix: '%',
            description: (
              <Typography.Text type="secondary">
                Высокие открытые: {kpi.open_high}
              </Typography.Text>
            ),
          }}
        />
        <StatisticCard
          statistic={{
            title: `Запусков · ${windowDays}д`,
            value: kpi.checks_last_7d,
            description: (
              <Typography.Link
                data-testid="admin-overview-runs-7d"
                onClick={() => onOpenRuns7d?.()}
              >
                Все запуски · {windowDays}д
              </Typography.Link>
            ),
          }}
        />
      </StatisticCard.Group>

      <div
        className="pk-admin-gate-legend"
        data-testid="admin-overview-gate-legend"
      >
        <Tag color="success">PASS {kpi.gate_pass}</Tag>
        <Tag color="warning">WATCH {kpi.gate_watch}</Tag>
        <Tag color="error">FAIL {kpi.gate_fail}</Tag>
        <Tag>— {kpi.gate_unknown}</Tag>
      </div>

      <ProCard
        title="Последние запуски"
        bordered
        className="pk-admin-mini-runs"
        data-testid="admin-overview-mini-runs"
        extra={
          <Typography.Link
            data-testid="admin-overview-mini-runs-all"
            onClick={() => onOpenRuns7d?.()}
          >
            Смотреть все
          </Typography.Link>
        }
      >
        <ProTable<AdminRunRow>
          rowKey="key"
          size="small"
          search={false}
          options={false}
          pagination={false}
          toolBarRender={false}
          dataSource={recentRuns}
          columns={miniColumns}
          locale={{ emptyText: 'Нет запусков в реестре' }}
        />
      </ProCard>

      {/* Below fold — secondary Analysis cards */}
      <ProCard.Group
        direction="row"
        gutter={12}
        className="pk-admin-secondary-row"
        data-testid="admin-overview-secondary"
      >
        <ProCard
          title="GatePolicy (последний push)"
          bordered
          colSpan="50%"
          data-testid="admin-overview-policy-fp"
        >
          {policyFp ? (
            <Typography.Text type="secondary">
              {policyFp.at} · fingerprint{' '}
              <Typography.Text code>{policyFp.fingerprint}</Typography.Text>
              {policyFp.path ? ` · ${policyFp.path}` : ''}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary">
              Ещё не пушили из Политик в этом браузере
            </Typography.Text>
          )}
        </ProCard>
        <ProCard title="Портфель деплоев" bordered colSpan="50%">
          <Typography.Paragraph style={{ marginBottom: 8 }}>
            Активных деплоев в реестре: {active} / {deploys.length}
          </Typography.Paragraph>
          <Progress
            percent={activePct}
            size="small"
            data-testid="admin-overview-active-progress"
          />
          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: 12, marginBottom: 0 }}
          >
            KPI из registry деплоев, linked checks (runs) и EvidenceRegistry — без mock.
          </Typography.Paragraph>
        </ProCard>
      </ProCard.Group>

      <ProCard
        title="DefectDojo · ACTIVE по коду приложения"
        bordered
        className="pk-admin-dojo-card"
        data-testid="admin-overview-dojo"
        extra={
          <Select
            size="small"
            style={{ minWidth: 220 }}
            data-testid="admin-overview-dojo-project"
            aria-label={APP_CODE_LABEL}
            placeholder={APP_CODE_LABEL}
            value={projectId || undefined}
            options={projectOptions}
            onChange={(v) => setProjectId(v)}
          />
        }
      >
        {dojoStatus &&
        (dojoStatus.status === 'down' || dojoStatus.status === 'unconfigured') ? (
          <Alert
            style={{ marginBottom: 12 }}
            type={dojoStatus.status === 'down' ? 'error' : 'info'}
            showIcon
            data-testid="admin-overview-dojo-honesty"
            message={
              dojoStatus.status === 'unconfigured'
                ? 'DefectDojo не сконфигурирован — нули не показываем как «всё чисто»'
                : 'DefectDojo недоступен — проверьте Integrations / :8081'
            }
          />
        ) : null}
        {hasLiveDojoStats && dojoPack?.dojo?.stats ? (
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
            data-testid="admin-overview-dojo-charts"
          >
            <div>
              <Typography.Text type="secondary">
                {selectedDeploy?.application_name} · Live · severity
              </Typography.Text>
              <SeverityDonut stats={dojoPack.dojo.stats} />
              {dojoPack.dojo.engagement_url ? (
                <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                  <Typography.Link
                    href={dojoPack.dojo.engagement_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть engagement
                  </Typography.Link>
                </Typography.Paragraph>
              ) : null}
            </div>
            <div>
              <Typography.Text type="secondary">Динамика (из истории refs)</Typography.Text>
              {dojoPack.severity_trend.length > 0 ? (
                <SeverityTrendChart points={dojoPack.severity_trend} />
              ) : (
                <Typography.Text type="secondary" style={{ opacity: 0.65 }}>
                  Пока нет точек тренда — после нескольких sync
                </Typography.Text>
              )}
            </div>
          </div>
        ) : (
          <Typography.Text type="secondary" data-testid="admin-overview-dojo-empty">
            Нет Live stats для выбранного кода приложения — подтяните Live или заведите
            Product в Dojo с именем = код приложения.
          </Typography.Text>
        )}
      </ProCard>
    </div>
  );
}
