/**
 * Node renderer — draws battle map nodes with icons, health bars, status glow.
 */
import type { BattleNode } from '../types';
import type { ThemeColors } from './colors';

// Simple SVG-path icons for each node kind (drawn on canvas)
const ICONS: Record<BattleNode['kind'], string> = {
  gateway: 'M8 16l4-12 4 12-4 4z',
  microservice: 'M4 4h16v4H4zm2 6h12v4H6zm-2 6h16v4H4z',
  database: 'M4 6c0 1.7 3.6 3 8 3s8-1.3 8-3v4c0 1.7-3.6 3-8 3S4 11.7 4 10V6zm0 6c0 1.7 3.6 3 8 3s8-1.3 8-3',
  api: 'M4 12h3l1.5 3 3-10 3 10 1.5-3H20',
  external: 'M12 2L2 7l10 5 10-5zm0 6.5L4 5l8-4 8 4zM12 10L2 15l10 5 10-5z',
};

const NODE_CX = 12; // icon viewBox has center at 12
const NODE_CY = 12;

function drawIconPath(ctx: CanvasRenderingContext2D, kind: BattleNode['kind'], iconSize: number) {
  const d = ICONS[kind];
  if (!d) return;
  const s = iconSize / 24; // viewBox is 24x24
  ctx.save();
  ctx.scale(s, s);
  const path = new Path2D(d);
  ctx.fill(path);
  ctx.restore();
}

export function drawNode(
  ctx: CanvasRenderingContext2D,
  node: BattleNode,
  colors: ThemeColors,
  scale: number,
  offsetX: number,
  offsetY: number,
  nodeRadius: number,
) {
  const cx = node.x * scale + offsetX;
  const cy = node.y * scale + offsetY;
  const r = nodeRadius * scale;

  // Status glow
  const statusColor = colors.nodeStatus[node.status];
  if (node.status !== 'idle' && node.status !== 'penetrated') {
    ctx.save();
    ctx.shadowColor = statusColor;
    ctx.shadowBlur = 12 * scale;
    ctx.fillStyle = statusColor;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Node body
  ctx.save();
  ctx.fillStyle = '#0F172A';
  ctx.strokeStyle = statusColor;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Icon
  ctx.save();
  ctx.fillStyle = statusColor;
  ctx.translate(cx - 10 * scale, cy - 10 * scale);
  drawIconPath(ctx, node.kind, 20 * scale);
  ctx.restore();

  // Label
  ctx.save();
  ctx.fillStyle = colors.text;
  ctx.font = `${11 * scale}px "Golos UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(node.label, cx, cy - r - 10 * scale);
  ctx.restore();

  // Health bar (if damaged)
  if (node.health < 1) {
    const barW = r * 1.8;
    const barH = 3 * scale;
    const barY = cy + r + 8 * scale;
    const barX = cx - barW / 2;

    ctx.save();
    ctx.fillStyle = colors.healthBarBg;
    ctx.fillRect(barX, barY, barW, barH);

    const healthColor = node.health > 0.6 ? colors.healthGreen
      : node.health > 0.3 ? colors.healthYellow : colors.healthRed;
    ctx.fillStyle = healthColor;
    ctx.fillRect(barX, barY, barW * node.health, barH);
    ctx.restore();
  }
}