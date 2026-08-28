/**
 * WZ-4: RTS-камера — critically damped spring + zoom 1.0-3.5x + Action Focus Director.
 *
 * Спецификация §3.1–3.2:
 *   C(t) = (x_c, y_c, z_c) — центр фокуса + zoom
 *   Critically Damped Spring: ω0 = 8.5 rad/s
 *   Lead-in 120ms → Locked Engagement (2.8x) → Zoom Out Decay 350ms
 *
 * Реализация — точное замкнутое решение критически затухающей пружины:
 *   x(t) = target + (from - target) · (1 + ω0·t) · e^{-ω0·t}
 * Это монотонная сходимость без перерегулирования (overshoot) и осцилляций —
 * определение критического затухания (ζ = 1).
 */

/** Состояние камеры в мировых координатах. */
export interface CameraState {
  x: number;
  y: number;
  zoom: number;   // 1.0–3.5
}

const ZOOM_MIN = 1.0;
const ZOOM_MAX = 3.5;
const ZOOM_ENGAGEMENT = 2.8;
const LEAD_IN_MS = 120;
const ZOOM_OUT_MS = 350;
const OMEGA0 = 8.5;  // rad/s

/** Тип анимации камеры. */
export type CameraAnimationPhase =
  | 'idle'
  | 'lead_in'
  | 'engaged'
  | 'zoom_out';

/** Замкнутое решение критически затухающей пружины (монотонно, без overshoot). */
function criticallyDamped(from: number, target: number, t: number, omega0: number): number {
  // x(t) = target + (from - target) * (1 + ω0·t) * e^{-ω0·t}
  return target + (from - target) * (1 + omega0 * t) * Math.exp(-omega0 * t);
}

export class RTSCamera {
  state: CameraState = { x: 0, y: 0, zoom: 1.0 };
  phase: CameraAnimationPhase = 'idle';

  private _target: { x: number; y: number; zoom: number } = { x: 0, y: 0, zoom: 1.0 };
  private _from: { x: number; y: number; zoom: number } = { x: 0, y: 0, zoom: 1.0 };
  private _springT: number = 0;  // время с начала текущего перехода
  private _phaseTimer: number = 0;
  private _phaseDuration: number = 0;

  /** Текущая цель камеры (публичный getter для совместимости). */
  get target(): { x: number; y: number; zoom: number } | null {
    return this.phase === 'idle' ? null : { ...this._target };
  }

  /** Навести камеру на цель — запустить цепочку lead_in → engaged. */
  focusOn(x: number, y: number): void {
    this._beginTransition({ x, y, zoom: ZOOM_ENGAGEMENT }, LEAD_IN_MS / 1000, 'lead_in');
  }

  /** Сбросить камеру в стратегический обзор. */
  resetZoom(): void {
    this._beginTransition(
      { x: this.state.x, y: this.state.y, zoom: ZOOM_MIN },
      ZOOM_OUT_MS / 1000,
      'zoom_out',
    );
  }

  private _beginTransition(
    target: { x: number; y: number; zoom: number },
    durationS: number,
    phase: CameraAnimationPhase,
  ): void {
    this._from = { ...this.state };
    this._target = { ...target };
    this._springT = 0;
    this._phaseTimer = durationS;
    this._phaseDuration = durationS;
    this.phase = phase;
  }

  /** Один шаг симуляции. dt в секундах. */
  step(dt: number): CameraState {
    this._springT += dt;
    const t = this._springT;

    this.state.x = criticallyDamped(this._from.x, this._target.x, t, OMEGA0);
    this.state.y = criticallyDamped(this._from.y, this._target.y, t, OMEGA0);
    this.state.zoom = clampZoom(criticallyDamped(this._from.zoom, this._target.zoom, t, OMEGA0));

    // Фазовый автомат
    if (this._phaseTimer > 0) {
      this._phaseTimer = Math.max(0, this._phaseTimer - dt);
      if (this._phaseTimer <= 0) {
        if (this.phase === 'lead_in') {
          this.phase = 'engaged';
        } else if (this.phase === 'zoom_out') {
          this.phase = 'idle';
        }
      }
    }

    return this.state;
  }

  /** Применить состояние камеры к Canvas transform. */
  applyToCanvas(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
    const s = this.state;
    ctx.save();
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.scale(s.zoom, s.zoom);
    ctx.translate(-s.x, -s.y);
  }

  restoreCanvas(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }
}

function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}