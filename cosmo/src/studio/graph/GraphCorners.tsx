/**
 * W3.5: Grid Resonance + Corner Reticles for active nodes.
 *
 * Grid: background grid lines in 150px radius modulate brightness 0.04→0.18
 *       only when a run is active. Zero cost at idle.
 * Corners: 3×3px cyber-reticle braces on category cards at active signal color.
 */
import { memo } from 'react';

export interface GridResonanceProps {
  canvasWidth: number;
  canvasHeight: number;
  activeCenterX: number;
  activeCenterY: number;
  worldMinX: number;
  worldMinY: number;
  active: boolean;
  color?: string;
}

const RADIUS = 150;
const GRID_SIZE = 40;

export const GridResonance = memo(function GridResonance({
  canvasWidth, canvasHeight, activeCenterX, activeCenterY,
  worldMinX, worldMinY, active, color = '#00F0FF',
}: GridResonanceProps) {
  if (!active) return null;

  const lines: React.JSX.Element[] = [];
  const cx = activeCenterX - worldMinX;
  const cy = activeCenterY - worldMinY;

  for (let x = 0; x <= canvasWidth; x += GRID_SIZE) {
    const dist = Math.abs(x - cx);
    const alpha = dist < RADIUS ? 0.04 + 0.14 * (1 - dist / RADIUS) : 0.04;
    lines.push(
      <line key={`gx-${x}`} x1={x} y1={0} x2={x} y2={canvasHeight}
        stroke={color} strokeWidth={0.5} opacity={Math.max(0.02, alpha)} />
    );
  }
  for (let y = 0; y <= canvasHeight; y += GRID_SIZE) {
    const dist = Math.abs(y - cy);
    const alpha = dist < RADIUS ? 0.04 + 0.14 * (1 - dist / RADIUS) : 0.04;
    lines.push(
      <line key={`gy-${y}`} x1={0} y1={y} x2={canvasWidth} y2={y}
        stroke={color} strokeWidth={0.5} opacity={Math.max(0.02, alpha)} />
    );
  }

  return (
    <svg
      className="pk-grid-resonance"
      width={canvasWidth} height={canvasHeight}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}
      aria-hidden
    >
      {lines}
    </svg>
  );
});

interface CornerReticlesProps {
  boxLeft: number;
  boxTop: number;
  boxWidth: number;
  boxHeight: number;
  worldMinX: number;
  worldMinY: number;
  color?: string;
  visible: boolean;
}

export const CornerReticles = memo(function CornerReticles({
  boxLeft, boxTop, boxWidth, boxHeight, worldMinX, worldMinY,
  color = '#00F0FF', visible,
}: CornerReticlesProps) {
  if (!visible) return null;

  const l = boxLeft - worldMinX;
  const t = boxTop - worldMinY;
  const w = boxWidth;
  const h = boxHeight;
  const L = 3;
  const G = 2;
  const S = `stroke:${color};stroke-width:1.5;fill:none`;

  const braces = [
    // top-left
    `M ${l + G} ${t + G + L} V ${t + G} H ${l + G + L}`,
    // top-right
    `M ${l + w - G - L} ${t + G} H ${l + w - G} V ${t + G + L}`,
    // bottom-left
    `M ${l + G} ${t + h - G - L} V ${t + h - G} H ${l + G + L}`,
    // bottom-right
    `M ${l + w - G - L} ${t + h - G} H ${l + w - G} V ${t + h - G - L}`,
  ];

  return (
    <svg
      className="pk-corner-reticles"
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 6 }}
      width={l + w + 10} height={t + h + 10}
      aria-hidden
    >
      {braces.map((d, i) => <path key={i} d={d} style={{ stroke: color, strokeWidth: 1.5, fill: 'none' }} />)}
    </svg>
  );
});

interface GraphCornersProps {
  width: number; height: number;
  worldMinX: number; worldMinY: number;
  activeCenterX?: number; activeCenterY?: number;
  boxLeft?: number; boxTop?: number; boxWidth?: number; boxHeight?: number;
  active: boolean; color?: string;
}

export const GraphCorners = memo(function GraphCorners({
  width, height, worldMinX, worldMinY,
  activeCenterX = 0, activeCenterY = 0,
  boxLeft = 0, boxTop = 0, boxWidth = 0, boxHeight = 0,
  active, color = '#A855F7',
}: GraphCornersProps) {
  return (
    <>
      <GridResonance canvasWidth={width} canvasHeight={height} activeCenterX={activeCenterX} activeCenterY={activeCenterY} worldMinX={worldMinX} worldMinY={worldMinY} active={active} color={color} />
      <CornerReticles boxLeft={boxLeft} boxTop={boxTop} boxWidth={boxWidth} boxHeight={boxHeight} worldMinX={worldMinX} worldMinY={worldMinY} color={color} visible={active} />
    </>
  );
});