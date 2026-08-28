/**
 * WZ-7: Timeline Scrubber — маркеры, двухступенчатый рендеринг (Canvas rAF, видео/логи квант 60ms).
 *
 * Спецификация §4.2:
 *   - Каждый rAF: Canvas боевой зоны, конвейера и таймера.
 *   - Видео и тяжёлые логи: квант 60ms.
 *   - Маркеры: STEP, FUZZ_BEAM, PAYLOAD_HIT, WARN, ERROR — на таймлайне.
 */

export type MarkerKind = 'STEP' | 'FUZZ_BEAM' | 'PAYLOAD_HIT' | 'WARN' | 'ERROR';

export interface TimelineMarker {
  t: number;           // относительное время (сек от старта)
  kind: MarkerKind;
  label: string;       // короткая подпись
  color: string;       // CSS-цвет
}

/** Данные одного прогона для скраббера. */
export interface RunTimeline {
  runId: string;
  durationS: number;       // полная длительность (сек)
  markers: TimelineMarker[];
}

const MARKER_COLORS: Record<MarkerKind, string> = {
  STEP: '#38bdf8',       // cyan
  FUZZ_BEAM: '#f43f5e',  // red
  PAYLOAD_HIT: '#f59e0b',// amber
  WARN: '#f59e0b',
  ERROR: '#ef4444',
};

const QUANTUM_VIDEO_MS = 60;  // квант для видео/тяжёлых логов

/**
 * Двухступенчатый рендеринг: решает — нужно ли обновлять видео в этом кадре.
 *
 * rAF-кадры (каждый кадр): Canvas боевой зоны, таймер, ползунок.
 * Видео/логи: только раз в QUANTUM_VIDEO_MS (60ms).
 */
export class TimelineController {
  timeline: RunTimeline;
  private _currentT: number = 0;    // текущая позиция (сек)
  private _playing: boolean = false;
  private _playRate: number = 1.0;
  private _lastVideoUpdate: number = 0;
  private _onSeek: ((t: number) => void) | null = null;
  private _onVideoUpdate: ((t: number) => void) | null = null;

  constructor(timeline: RunTimeline) {
    this.timeline = timeline;
  }

  get currentT(): number { return this._currentT; }
  get playing(): boolean { return this._playing; }
  get durationS(): number { return this.timeline.durationS; }

  /** Установить колбэк при перемотке. */
  onSeek(cb: (t: number) => void): void { this._onSeek = cb; }
  /** Колбэк для обновления видео (квантованный). */
  onVideoUpdate(cb: (t: number) => void): void { this._onVideoUpdate = cb; }

  /** Перемотать на позицию t (сек). */
  seek(t: number): void {
    this._currentT = Math.max(0, Math.min(t, this.timeline.durationS));
    this._onSeek?.(this._currentT);
  }

  /** Play / Pause. */
  togglePlay(): void {
    this._playing = !this._playing;
  }

  /** Остановить и сбросить в начало. */
  stop(): void {
    this._playing = false;
    this._currentT = 0;
    this._onSeek?.(0);
  }

  /** Один шаг симуляции (вызывается из rAF). dt в секундах. */
  step(dt: number): boolean {
    if (!this._playing) return false;

    this._currentT = Math.min(this._currentT + dt * this._playRate, this.timeline.durationS);
    this._onSeek?.(this._currentT);

    // Квант для видео (раз в 60ms)
    const now = performance.now();
    if (now - this._lastVideoUpdate >= QUANTUM_VIDEO_MS) {
      this._lastVideoUpdate = now;
      this._onVideoUpdate?.(this._currentT);
      return true;  // видео обновлено
    }
    return false;
  }

  /** Маркеры до времени t (включительно). */
  markersUpTo(t: number): TimelineMarker[] {
    return this.timeline.markers.filter(m => m.t <= t);
  }

  /** Ближайший маркер к позиции t. */
  nearestMarker(t: number): TimelineMarker | null {
    const upTo = this.markersUpTo(t);
    return upTo.length > 0 ? upTo[upTo.length - 1]! : null;
  }

  /** Прогресс 0..1 для ползунка. */
  get progress(): number {
    return this.durationS > 0 ? this._currentT / this.durationS : 0;
  }
}

/**
 * Отрендерить маркеры на Canvas (линия таймлайна).
 */
export function renderMarkers(
  ctx: CanvasRenderingContext2D,
  markers: TimelineMarker[],
  width: number,
  height: number,
  durationS: number,
): void {
  if (durationS <= 0) return;

  ctx.save();
  const barY = height / 2;
  for (const m of markers) {
    const x = (m.t / durationS) * width;
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(x, barY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Подпись (первые 2 символа + линия вниз)
    ctx.fillStyle = m.color + '88';
    ctx.font = '8px monospace';
    ctx.fillText(m.label.slice(0, 4), x - 10, barY + 14);
  }
  ctx.restore();
}