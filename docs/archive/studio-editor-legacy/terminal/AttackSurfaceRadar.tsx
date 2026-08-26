/**
 * PK-BL-8: Attack Surface Radar Widget — кольцевая диаграмма протоколов с числом целей.
 */
import { useMemo } from 'react';

export interface RadarTarget {
  protocol: string;
  count: number;
  color: string;
}

export interface RadarWidgetProps {
  targets: RadarTarget[];
  size?: number;
}

const DEFAULT_TARGETS: RadarTarget[] = [
  { protocol: 'HTTPS', count: 12, color: '#38bdf8' },
  { protocol: 'HTTP', count: 4, color: '#f59e0b' },
  { protocol: 'gRPC', count: 3, color: '#a855f7' },
  { protocol: 'GraphQL', count: 2, color: '#ec4899' },
  { protocol: 'WebSocket', count: 1, color: '#10b981' },
];

export function AttackSurfaceRadar({ targets = DEFAULT_TARGETS, size = 200 }: RadarWidgetProps) {
  const total = useMemo(() => targets.reduce((a, t) => a + t.count, 0) || 1, [targets]);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 8;
  const ringW = 14;
  const innerRadius = radius - ringW;

  let cumulativeAngle = -Math.PI / 2;

  const arcs = targets.map((t) => {
    const sliceAngle = (t.count / total) * Math.PI * 2;
    const startAngle = cumulativeAngle;
    cumulativeAngle += sliceAngle;

    // Outer ring arc
    const outerR = radius;
    const innerR = innerRadius;
    const x1o = cx + outerR * Math.cos(startAngle);
    const y1o = cy + outerR * Math.sin(startAngle);
    const x2o = cx + outerR * Math.cos(startAngle + sliceAngle);
    const y2o = cy + outerR * Math.sin(startAngle + sliceAngle);
    const x1i = cx + innerR * Math.cos(startAngle);
    const y1i = cy + innerR * Math.sin(startAngle);
    const x2i = cx + innerR * Math.cos(startAngle + sliceAngle);
    const y2i = cy + innerR * Math.sin(startAngle + sliceAngle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    return {
      d: `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1i} ${y1i} Z`,
      ...t,
    };
  });

  // Grid rings
  const gridRings = [0.25, 0.5, 0.75, 1].map((pct) => {
    const r = innerRadius * pct;
    return <circle key={pct} cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />;
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {/* Grid */}
        {gridRings}
        {/* Crosshairs */}
        <line x1={cx} y1={cy - innerRadius} x2={cx} y2={cy + innerRadius} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
        <line x1={cx - innerRadius} y1={cy} x2={cx + innerRadius} y2={cy} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
        {/* Arcs */}
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color} opacity={0.7} />
        ))}
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={3} fill="#38bdf8" opacity={0.5} />
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        {targets.map((t) => (
          <div key={t.protocol} className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
            <div className="size-2 rounded-sm shrink-0" style={{ backgroundColor: t.color }} />
            {t.protocol} ({t.count})
          </div>
        ))}
      </div>

      <p className="text-[10px] text-slate-600 font-medium">{total} total endpoints</p>
    </div>
  );
}