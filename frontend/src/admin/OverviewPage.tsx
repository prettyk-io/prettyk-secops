/**
 * VN-ADM-2: OverviewPage — KPI карточки: кол-во прогонов, уязвимости по severity,
 * статус стенда. Данные через хуки Live API (useLiveStatus/useDojoStats/useRunsIndex).
 * Honesty: API down → «Нет данных» (не зеленые нули).
 */
import { Col, Row, Statistic, Tag, Typography } from 'antd';
import { useDojoStats, useLiveStatus, useRunsIndex, useSeverityTrend } from './hooks';
import {
  SeverityDonut,
  SeverityBars,
  SeverityTrendChart,
  PassRateLine,
} from './evidence/EvidenceCharts';
import type { ServiceHealth } from './adminApi';
import {
  gateLabel,
  gateTagColor,
  portfolioHeroHint,
  portfolioHeroTone,
  toneFromVerdict,
} from './adminGateUi';

export type OverviewPageProps = {
  projectId?: string;
  health?: ServiceHealth[];
};

const NO_DATA = 'Нет данных';

function statusTag(live: { ok: boolean; status: string }): React.JSX.Element {
  if (!live.ok) {
    return <Tag color="default">{NO_DATA}</Tag>;
  }
  const s = (live.status || '').toLowerCase();
  const color =
    s === 'running' || s === 'active' || s === 'live'
      ? 'processing'
      : s === 'success' || s === 'ok' || s === 'finished' || s === 'done'
        ? 'success'
        : s === 'failed' || s === 'error'
          ? 'error'
          : 'default';
  return <Tag color={color}>{live.status || 'idle'}</Tag>;
}

