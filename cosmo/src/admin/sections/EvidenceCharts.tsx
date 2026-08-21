/**
 * Evidence charts — нативный AntV/G2 (@ant-design/plots), не самописный SVG/CSS.
 * Dojo: donut по severity (Pie) + stacked bar динамики (Column).
 * Allure: area pass-rate (Area). Тёмная тема — через useThemeMode().
 */
import { Area, Column, Pie } from '@ant-design/plots';
import { useThemeMode } from '../../theme/ThemeProvider';
import type { DojoSeverityStats } from '../evidenceTypes';

const SEV_ORDER = [
  { key: 'critical' as const, label: 'Critical', color: '#f85149' },
  { key: 'high' as const, label: 'High', color: '#d46b08' },
  { key: 'medium' as const, label: 'Medium', color: '#d4b106' },
  { key: 'low' as const, label: 'Low', color: '#37b6e8' },
  { key: 'info' as const, label: 'Info', color: '#8c8c8c' },
];
/* Коды severity — индустриальные; подписи оставляем латиницей как в Dojo UI. */

const SEV_COLORS = SEV_ORDER.map((s) => s.color);

/** G2 v5 theme id по режиму темы pk. */
function g2Theme(mode: 'light' | 'dark'): string {
  return mode === 'dark' ? 'classicDark' : 'classic';
}

/** Horizontal severity bars — компактный inline-вид (для карточек, не полноценный чарт). */
export function SeverityBars({
  stats,
}: {
  stats?: DojoSeverityStats | null;
}): React.JSX.Element {
  const values = SEV_ORDER.map((s) => Number(stats?.[s.key] ?? 0));
  const max = Math.max(1, ...values);

  return (
    <div className="pk-evidence-sev-bars" data-testid="evidence-severity-bars">
      {SEV_ORDER.map((s, i) => {
        const n = values[i] ?? 0;
        const pct = Math.round((n / max) * 100);
        return (
          <div key={s.key} className="pk-evidence-sev-row">
            <span className="pk-evidence-sev-label">{s.label}</span>
            <div className="pk-evidence-sev-track">
              <div
                className="pk-evidence-sev-fill"
                style={{ width: `${pct}%`, background: s.color }}
              />
            </div>
            <span className="pk-evidence-sev-n">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

type DonutDatum = { type: string; value: number };

/** Donut-разбивка уязвимостей по критичности (DefectDojo extract). */
export function SeverityDonut({
  stats,
}: {
  stats?: DojoSeverityStats | null;
}): React.JSX.Element {
  const { mode } = useThemeMode();
  const data: DonutDatum[] = SEV_ORDER.map((s) => ({
    type: s.label,
    value: Number(stats?.[s.key] ?? 0),
  }));
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0) {
    return <div className="pk-evidence-empty">Нет данных severity</div>;
  }

  return (
    <div data-testid="evidence-severity-donut">
      <Pie
        data={data}
        angleField="value"
        colorField="type"
        innerRadius={0.62}
        height={220}
        autoFit
        theme={g2Theme(mode)}
        scale={{ color: { domain: SEV_ORDER.map((s) => s.label), range: SEV_COLORS } }}
        label={false}
        legend={{ color: { position: 'right', layout: { justifyContent: 'center' } } }}
        tooltip={(d: DonutDatum) => ({ name: d.type, value: d.value })}
      />
    </div>
  );
}

type TrendPoint = {
  label: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
};

type StackDatum = { label: string; severity: string; count: number };

/** Stacked bar динамики severity (Critical/High/Medium/Low) — G2 Column. */
export function SeverityTrendChart({
  points,
}: {
  points: TrendPoint[];
}): React.JSX.Element {
  const { mode } = useThemeMode();
  if (points.length === 0) {
    return <div className="pk-evidence-empty">Нет точек тренда</div>;
  }
  const data: StackDatum[] = [];
  for (const p of points) {
    for (const s of SEV_ORDER) {
      if (s.key === 'info') {
        continue;
      }
      data.push({ label: p.label, severity: s.label, count: Number(p[s.key]) });
    }
  }

  return (
    <div data-testid="evidence-severity-trend">
      <Column
        data={data}
        xField="label"
        yField="count"
        colorField="severity"
        stack
        height={220}
        autoFit
        theme={g2Theme(mode)}
        scale={{ color: { domain: SEV_ORDER.map((s) => s.label), range: SEV_COLORS } }}
        axis={{
          y: { labelFormatter: (v: number) => (Number.isInteger(v) ? String(v) : '') },
        }}
        tooltip={(d: StackDatum) => ({ name: d.severity, value: d.count })}
      />
    </div>
  );
}

type RatePoint = { label: string; rate: number };

/** Area pass-rate (0..1) — Allure summary extract. */
export function PassRateLine({ points }: { points: RatePoint[] }): React.JSX.Element {
  const { mode } = useThemeMode();
  if (points.length === 0) {
    return <div className="pk-evidence-empty">Нет точек pass-rate</div>;
  }
  const data = points.map((p) => ({
    label: p.label,
    rate: Number((p.rate * 100).toFixed(1)),
  }));

  return (
    <div data-testid="evidence-pass-rate">
      <Area
        data={data}
        xField="label"
        yField="rate"
        height={180}
        autoFit
        theme={g2Theme(mode)}
        style={{ fill: 'linear-gradient(-90deg, rgba(63,178,127,0.55) 0%, rgba(63,178,127,0.02) 100%)' }}
        line={{ style: { stroke: '#3fb27f', strokeWidth: 2 } }}
        scale={{ y: { domain: [0, 100] } }}
        axis={{
          y: { labelFormatter: (v: number) => `${v}%` },
        }}
        tooltip={(d: { label: string; rate: number }) => ({
          name: 'pass-rate',
          value: `${d.rate}%`,
        })}
      />
    </div>
  );
}
