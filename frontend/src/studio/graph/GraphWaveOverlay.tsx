/** Neon edge-wave overlay for Studio Graph.
 * GUARANTEE: Every beam runs strictly on the canvas perimeter/edges. Zero diagonals.
 */
import { memo, useEffect, useRef, type RefObject } from 'react';
import {
  CORNER_IDS,
  cornerDepartingEdges,
  cornerPerimeterOffset,
  cornerPoint,
  pointOnEdge,
  pointOnPerimeter,
  type Corner,
  type Edge,
} from './wavePresets';

const SHOWCASE = 1; // Multiplier: set >1 if needed, 1 is standard

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

const COLOR_CYAN = '#38BDF8';
const COLOR_VIOLET = '#A855F7';
const COLOR_MAGENTA = '#D946EF';
const PALETTE = [COLOR_CYAN, COLOR_VIOLET, COLOR_MAGENTA];

export interface GraphWaveOverlayProps {
  containerRef: RefObject<HTMLElement | null>;
  isIdle: boolean;
  inverted?: boolean;
  delayOffset?: number;
}

// ── Beam Types ──

interface CascadeBeam {
  kind: 'cascade';
  edge: Edge;
  reverse: boolean;
  targetCorner: Corner;
  color: string;
  t: number; // 0..1
  phase: 'flash-out' | 'glow' | 'flash-back';
  phaseStartMs: number;
}

interface CreepSlowBeam {
  kind: 'creepslow';
  edge: Edge;
  reverse: boolean;
  color: string;
  t: number; // 0..1
  phase: 'fast' | 'slow';
  opacity: number;
}

interface HeartbeatBeam {
  kind: 'heartbeat';
  edge: Edge;
  color: string;
  t: number; // 0..1
  beatCount: number;
  pauseUntilMs: number;
}

interface MirrorRunner {
  t: number; // 0..4 (perimeter units)
  lastBurstMs: number;
  isBursting: boolean;
}

type ActiveBeam = CascadeBeam | CreepSlowBeam | HeartbeatBeam;

interface CornerGlow {
  corner: Corner;
  color: string;
  intensity: number;
  decayRate: number;
}