export function OverviewPage({ projectId, health: _health }: OverviewPageProps): React.JSX.Element {
  const live = useLiveStatus();
  const dojo = useDojoStats(projectId ?? '');
  const runs = useRunsIndex(200);
  const trend = useSeverityTrend();
  const runsCount = runs.length;

  const sevTotal = dojo.stats
    ? Object.values(dojo.stats).reduce((a, b) => a + (Number(b) || 0), 0)
    : null;

  // ADM-VIS D2: hero «Общий статус» — FAIL > WATCH > PASS по вердиктам реестра.
  const gateFail = runs.filter((r) => toneFromVerdict(r.ci_verdict) === 'fail').length;
  const gateWatch = runs.filter((r) => toneFromVerdict(r.ci_verdict) === 'watch').length;
  const gatePass = runs.filter((r) => toneFromVerdict(r.ci_verdict) === 'pass').length;
  const heroTone = portfolioHeroTone({ gate_fail: gateFail, gate_watch: gateWatch, gate_pass: gatePass });
  const hasGateData = gateFail + gateWatch + gatePass > 0;

  return (
    <div data-testid="admin-overview" className="pk-admin-page">
      <div
        className="pk-admin-card"
        data-testid="ov-hero"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Typography.Text className="pk-admin-card-title" style={{ marginBottom: 0 }}>
            Общий статус
          </Typography.Text>
          <Tag color={gateTagColor(heroTone)} data-testid="ov-hero-tag">
            {hasGateData ? gateLabel(heroTone) : 'Нет данных'}
          </Tag>
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }} data-testid="ov-hero-hint">
          {hasGateData ? portfolioHeroHint(heroTone) : 'Нет данных по гейтам портфеля'}
        </Typography.Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} data-testid="ov-hero-legend">
          <Tag color={gateTagColor('pass')}>PASS</Tag>
          <Tag color={gateTagColor('watch')}>WATCH</Tag>
          <Tag color={gateTagColor('fail')}>FAIL</Tag>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <div className="pk-admin-kpi-card" data-testid="ov-runs">
            <Typography.Text type="secondary" className="pk-admin-kpi-title">
              Прогоны
            </Typography.Text>
            <Statistic
              value={runsCount}
              valueStyle={runsCount === 0 && runs !== null ? { opacity: 0.55 } : undefined}
            />
            <Typography.Text type="secondary" className="pk-admin-kpi-sub">
              {runs.length === 0 ? NO_DATA : 'в реестре Live'}
            </Typography.Text>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="pk-admin-kpi-card" data-testid="ov-severity-total">
            <Typography.Text type="secondary" className="pk-admin-kpi-title">
              Уязвимости (ACTIVE)
            </Typography.Text>
            <Statistic
              value={sevTotal ?? 0}
              valueStyle={dojo.status === 'down' || !dojo.stats ? { opacity: 0.55 } : undefined}
            />
            <Typography.Text type="secondary" className="pk-admin-kpi-sub">
              {dojo.stats ? 'по severity Dojo' : NO_DATA}
            </Typography.Text>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="pk-admin-kpi-card" data-testid="ov-critical">
            <Typography.Text type="secondary" className="pk-admin-kpi-title">
              Критических
            </Typography.Text>
            <Statistic
              value={dojo.stats?.critical ?? 0}
              valueStyle={
                dojo.stats && (dojo.stats.critical ?? 0) > 0
                  ? { color: '#f85149' }
                  : dojo.status === 'down' || !dojo.stats
                    ? { opacity: 0.55 }
                    : undefined
              }
            />
            <Typography.Text type="secondary" className="pk-admin-kpi-sub">
              {dojo.stats ? 'Critical · Dojo' : NO_DATA}
            </Typography.Text>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="pk-admin-kpi-card" data-testid="ov-stand">
            <Typography.Text type="secondary" className="pk-admin-kpi-title">
              Статус стенда
            </Typography.Text>
            <div style={{ marginTop: 4 }}>{statusTag(live)}</div>
            <Typography.Text type="secondary" className="pk-admin-kpi-sub">
              {live.ok ? (live.session_name || 'PrettyK Live') : NO_DATA}
            </Typography.Text>
          </div>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <div
            className="pk-admin-card"
            data-testid="ov-severity-chart"
          >
            <Typography.Text className="pk-admin-card-title">
              Разбивка по severity
            </Typography.Text>
            {dojo.stats ? (
              <SeverityDonut stats={dojo.stats} />
            ) : (
              <Typography.Text type="secondary" data-testid="ov-severity-empty">
                {NO_DATA}
              </Typography.Text>
            )}
          </div>
        </Col>
        <Col xs={24} lg={12}>
          <div className="pk-admin-card" data-testid="ov-severity-bars-card">
            <Typography.Text className="pk-admin-card-title">
              ACTIVE по критичности
            </Typography.Text>
            {dojo.stats ? (
              <SeverityBars stats={dojo.stats} />
            ) : (
              <Typography.Text type="secondary" data-testid="ov-severity-bars-empty">
                {NO_DATA}
              </Typography.Text>
            )}
          </div>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <div className="pk-admin-card" data-testid="ov-trend">
            <Typography.Text className="pk-admin-card-title">
              Динамика severity
            </Typography.Text>
            {trend.length > 0 ? (
              <SeverityTrendChart points={trend} />
            ) : (
              <Typography.Text type="secondary" data-testid="ov-trend-empty">
                {NO_DATA}
              </Typography.Text>
            )}
          </div>
        </Col>
        <Col xs={24} lg={12}>
          <div className="pk-admin-card" data-testid="ov-passrate">
            <Typography.Text className="pk-admin-card-title">
              Allure pass-rate
            </Typography.Text>
            {trend.length > 0 ? (
              <PassRateLine
                points={trend
                  .filter((p) => p.allure_pass_rate !== undefined)
                  .map((p) => ({ label: p.label, rate: p.allure_pass_rate as number }))}
              />
            ) : (
              <Typography.Text type="secondary" data-testid="ov-passrate-empty">
                {NO_DATA}
              </Typography.Text>
            )}
          </div>
        </Col>
      </Row>
    </div>
  );
}
