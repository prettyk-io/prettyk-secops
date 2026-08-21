/**
 * RES-4/5: severity bars + executive + top clusters + trend (Live hooks / summary API).
 */

import { useEffect, useState } from 'react';
import { Card, Typography } from 'antd';
import { LIVE_SUMMARY_URL, LIVE_TREND_URL } from '../api/apiBase';
import { PassRateLine, SeverityBars, SeverityTrendChart } from '../admin/sections/EvidenceCharts';
import type { DojoSeverityStats } from '../admin/evidenceTypes';
import { buildExecutiveConclusion } from './executiveConclusion';
import type { LiveMetaSnapshot, ResultsHooksSnapshot } from './types';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function statsFromRaw(statsRaw: Record<string, unknown> | undefined): DojoSeverityStats | undefined {
  if (!statsRaw) {
    return undefined;
  }
  return {
    critical: num(statsRaw.critical),
    high: num(statsRaw.high),
    medium: num(statsRaw.medium),
    low: num(statsRaw.low),
    info: num(statsRaw.info) || num(statsRaw.informational),
  };
}

type TrendPoint = {
  label: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  allure_pass_rate?: number;
};

type PanelHookSlice = {
  statsRaw: Record<string, unknown> | undefined;
  collapse: Record<string, unknown> | undefined;
  hookExec: Record<string, unknown> | undefined;
  risksSource: string;
  zap: Record<string, unknown> | undefined;
};

function sliceHooks(hooks: ResultsHooksSnapshot | null): PanelHookSlice {
  const dojo = hooks?.dojo ? asRecord(hooks.dojo) : undefined;
  const zap = hooks?.zap ? asRecord(hooks.zap) : undefined;
  let risksSource = '';
  if (dojo?.stats) {
    risksSource = 'dojo';
  } else if (zap?.counts) {
    risksSource = 'zap';
  }
  return {
    statsRaw: asRecord(dojo?.stats) || asRecord(zap?.counts),
    collapse: asRecord(dojo?.collapse) || asRecord(zap?.collapse),
    hookExec: asRecord(dojo?.executive) || asRecord(zap?.executive),
    risksSource,
    zap,
  };
}

function mapTrendPoint(p: unknown): TrendPoint | null {
  const row = asRecord(p);
  if (!row) {
    return null;
  }
  const rateRaw = row.allure_pass_rate;
  const rate =
    typeof rateRaw === 'number' && Number.isFinite(rateRaw) ? rateRaw : undefined;
  return {
    label: typeof row.label === 'string' ? row.label : '—',
    critical: num(row.critical),
    high: num(row.high),
    medium: num(row.medium),
    low: num(row.low),
    ...(rate !== undefined ? { allure_pass_rate: rate } : {}),
  };
}

function formatAllureLine(allure: Record<string, unknown>): string {
  const broken = num(allure.broken);
  const brokenPart = broken ? ` / ${broken} broken` : '';
  return (
    `Allure: ${num(allure.passed)} ok / ${num(allure.failed)} fail` +
    brokenPart +
    ` (всего ${num(allure.total)})`
  );
}

function resolvePanelExecutive(
  meta: LiveMetaSnapshot | null,
  statsRaw: Record<string, unknown> | undefined,
  collapse: Record<string, unknown> | undefined,
  hookExec: Record<string, unknown> | undefined,
): { executive_class: string; recommendations: string[] } {
  if (typeof hookExec?.executive_class === 'string') {
    return {
      executive_class: String(hookExec.executive_class),
      recommendations: Array.isArray(hookExec.recommendations)
        ? hookExec.recommendations.filter((x): x is string => typeof x === 'string')
        : [],
    };
  }
  const ciRecs = Array.isArray(meta?.ci_recommendations)
    ? meta!.ci_recommendations!.filter((x): x is string => typeof x === 'string')
    : undefined;
  return buildExecutiveConclusion({
    counts: statsRaw,
    collapse,
    ci_verdict: typeof meta?.ci_verdict === 'string' ? meta.ci_verdict : '',
    ci_gate: typeof meta?.ci_gate === 'string' ? meta.ci_gate : '',
    ci_exit_code: typeof meta?.ci_exit_code === 'number' ? meta.ci_exit_code : null,
    ci_recommendations: ciRecs,
  });
}

