/**
 * WZ-LIVE-RENDER: Живой движок — связывает телеметрию с
 * beamRenderer (I(t) сигмоида) и rtsCamera (замкнутая пружина).
 *
 * Движок НЕ зависит от транспортного контракта WIRE-WZ (он флуктуирует,
 * пока Boss заводит SSE). Вход стабилен и минимален:
 *   updateScene(t, activeTargetIds)  — t + id узлов-целей активных лучей.
 *
 * Адаптация из конкретной формы SceneState → (t, targetIds) делается
 * тонкой обёрткой на стороне компонента (см. useWarZoneTelemetry → engine).
 *
 * Инвариант 100/100: рендер в любой момент t детерминирован —
 * beamIntensity(t) и камера пересчитываются чистой функцией от t.
 */
import {
  beamIntensity,
  renderBeam,
  type BeamState,
  type BeamEndpoint,
} from './beamRenderer';
import { RTSCamera } from './rtsCamera';

/** Максимальная длительность луча (сек) — пока SSE не дал явного tEnd. */
const BEAM_DEFAULT_DURATION = 3.0;

/** Ноды боевой зоны по id → мировые координаты (для камеры focusOn). */
export interface WarZoneNode {
  id: string;
  x: number;
  y: number;
}

interface TrackedBeam {
  beam: BeamState;
  targetNodeId: string;
}

export class WarzoneLiveEngine {
  camera: RTSCamera = new RTSCamera();
  nodes: Map<string, WarZoneNode> = new Map();
  private _beams: TrackedBeam[] = [];
  private _t: number = 0;
  private _knownBeamIds: Set<string> = new Set();

  /** Зарегистрировать узел боевой зоны (для focusOn при появлении луча). */
  registerNode(node: WarZoneNode): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Обновить сцену: t + id узлов-целей активных лучей.
   * При новом targetId — завести луч и навести камеру на цель.
   */
  updateScene(t: number, activeTargetIds: string[]): void {
    this._t = t;

    for (const targetId of activeTargetIds) {
      if (this._knownBeamIds.has(targetId)) continue; // уже заведён
      this._knownBeamIds.add(targetId);

      const target = this.nodes.get(targetId);
      if (!target) continue; // цель не на карте — пропускаем

      const source = this._firstNode();
      const src: BeamEndpoint = source ? { x: source.x, y: source.y } : { x: 0, y: 0 };
      const tgt: BeamEndpoint = { x: target.x, y: target.y };

      const beam: BeamState = {
        src,
        tgt,
        tStart: t,
        tEnd: t + BEAM_DEFAULT_DURATION,
        severity: 'cyan',
      };
      this._beams.push({ beam, targetNodeId: targetId });

      // Камера захватывает цель (Action Focus Director)
      this.camera.focusOn(tgt.x, tgt.y);
    }
  }

  /** Перемотать на t (scrub) — лучи пересчитываются по I(t). */
  scrubTo(t: number): void {
    this._t = t;
  }

  /** Текущее время. */
  get currentT(): number {
    return this._t;
  }

  /** Активные лучи (интенсивность > 0 в момент t). */
  activeBeams(): BeamState[] {
    return this._beams
      .filter((tb) => beamIntensity(this._t, tb.beam.tStart, tb.beam.tEnd) > 0.001)
      .map((tb) => tb.beam);
  }

  /** Все заведённые лучи (для тестов интенсивности и детерминизма). */
  allBeams(): BeamState[] {
    return this._beams.map((tb) => tb.beam);
  }

  /** Интенсивность луча в текущий момент t. */
  beamIntensityAt(beam: BeamState): number {
    return beamIntensity(this._t, beam.tStart, beam.tEnd);
  }

  /** Шаг камеры (для rAF-цикла). dt в секундах. */
  stepCamera(dt: number): void {
    this.camera.step(dt);
  }

  /** Отрендерить все активные лучи на Canvas. */
  render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
    this.camera.applyToCanvas(ctx, canvasW, canvasH);
    for (const tb of this._beams) {
      renderBeam(ctx, tb.beam, this._t);
    }
    this.camera.restoreCanvas(ctx);
  }

  /** Число известных лучей (для тестов детерминизма). */
  get trackedBeamCount(): number {
    return this._beams.length;
  }

  private _firstNode(): WarZoneNode | undefined {
    const it = this.nodes.values();
    return it.next().value as WarZoneNode | undefined;
  }
}

/**
 * Адаптер: вытащить (t, targetIds[]) из произвольной формы SceneState.
 * Устойчив к флуктуации контракта WIRE-WZ (string[] vs BeamView[]).
 */
export function sceneToTargets(scene: unknown): { t: number; targetIds: string[] } {
  const obj = (scene ?? {}) as Record<string, unknown>;
  const t = typeof obj.t === 'number' ? obj.t : 0;
  const raw = obj.active_beams;

  if (!Array.isArray(raw)) return { t, targetIds: [] };

  const targetIds: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      targetIds.push(item);
    } else if (item && typeof item === 'object') {
      const beam = item as Record<string, unknown>;
      // BeamView: { id, source, target, intensity } → цель это target
      if (typeof beam.target === 'string') targetIds.push(beam.target);
      else if (typeof beam.id === 'string') targetIds.push(beam.id);
    }
  }
  return { t, targetIds };
}