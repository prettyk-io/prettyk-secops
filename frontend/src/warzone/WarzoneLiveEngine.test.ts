/**
 * WZ-LIVE-RENDER: тесты живого движка — beam сигмоида + камера пружина.
 * Движок принимает (t, targetIds[]) — устойчив к флуктуации контракта WIRE-WZ.
 */
import { describe, it, expect } from 'vitest';
import { WarzoneLiveEngine, sceneToTargets } from './WarzoneLiveEngine';
import { beamIntensity } from './beamRenderer';

describe('sceneToTargets — адаптер устойчив к формам контракта', () => {
  it('принимает string[] (старая форма)', () => {
    const r = sceneToTargets({ t: 1.5, active_beams: ['web', 'api'] });
    expect(r.t).toBe(1.5);
    expect(r.targetIds).toEqual(['web', 'api']);
  });

  it('принимает BeamView[] (новая форма)', () => {
    const r = sceneToTargets({
      t: 2.0,
      active_beams: [
        { id: 'b1', source: 'src', target: 'web', intensity: 1 },
        { id: 'b2', source: 'src', target: 'db', intensity: 0.5 },
      ],
    });
    expect(r.t).toBe(2.0);
    expect(r.targetIds).toEqual(['web', 'db']);
  });

  it('пустой/невалидный ввод → пустой список', () => {
    expect(sceneToTargets(null).targetIds).toEqual([]);
    expect(sceneToTargets(undefined).targetIds).toEqual([]);
    expect(sceneToTargets({ t: 1 }).targetIds).toEqual([]);
  });
});

describe('WarzoneLiveEngine — beam загорается и гаснет по сигмоиде', () => {
  it('beam заводится при появлении в targetIds', () => {
    const engine = new WarzoneLiveEngine();
    engine.registerNode({ id: 'src', x: 0, y: 0 });
    engine.registerNode({ id: 'web', x: 100, y: 100 });

    engine.updateScene(1.0, ['web']);
    expect(engine.trackedBeamCount).toBe(1);
    const b = engine.allBeams()[0]!;
    expect(b.tStart).toBeCloseTo(1.0);
    expect(beamIntensity(1.0, b.tStart, b.tEnd)).toBe(0);   // ровно на tStart
    expect(beamIntensity(1.05, b.tStart, b.tEnd)).toBeGreaterThan(0);  // ramp
  });

  it('scrub влево (t уменьшается) → луч плавно гаснет, не обрывается', () => {
    const engine = new WarzoneLiveEngine();
    engine.registerNode({ id: 'src', x: 0, y: 0 });
    engine.registerNode({ id: 'web', x: 100, y: 100 });

    engine.updateScene(2.0, ['web']);
    const b = engine.allBeams()[0]!;

    engine.scrubTo(2.5);
    const full = engine.beamIntensityAt(b);
    engine.scrubTo(2.05);
    const dimmed = engine.beamIntensityAt(b);

    expect(dimmed).toBeLessThan(full);
    engine.scrubTo(1.0);
    expect(engine.beamIntensityAt(b)).toBe(0);
  });

  it('детерминизм: скраб туда-обратно даёт одинаковую интенсивность', () => {
    const engine = new WarzoneLiveEngine();
    engine.registerNode({ id: 'src', x: 0, y: 0 });
    engine.registerNode({ id: 'web', x: 100, y: 100 });

    engine.updateScene(2.0, ['web']);
    const b = engine.allBeams()[0]!;

    engine.scrubTo(2.5);
    const i1 = engine.beamIntensityAt(b);
    engine.scrubTo(1.5);
    engine.scrubTo(2.5);
    const i2 = engine.beamIntensityAt(b);
    expect(i1).toBe(i2);  // 100/100
  });
});

describe('WarzoneLiveEngine — камера без рывков', () => {
  it('камера focusOn при новом beam, замкнутая пружина без overshoot', () => {
    const engine = new WarzoneLiveEngine();
    engine.registerNode({ id: 'src', x: 0, y: 0 });
    engine.registerNode({ id: 'web', x: 1000, y: 0 });

    engine.updateScene(1.0, ['web']);
    expect(engine.camera.phase).toBe('lead_in');

    let prevZoom = engine.camera.state.zoom;
    let overshoot = false;
    for (let i = 0; i < 200; i++) {
      engine.stepCamera(0.016);
      if (engine.camera.state.zoom > 2.8 && prevZoom > 2.8) overshoot = true;
      prevZoom = engine.camera.state.zoom;
    }
    expect(overshoot).toBe(false);
    expect(engine.camera.state.zoom).toBeCloseTo(2.8, 1);
  });

  it('камера сходится к цели (x/y)', () => {
    const engine = new WarzoneLiveEngine();
    engine.registerNode({ id: 'src', x: 0, y: 0 });
    engine.registerNode({ id: 'web', x: 500, y: 300 });

    engine.updateScene(1.0, ['web']);
    for (let i = 0; i < 200; i++) engine.stepCamera(0.016);

    expect(Math.abs(engine.camera.state.x - 500)).toBeLessThan(10);
    expect(Math.abs(engine.camera.state.y - 300)).toBeLessThan(10);
  });
});

describe('WarzoneLiveEngine — несколько лучей', () => {
  it('два луча изолированы по времени', () => {
    const engine = new WarzoneLiveEngine();
    engine.registerNode({ id: 'src', x: 0, y: 0 });
    engine.registerNode({ id: 'api', x: 100, y: 0 });
    engine.registerNode({ id: 'db', x: 200, y: 0 });

    engine.updateScene(1.0, ['api']);
    engine.updateScene(3.0, ['api', 'db']);
    expect(engine.trackedBeamCount).toBe(2);
  });

  it('повторный targetId не дублируется (идемпотентность)', () => {
    const engine = new WarzoneLiveEngine();
    engine.registerNode({ id: 'src', x: 0, y: 0 });
    engine.registerNode({ id: 'web', x: 100, y: 0 });

    engine.updateScene(1.0, ['web']);
    engine.updateScene(2.0, ['web']);
    expect(engine.trackedBeamCount).toBe(1);
  });
});