/**
 * Scene node renderer (F-8) — draws battle map nodes from scene‑graph.
 * Supports PageModel, DataModule, Fuzzer, Connector, Scenario, Auth_Profile.
 */
import type { SceneNode, SceneNodeVisualStatus } from '../types';
import type { ThemeColors } from './colors';

const ICONS: Record<SceneNode['kind'], string> = {
  page_model:    'M4 4h16v4H4zm2 6h12v4H6zm-2 6h16v4H4z',    // stacked rectangles
  data_module:   'M4 6c0 1.7 3.6 3 8 3s8-1.3 8-3v4c0 1.7-3.6 3-8 3S4 11.7 4 10V6zm0 6c0 1.7 3.6 3 8 3s8-1.3 8-3', // triple DB
  fuzzer:        'M12 2L2 7l10 5 10-5zm0 6.5L4 5l8-4 8 4zM12 10L2 15l10 5 10-5z', // crosshair
  connector:     'M8 16l4-12 4 12-4 4z',                     // diamond
  scenario:      'M4 12h3l1.5 3 3-10 3 10 1.5-3H20',        // wave
  auth_profile:  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z', // shield
};

const STATUS_COLORS: Record<SceneNodeVisualStatus, string> = {
  idle:    '#475569',
  active:  '#38bdf8',
  hit:     '#ef4444',
  passed:  '#22c55e',
  blocked: '#ef4444',
};

function drawIconPath(ctx: CanvasRenderingContext2D, kind: SceneNode['kind'], iconSize: number) {
  const d = ICONS[kind];
  if (!d) return;
  const s = iconSize / 24;
  ctx.save();
  ctx.scale(s, s);
  ctx.fill(new Path2D(d));
  ctx.restore();
}

export function drawSceneNode(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  colors: ThemeColors,
  scale: number,
  offsetX: number,
  offsetY: number,
  nodeRadius: number,
) {
  const cx = node.x * scale + offsetX;
  const cy = node.y * scale + offsetY;
  const r = nodeRadius * scale;
  const statusColor = STATUS_COLORS[node.status] ?? STATUS_COLORS.idle;

  // Status glow
  if (node.status !== 'idle') {
    ctx.save();
    ctx.shadowColor = statusColor;
    ctx.shadowBlur = 12 * scale;
    ctx.fillStyle = statusColor;
    ctx.globalAlpha = 0.25;
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

  // Health bar
  if (node.health < 1) {
    const barW = r * 1.8;
    const barH = 3 * scale;
    const barY = cy + r + 8 * scale;
    const barX = cx - barW / 2;
    ctx.save();
    ctx.fillStyle = colors.healthBarBg;
    ctx.fillRect(barX, barY, barW, barH);
    const hc = node.health > 0.6 ? colors.healthGreen : node.health > 0.3 ? colors.healthYellow : colors.healthRed;
    ctx.fillStyle = hc;
    ctx.fillRect(barX, barY, barW * node.health, barH);
    ctx.restore();
  }
}