export const GraphWaveOverlay = memo(function GraphWaveOverlay({
  containerRef,
  isIdle,
  inverted = false,
  delayOffset = 0,
}: GraphWaveOverlayProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beamsRef = useRef<ActiveBeam[]>([]);
  const glowsRef = useRef<CornerGlow[]>([]);
  const mirrorRef = useRef<MirrorRunner>({
    t: delayOffset ? delayOffset % 4 : 0,
    lastBurstMs: 0,
    isBursting: false,
  });

  const lastCascadeMs = useRef(0);
  const lastCreepMs = useRef(0);
  const lastHeartbeatMs = useRef(0);
  const rafRef = useRef(0);
  const idleRef = useRef(isIdle);
  idleRef.current = isIdle;

  useEffect(() => {
    let running = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const timeShiftMs = (delayOffset ?? 0) * 1000;
    mirrorRef.current.t = delayOffset ? delayOffset % 4 : 0;
    mirrorRef.current.lastBurstMs = performance.now() + timeShiftMs;
    lastCascadeMs.current = performance.now() - 5000 + timeShiftMs;
    lastCreepMs.current = performance.now() - 2000 + timeShiftMs;
    lastHeartbeatMs.current = performance.now() - 10000 + timeShiftMs;

    const tick = (now: number) => {
      if (!running) return;
      const cvs = canvasRef.current!;
      const cw = cvs.width;
      const ch = cvs.height;
      if (!cw || !ch) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      ctx.clearRect(0, 0, cw, ch);

      if (!idleRef.current) {
        // User active -> reset active beam counters and wait for 20s idle
        beamsRef.current = [];
        glowsRef.current = [];
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const m = SHOWCASE;

      // ─────────────────────────────────────────────────────────────
      // 1. Spawners for Algorithmic Beams
      // ─────────────────────────────────────────────────────────────

      // 1A. Cascade: 2 vectors from 1 corner flash along both edges, glow at target corners 2s, then flash back
      const cascadeInterval = rand(10000 / m, 15000 / m);
      if (now - lastCascadeMs.current > cascadeInterval) {
        lastCascadeMs.current = now;
        const originCorner = pick(CORNER_IDS);
        const color = pick(PALETTE);
        const departing = cornerDepartingEdges(originCorner);

        for (const dep of departing) {
          beamsRef.current.push({
            kind: 'cascade',
            edge: dep.edge,
            reverse: inverted ? !dep.reverse : dep.reverse,
            targetCorner: dep.targetCorner,
            color,
            t: 0,
            phase: 'flash-out',
            phaseStartMs: now,
          });
        }
        // Origin corner soft ping (max 20px radius)
        glowsRef.current.push({
          corner: originCorner,
          color,
          intensity: 0.22,
          decayRate: 0.003,
        });
      }

      // 1B. Creep-Slow: Fast to 50%, then slow-mo glowing brighter to 100%
      const creepInterval = rand(7000 / m, 11000 / m);
      if (now - lastCreepMs.current > creepInterval) {
        lastCreepMs.current = now;
        const originCorner = pick(CORNER_IDS);
        const dep = pick(cornerDepartingEdges(originCorner));
        const color = pick(PALETTE);

        beamsRef.current.push({
          kind: 'creepslow',
          edge: dep.edge,
          reverse: inverted ? !dep.reverse : dep.reverse,
          color,
          t: 0,
          phase: 'fast',
          opacity: 0.5,
        });
      }

      // 1C. Heartbeat: Rhythmic dual pulse along all 4 edges simultaneously
      const heartInterval = rand(14000 / m, 20000 / m);
      if (now - lastHeartbeatMs.current > heartInterval) {
        lastHeartbeatMs.current = now;
        const color = Math.random() < 0.5 ? COLOR_CYAN : COLOR_VIOLET;

        for (const edge of ['top', 'right', 'bottom', 'left'] as Edge[]) {
          beamsRef.current.push({
            kind: 'heartbeat',
            edge,
            color,
            t: 0,
            beatCount: 1,
            pauseUntilMs: 0,
          });
        }
        // Small corner pings
        for (const c of CORNER_IDS) {
          glowsRef.current.push({
            corner: c,
            color,
            intensity: 0.18,
            decayRate: 0.004,
          });
        }
      }

      // ─────────────────────────────────────────────────────────────
      // 2. Draw Continuous Synchronized Mirror Beams (Cyan CW + Violet CCW or Inverted)
      // ─────────────────────────────────────────────────────────────
      const mirror = mirrorRef.current;
      const timeSinceBurst = now - mirror.lastBurstMs;

      // Every 2.0 seconds: burst for 0.2s (advance fast across 2 edges), else slow crawl
      if (timeSinceBurst > 2000 && !mirror.isBursting) {
        mirror.isBursting = true;
        mirror.lastBurstMs = now;
      }

      if (mirror.isBursting) {
        if (now - mirror.lastBurstMs < 200) {
          // Burst speed
          mirror.t = (mirror.t + 0.08 * m) % 4;
        } else {
          mirror.isBursting = false;
          mirror.lastBurstMs = now;
        }
      } else {
        // Normal slow crawl
        mirror.t = (mirror.t + 0.0018 * m) % 4;
      }

      if (!inverted) {
        // Standard (Left canvas): Cyan Clockwise from TL, Violet Counter-Clockwise from BR
        drawContinuousPerimeterBeam(ctx, mirror.t, 0.65, COLOR_CYAN, cw, ch);
        const violetT = (2 - mirror.t + 4) % 4;
        drawContinuousPerimeterBeam(ctx, violetT, -0.65, COLOR_VIOLET, cw, ch);
      } else {
        // Inverted (Right canvas): Cyan Counter-Clockwise from BR, Violet Clockwise from TL
        const cyanT = (2 - mirror.t + 4) % 4;
        drawContinuousPerimeterBeam(ctx, cyanT, -0.65, COLOR_CYAN, cw, ch);
        const violetT = mirror.t;
        drawContinuousPerimeterBeam(ctx, violetT, 0.65, COLOR_VIOLET, cw, ch);
      }

      // ─────────────────────────────────────────────────────────────
      // 3. Update and Draw Algorithmic Beams (Cascade, Creep, Heartbeat)
      // ─────────────────────────────────────────────────────────────
      beamsRef.current = beamsRef.current.filter((b) => {
        if (b.kind === 'cascade') {
          if (b.phase === 'flash-out') {
            b.t += 0.045 * m;
            if (b.t >= 1) {
              b.t = 1;
              b.phase = 'glow';
              b.phaseStartMs = now;
              // Target corner subtle glow
              glowsRef.current.push({
                corner: b.targetCorner,
                color: b.color,
                intensity: 0.22,
                decayRate: 0.0015,
              });
            }
          } else if (b.phase === 'glow') {
            if (now - b.phaseStartMs > 1800) {
              b.phase = 'flash-back';
            }
          } else if (b.phase === 'flash-back') {
            b.t -= 0.045 * m;
            if (b.t <= 0) {
              return false; // Beam cycle finished
            }
          }

          // Draw beam along edge
          drawEdgeBeam(ctx, b.edge, b.t, 0.35, b.color, cw, ch, b.reverse);
          return true;
        }

        if (b.kind === 'creepslow') {
          if (b.phase === 'fast') {
            b.t += 0.035 * m;
            if (b.t >= 0.5) {
              b.phase = 'slow';
            }
          } else {
            // Slow-mo with brighter intensity
            b.t += 0.004 * m;
            b.opacity = Math.min(0.9, b.opacity + 0.008);
            if (b.t >= 1) {
              return false; // Done
            }
          }

          drawEdgeBeam(ctx, b.edge, b.t, 0.25, b.color, cw, ch, b.reverse, b.opacity);
          return true;
        }

        if (b.kind === 'heartbeat') {
          if (b.pauseUntilMs > now) {
            return true;
          }
          b.t += 0.06 * m;
          if (b.t >= 1) {
            b.t = 0;
            if (b.beatCount === 1) {
              b.beatCount = 2;
              b.pauseUntilMs = now + 120; // Short gap between dual pulse
            } else {
              return false; // Heartbeat finished
            }
          }

          drawEdgeBeam(ctx, b.edge, b.t, 0.2, b.color, cw, ch, false, 0.65);
          return true;
        }

        return false;
      });

      // ─────────────────────────────────────────────────────────────
      // 4. Render Corner Flares (Strictly sharp along edges, no round arcs)
      // ─────────────────────────────────────────────────────────────
      glowsRef.current = glowsRef.current.filter((g) => {
        g.intensity -= g.decayRate;
        if (g.intensity <= 0.02) return false;

        const cp = cornerPoint(g.corner, cw, ch);
        const len = 20;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(0.16, g.intensity * 0.7);
        ctx.fillStyle = g.color;
        ctx.shadowBlur = 6;
        ctx.shadowColor = g.color;

        // Draw sharp corner crosshair / edge flare (zero round arcs)
        const xDir = cp.x === 0 ? 1 : -1;
        const yDir = cp.y === 0 ? 1 : -1;
        ctx.fillRect(cp.x, cp.y - 1, xDir * len, 2);
        ctx.fillRect(cp.x - 1, cp.y, 2, yDir * len);
        ctx.restore();

        return true;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    const measure = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && canvasRef.current) {
        canvasRef.current.width = rect.width;
        canvasRef.current.height = rect.height;
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    const el = containerRef.current;
    if (el) ro.observe(el);

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [containerRef]);

  return (
    <canvas
      ref={canvasRef}
      className={`pk-graph-wave-overlay ${isIdle ? 'pk-graph-wave-overlay--idle' : ''} ${inverted ? 'pk-graph-wave-overlay--inverted' : ''}`}
    />
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Drawing Helpers (Guaranteed 100% strictly on perimeter / edges)
// ─────────────────────────────────────────────────────────────────────────────

/** Draws a beam on the continuous perimeter from (t - length) to t. */
function drawContinuousPerimeterBeam(
  ctx: CanvasRenderingContext2D,
  tHead: number,
  lengthSigned: number,
  color: string,
  cw: number,
  ch: number,
): void {
  const isForward = lengthSigned >= 0;
  const len = Math.abs(lengthSigned);
  const tTail = isForward ? tHead - len : tHead + len;

  const tMin = Math.min(tTail, tHead);
  const tMax = Math.max(tTail, tHead);

  const steps = 24;
  const stepDelta = (tHead - tTail) / steps;

  // Collect all t-stops: uniform steps + exact integer corners crossed
  const stops: number[] = [];
  for (let i = 0; i <= steps; i++) {
    stops.push(tTail + stepDelta * i);
  }

  // Insert any integer perimeter-corner boundaries strictly between tMin and tMax
  const lo = Math.ceil(tMin);
  const hi = Math.floor(tMax);
  for (let k = lo; k <= hi; k++) {
    if (k > tMin && k < tMax) {
      stops.push(k);
    }
  }

  // Sort according to the beam's direction
  stops.sort((a, b) => (isForward ? a - b : b - a));

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 2.0;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.shadowBlur = 5;
  ctx.shadowColor = color;

  // Draw trail with multi-stop fading gradient towards head (шлейф)
  ctx.beginPath();
  const startPt = pointOnPerimeter(stops[0]!, cw, ch);
  ctx.moveTo(startPt.x, startPt.y);

  for (let i = 1; i < stops.length; i++) {
    const pt = pointOnPerimeter(stops[i]!, cw, ch);
    ctx.lineTo(pt.x, pt.y);
  }

  const headPt = pointOnPerimeter(tHead, cw, ch);
  const grad = ctx.createLinearGradient(startPt.x, startPt.y, headPt.x, headPt.y);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.35, 'transparent');
  grad.addColorStop(0.75, color);
  grad.addColorStop(1, color);

  ctx.strokeStyle = grad;
  ctx.globalAlpha = 0.48;
  ctx.stroke();

  // Head sharp pulse dot (square, no round arc)
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(headPt.x - 1.5, headPt.y - 1.5, 3, 3);

  ctx.restore();
}

/** Draws a single edge beam from (t - length) to t. */
function drawEdgeBeam(
  ctx: CanvasRenderingContext2D,
  edge: Edge,
  tHead: number,
  length: number,
  color: string,
  cw: number,
  ch: number,
  reverse = false,
  opacity = 0.7,
): void {
  const tTail = Math.max(0, tHead - length);
  const steps = 16;
  const stepDelta = (tHead - tTail) / steps;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 2.0;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.shadowBlur = 5;
  ctx.shadowColor = color;

  ctx.beginPath();
  const startPt = pointOnEdge(edge, tTail, cw, ch, reverse);
  ctx.moveTo(startPt.x, startPt.y);

  for (let i = 1; i <= steps; i++) {
    const pt = pointOnEdge(edge, tTail + stepDelta * i, cw, ch, reverse);
    ctx.lineTo(pt.x, pt.y);
  }

  const headPt = pointOnEdge(edge, tHead, cw, ch, reverse);
  const grad = ctx.createLinearGradient(startPt.x, startPt.y, headPt.x, headPt.y);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.4, 'transparent');
  grad.addColorStop(0.8, color);
  grad.addColorStop(1, color);

  ctx.strokeStyle = grad;
  ctx.globalAlpha = opacity * 0.65;
  ctx.stroke();

  // Head sharp pulse dot (square)
  ctx.shadowBlur = 7;
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity * 0.75;
  ctx.fillRect(headPt.x - 1.5, headPt.y - 1.5, 3, 3);

  ctx.restore();
}
