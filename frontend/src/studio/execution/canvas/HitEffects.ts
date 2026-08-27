/**
 * Hit effects — flash on TARGET_HIT, shield pulse, shockwave rings.
 */
import type { SceneNode } from '../types';
import type { ThemeColors } from './colors';

export interface HitEffect {
  nodeId: string;
  startMs: number;
  kind: 'hit' | 'shield' | 'critical';
}

const FLASH_DURATION_MS = 300;
const PULSE_DURATION_MS = 500;

export function drawHitEffect(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  effect: HitEffect,
  colors: ThemeColors,
  nowMs: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  nodeRadius: number,
) {
  const elapsed = nowMs - effect.startMs;
  const cx = node.x * scale + offsetX;
  const cy = node.y * scale + offsetY;

  if (elapsed > PULSE_DURATION_MS) return;

  if (effect.kind === 'hit') {
    const t = 1 - Math.min(1, elapsed / FLASH_DURATION_MS);
    const flashAlpha = t * 0.6;
    ctx.save();
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle = colors.hitFlash;
    ctx.beginPath();
    ctx.arc(cx, cy, nodeRadius * scale * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (effect.kind === 'critical') {
    // Expanding ring
    const ringT = Math.min(1, elapsed / PULSE_DURATION_MS);
    const ringAlpha = 1 - ringT;
    const ringRadius = nodeRadius * scale * (1 + ringT * 3);
    ctx.save();
    ctx.globalAlpha = ringAlpha * 0.5;
    ctx.strokeStyle = colors.beamGlow.critical;
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (effect.kind === 'shield') {
    const t = 1 - Math.min(1, elapsed / PULSE_DURATION_MS);
    ctx.save();
    ctx.globalAlpha = t * 0.4;
    ctx.strokeStyle = colors.nodeStatus.shielded;
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, nodeRadius * scale * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}