function topFindingsFromSlice(
  collapse: Record<string, unknown> | undefined,
  zap: Record<string, unknown> | undefined,
): unknown[] {
  if (Array.isArray(collapse?.top_findings)) {
    return collapse.top_findings;
  }
  if (Array.isArray(zap?.top_findings)) {
    return zap.top_findings;
  }
  return [];
}

export function ResultsSummaryPanel(props: {
  meta: LiveMetaSnapshot | null;
  hooks: ResultsHooksSnapshot | null;
}): React.JSX.Element | null {
  const { statsRaw, collapse, hookExec, risksSource, zap } = sliceHooks(props.hooks);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [allureLine, setAllureLine] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [trendRes, sumRes] = await Promise.all([
          fetch(`${LIVE_TREND_URL}?t=${Date.now()}`, { cache: 'no-store' }),
          fetch(`${LIVE_SUMMARY_URL}?t=${Date.now()}`, { cache: 'no-store' }),
        ]);
        if (cancelled) {
          return;
        }
        if (trendRes.ok) {
          const data = (await trendRes.json()) as { points?: unknown[] };
          const points = Array.isArray(data.points) ? data.points : [];
          setTrend(points.map(mapTrendPoint).filter((x): x is TrendPoint => Boolean(x)));
        }
        if (sumRes.ok) {
          const sum = asRecord(await sumRes.json());
          const allure = asRecord(sum?.allure);
          if (allure && num(allure.total) > 0) {
            setAllureLine(formatAllureLine(allure));
          }
        }
      } catch {
        /* Live offline — panel still shows hooks */
      }
    };
    load().catch(() => undefined);
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const hasStats = Boolean(statsRaw && Object.keys(statsRaw).length);
  if (!hasStats && !collapse && !hookExec && trend.length === 0) {
    return null;
  }

  const stats = statsFromRaw(statsRaw);
  const executive = resolvePanelExecutive(props.meta, statsRaw, collapse, hookExec);
  const top = topFindingsFromSlice(collapse, zap);

  return (
    <Card
      size="small"
      title="Сводка рисков"
      className="pk-results-summary"
      data-testid="results-summary-panel"
    >
      <div className="pk-results-summary-grid">
        <div>
          <Typography.Text type="secondary" className="pk-results-summary-label">
            Заключение
          </Typography.Text>
          <div
            className={`pk-results-executive pk-results-executive--${String(
              executive.executive_class,
            ).toLowerCase()}`}
            data-testid="results-executive-class"
          >
            {executive.executive_class}
          </div>
          {executive.recommendations[0] ? (
            <Typography.Paragraph className="pk-results-summary-rec">
              {executive.recommendations[0]}
            </Typography.Paragraph>
          ) : null}
          {allureLine ? (
            <Typography.Text type="secondary" className="pk-results-allure-line">
              {allureLine}
            </Typography.Text>
          ) : null}
        </div>
        {stats ? (
          <div>
            <Typography.Text type="secondary" className="pk-results-summary-label">
              {risksSource === 'zap' ? 'ZAP (alertitem)' : 'ACTIVE (Dojo)'}
            </Typography.Text>
            <SeverityBars stats={stats} />
          </div>
        ) : null}
      </div>
      {top.length > 0 ? (
        <ul className="pk-results-cluster-list" data-testid="results-cluster-list">
          {top.slice(0, 6).map((item, i) => {
            const row = asRecord(item);
            if (!row) {
              return null;
            }
            const name = typeof row.name === 'string' ? row.name : '—';
            const risk = typeof row.risk === 'string' ? row.risk : 'info';
            const count = num(row.count) || 1;
            return (
              <li key={`${name}-${i}`}>
                <span className="pk-results-cluster-risk">{risk}</span>
                {name}
                <span className="pk-results-cluster-count">×{count}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {trend.length > 0 ? (
        <div
          className="pk-results-trend-block pk-results-trend-dual"
          data-testid="results-severity-trend"
        >
          <div>
            <Typography.Text type="secondary" className="pk-results-summary-label">
              Тренд severity
            </Typography.Text>
            <SeverityTrendChart points={trend} />
          </div>
          {trend.some((p) => typeof p.allure_pass_rate === 'number') ? (
            <div data-testid="results-allure-pass-rate">
              <Typography.Text type="secondary" className="pk-results-summary-label">
                Allure pass-rate
              </Typography.Text>
              <PassRateLine
                points={trend
                  .filter((p) => typeof p.allure_pass_rate === 'number')
                  .map((p) => ({
                    label: p.label,
                    rate: p.allure_pass_rate as number,
                  }))}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
