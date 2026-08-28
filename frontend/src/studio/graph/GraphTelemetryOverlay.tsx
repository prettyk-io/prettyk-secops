/**
 * W3: Graph Telemetry Overlay — photon trails + adaptive slow-mo + subgraph dimming.
 *
 * CSS-only Bezier animation on active edges. No WebGL, no heavy canvas.
 * Adaptive speed tied to latency telemetry.
 */
import { memo, useMemo } from 'react';
import type { GraphEdge, GraphPosition } from './graphTypes';

export interface PhotonTrailConfig {
  edgeId: string;
  source: GraphPosition;
  target: GraphPosition;
  color: string;   // eg '#00F0FF'
  speed: string;   // '0.6s' | '1.8s' | '3.5s' — adaptive from latency
  dimmed?: boolean;
}

export interface GraphTelemetryOverlayProps {
  width: number;
  height: number;
  worldMinX: number;
  worldMinY: number;
  photonEdges: PhotonTrailConfig[];
  inactiveEdgeIds: Set<string>;
}

/** Map latency_ms to CSS animation duration. */
export function adaptiveSpeed(latencyMs: number): string {
  if (latencyMs < 200) return '0.6s';
  if (latencyMs < 1500) return '1.8s';
  return '3.5s';
}

/** Map edge status to photon color. */
export function photonColor(kind: string): string {
  switch (kind) {
    case 'crawl': return '#00F0FF';
    case 'active_scan': return '#A855F7';
    case 'fuzzing': return '#F59E0B';
    case 'success': return '#10B981';
    case 'failure': return '#EF4444';
    default: return '#00F0FF';
  }
}

export const GraphTelemetryOverlay = memo(function GraphTelemetryOverlay({
  width, height, worldMinX, worldMinY, photonEdges, inactiveEdgeIds,
}: GraphTelemetryOverlayProps) {
  if (photonEdges.length === 0) return null;

  return (
    <svg
      className="pk-graph-telemetry"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 5 }}
    >
      <defs>
        <filter id="photon-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g transform={`translate(${-worldMinX} ${-worldMinY})`}>
        {photonEdges.map((pe) => {
          const sx = pe.source.x, sy = pe.source.y;
          const tx = pe.target.x, ty = pe.target.y;
          const mx = (sx + tx) / 2, my = (sy + ty) / 2 + 20;
          const d = `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`;
          const inactive = inactiveEdgeIds.has(pe.edgeId);
          return (
            <path
              key={pe.edgeId}
              d={d}
              fill="none"
              stroke={pe.color}
              strokeWidth={inactive ? 1 : 2.5}
              strokeDasharray="8 12"
              strokeLinecap="round"
              filter="url(#photon-glow)"
              opacity={inactive ? 0.25 : 0.9}
              style={{
                animation: inactive ? 'none' : `pk-photon-dash ${pe.speed} linear infinite`,
                transition: 'opacity 0.5s ease',
              }}
            />
          );
        })}
        {/* Smart Subgraph Pruning — dimmed overlay on inactive edges */}
        {Array.from(inactiveEdgeIds).map((eid) => {
          const pe = photonEdges.find((p) => p.edgeId === eid);
          if (!pe) return null;
          return (
            <line
              key={`dim-${eid}`}
              x1={pe.source.x} y1={pe.source.y}
              x2={pe.target.x} y2={pe.target.y}
              stroke={`${pe.color}40`}
              strokeWidth={0.5}
              opacity={0.25}
            />
          );
        })}
      </g>
    </svg>
  );
});