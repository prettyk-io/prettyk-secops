/**
 * Beam engine — renders fuzzer beams with channeling-stage dim curves.
 *
 * F-7: warmup (easeInQuad 0→1), active (1.0), cooling (easeOutQuad 1→0), dead (0).
 * Pulsation: 12 Hz sinusoidal on top of opacity.
 * Colors: cyan #38bdf8 on warmup/active, red #ef4444 on critical (TARGET_HIT).
 */
import type { FuzzerBeam, BeamContext } from '../types';
import type { ThemeColors } from './colors';

export const BEAM_PULSE_HZ = 12;
const CORE_W = 2;
const GLOW_W = 8.5;

// ── Easing functions ──

function easeInQuad(t: number): number { return t * t; }
function easeOutQuad(t: number): number { return t * (2 - t); }

// ── Stage durations (configurable) ──

export const DEFAULT_WARMUP_MS = 400;
export const DEFAULT_COOLING_MS = 250;

/** Compute opacity from beam stage + progress using easing curves. */
export function beamOpacity(beam: FuzzerBeam): number {
  switch (beam.status) {
    case 'warmup':
      return easeInQuad(beam.progress);
    case 'active':
      return 1.0;
    case 'cooling':
      return easeOutQuad(1 - beam.progress);
    case 'dead':
      return 0;
    default:
      return 0;
  }
}

/** Resolve beam color based on context. */
export function beamColor(context: BeamContext): string {
  return context === 'critical' ? '#ef4444' : '#38bdf8';
}

export interface BeamDrawContext {
  ctx: CanvasRenderingContext2D;
  colors: ThemeColors;
  nowMs: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function drawBeam(
  beam: FuzzerBeam,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  c: BeamDrawContext,
) {
  const { ctx, colors, nowMs, scale, offsetX, offsetY } = c;

  const opacity = beamOpacity(beam);
  if (opacity <= 0.001) return;

  const sx = sourceX * scale + offsetX;
  const sy = sourceY * scale + offsetY;
  const tx = targetX * scale + offsetX;
  const ty = targetY * scale + offsetY;

  // 12 Hz sinusoidal pulse on top of stage opacity
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.001 * BEAM_PULSE_HZ * Math.PI * 2);
  const alpha = opacity * (0.4 + 0.6 * pulse);

  const glowColor = beamColor(beam.context);

  // Outer glow
  ctx.save();
  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = GLOW_W * scale;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 12 * scale;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.restore();

  // Inner core
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = colors.beamCore;
  ctx.lineWidth = CORE_W * scale;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 4 * scale;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.restore();
}

/**
 * Advance beam stage by dtMs. Returns new stage.
 * F-7: warmup ~400ms → active → cooling ~250ms → dead.
 */
export function advanceBeam(beam: FuzzerBeam, dtMs: number): Partial<FuzzerBeam> {
  const warmupMs = beam.warmupMs ?? DEFAULT_WARMUP_MS;
  const coolingMs = beam.coolingMs ?? DEFAULT_COOLING_MS;

  switch (beam.status) {
    case 'warmup': {
      const nextProgress = beam.progress + dtMs / warmupMs;
      if (nextProgress >= 1) {
        return { status: 'active' as const, progress: 1, stageStartedMs: beam.stageStartedMs + warmupMs };
      }
      return { progress: nextProgress };
    }
    case 'active':
      return {}; // stays active until external transition
    case 'cooling': {
      const nextProgress = beam.progress + dtMs / coolingMs;
      if (nextProgress >= 1) {
        return { status: 'dead' as const, progress: 1 };
      }
      return { progress: nextProgress };
    }
    case 'dead':
      return {};
    default:
      return {};
  }
}