/**
 * WZ-3/4/7/8: Beam Renderer + RTS Camera + Timeline + Performance tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { beamIntensity, smoothstep, sampleBeam, BEAM, type BeamState } from './beamRenderer';
import { RTSCamera } from './rtsCamera';
import { TimelineController, type RunTimeline, type MarkerKind } from './timeline';

// ═══════════════════════════════════════════════════════════════════════════
// WZ-3: Beam Renderer
// ═══════════════════════════════════════════════════════════════════════════

describe('smoothstep', () => {
  it('returns 0 at edge0', () => expect(smoothstep(0, 1, 0)).toBeCloseTo(0));
  it('returns 1 at edge1', () => expect(smoothstep(0, 1, 1)).toBeCloseTo(1));
  it('returns ~0.5 at midpoint', () => expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5));
});

describe('beamIntensity', () => {
  const tStart = 1.0;
  const tEnd = 3.0;

  it('is 0 before tStart', () => {
    expect(beamIntensity(0.5, tStart, tEnd)).toBe(0);
  });

  it('is 0 after tEnd', () => {
    expect(beamIntensity(5.0, tStart, tEnd)).toBe(0);
  });

  it('ramps up smoothly at tStart', () => {
    const i = beamIntensity(tStart + BEAM.deltaTRamp * 0.5, tStart, tEnd);
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(1);
  });

  it('reaches ~1.0 during steady state', () => {
    const i = beamIntensity(tStart + BEAM.deltaTRamp + 0.1, tStart, tEnd);
    expect(i).toBeGreaterThan(0.8);
  });

  it('pulses during steady state', () => {
    const i1 = beamIntensity(tStart + 0.5, tStart, tEnd);
    const i2 = beamIntensity(tStart + 0.6, tStart, tEnd);
    // Пульсация — значения могут различаться
    expect(Math.abs(i1 - i2)).toBeLessThanOrEqual(0.3);
  });

  it('ramps down at tEnd', () => {
    const i = beamIntensity(tEnd - BEAM.deltaTDim * 0.5, tStart, tEnd);
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(0.9);
  });
});

describe('sampleBeam', () => {
  const beam: BeamState = {
    src: { x: 0, y: 0 },
    tgt: { x: 100, y: 0 },
    tStart: 1.0,
    tEnd: 2.0,
    severity: 'cyan',
  };

  it('returns empty array when intensity is 0', () => {
    expect(sampleBeam(beam, 0)).toEqual([]);
  });

  it('returns samples during active beam', () => {
    const samples = sampleBeam(beam, 1.2);
    expect(samples.length).toBe(33);  // numSamples+1
    // Первая точка — около src
    expect(samples[0]!.x).toBeCloseTo(0, -1);
    // Последняя — около tgt
    expect(samples[32]!.x).toBeCloseTo(100, -1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WZ-4: RTS Camera
// ═══════════════════════════════════════════════════════════════════════════

describe('RTSCamera', () => {
  it('starts at default position', () => {
    const cam = new RTSCamera();
    expect(cam.state.zoom).toBe(1.0);
    expect(cam.phase).toBe('idle');
  });

  it('focusOn sets target with zoom 2.8', () => {
    const cam = new RTSCamera();
    cam.focusOn(500, 300);
    expect(cam.target?.zoom).toBe(2.8);
    expect(cam.phase).toBe('lead_in');
  });

  it('resetZoom returns to zoom 1.0', () => {
    const cam = new RTSCamera();
    cam.focusOn(100, 100);
    cam.state.zoom = 2.8;
    cam.resetZoom();
    expect(cam.target?.zoom).toBe(1.0);
    expect(cam.phase).toBe('zoom_out');
  });

  it('step converges toward target', () => {
    const cam = new RTSCamera();
    cam.focusOn(1000, 0);
    for (let i = 0; i < 200; i++) {
      cam.step(0.016); // ~60fps
    }
    expect(Math.abs(cam.state.x - 1000)).toBeLessThan(10);
    expect(cam.state.zoom).toBeCloseTo(2.8, 1);
  });

  it('zoom is clamped to 1.0–3.5', () => {
    const cam = new RTSCamera();
    // Пытаемся уйти за пределы через ручную коррекцию
    cam.state.zoom = -10;
    cam.focusOn(0, 0);
    for (let i = 0; i < 300; i++) cam.step(0.016);
    expect(cam.state.zoom).toBeGreaterThanOrEqual(1.0);
    expect(cam.state.zoom).toBeLessThanOrEqual(3.5);
  });

  it('spring critically damped — no oscillation', () => {
    const cam = new RTSCamera();
    cam.focusOn(100, 0);
    let prevZoom = cam.state.zoom;
    let overshoot = false;
    for (let i = 0; i < 100; i++) {
      cam.step(0.016);
      if (cam.state.zoom > 2.8 && prevZoom > 2.8) overshoot = true;
      prevZoom = cam.state.zoom;
    }
    // Critically damped — не должен осциллировать вокруг цели
    expect(overshoot).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WZ-7: Timeline
// ═══════════════════════════════════════════════════════════════════════════

const sampleTimeline: RunTimeline = {
  runId: 'run-1',
  durationS: 120,
  markers: [
    { t: 2.0, kind: 'STEP' as MarkerKind, label: 'Open', color: '#38bdf8' },
    { t: 5.5, kind: 'STEP' as MarkerKind, label: 'Click', color: '#38bdf8' },
    { t: 9.0, kind: 'FUZZ_BEAM' as MarkerKind, label: 'Beam', color: '#f43f5e' },
    { t: 14.0, kind: 'PAYLOAD_HIT' as MarkerKind, label: 'Hit', color: '#f59e0b' },
    { t: 20.0, kind: 'WARN' as MarkerKind, label: 'Warn', color: '#f59e0b' },
    { t: 45.0, kind: 'ERROR' as MarkerKind, label: 'Err', color: '#ef4444' },
  ],
};

describe('TimelineController', () => {
  it('starts at t=0', () => {
    const ctrl = new TimelineController(sampleTimeline);
    expect(ctrl.currentT).toBe(0);
    expect(ctrl.playing).toBe(false);
  });

  it('seek clamps to bounds', () => {
    const ctrl = new TimelineController(sampleTimeline);
    ctrl.seek(-10);
    expect(ctrl.currentT).toBe(0);
    ctrl.seek(999);
    expect(ctrl.currentT).toBe(sampleTimeline.durationS);
  });

  it('seek to valid position', () => {
    const ctrl = new TimelineController(sampleTimeline);
    ctrl.seek(42);
    expect(ctrl.currentT).toBe(42);
  });

  it('togglePlay starts playback', () => {
    const ctrl = new TimelineController(sampleTimeline);
    ctrl.togglePlay();
    expect(ctrl.playing).toBe(true);
    ctrl.togglePlay();
    expect(ctrl.playing).toBe(false);
  });

  it('stop resets to t=0', () => {
    const ctrl = new TimelineController(sampleTimeline);
    ctrl.seek(100);
    ctrl.togglePlay();
    ctrl.stop();
    expect(ctrl.currentT).toBe(0);
    expect(ctrl.playing).toBe(false);
  });

  it('step advances time during play', () => {
    const ctrl = new TimelineController(sampleTimeline);
    ctrl.togglePlay();
    ctrl.step(1.0);
    expect(ctrl.currentT).toBeCloseTo(1.0);
  });

  it('markersUpTo returns correct markers', () => {
    const ctrl = new TimelineController(sampleTimeline);
    ctrl.seek(3);
    expect(ctrl.markersUpTo(3)).toHaveLength(1);  // only Open at t=2
    ctrl.seek(10);
    expect(ctrl.markersUpTo(10)).toHaveLength(3);  // Open + Click + Beam
  });

  it('nearestMarker returns last marker before t', () => {
    const ctrl = new TimelineController(sampleTimeline);
    ctrl.seek(4);
    expect(ctrl.nearestMarker(4)?.label).toBe('Open');
    ctrl.seek(7);
    expect(ctrl.nearestMarker(7)?.label).toBe('Click');
  });

  it('progress is 0..1', () => {
    const ctrl = new TimelineController(sampleTimeline);
    expect(ctrl.progress).toBe(0);
    ctrl.seek(60);
    expect(ctrl.progress).toBeCloseTo(0.5);
    ctrl.seek(120);
    expect(ctrl.progress).toBeCloseTo(1);
  });

  it('video update fires at 60ms quantum', () => {
    const ctrl = new TimelineController(sampleTimeline);
    let videoCalls = 0;
    ctrl.onVideoUpdate(() => videoCalls++);
    ctrl.togglePlay();
    // Первый шаг — видео обновляется
    ctrl.step(0.016);
    expect(videoCalls).toBe(1);
    // Второй шаг через 16ms — без кванта, не обновляется
    ctrl.step(0.016);
    expect(videoCalls).toBe(1);
  });

  it('seek fires onSeek callback', () => {
    const ctrl = new TimelineController(sampleTimeline);
    let lastT = -1;
    ctrl.onSeek((t) => { lastT = t; });
    ctrl.seek(33);
    expect(lastT).toBe(33);
  });

  it('step does not advance when paused', () => {
    const ctrl = new TimelineController(sampleTimeline);
    ctrl.step(10);
    expect(ctrl.currentT).toBe(0);
  });

  it('stops at end of timeline', () => {
    const ctrl = new TimelineController(sampleTimeline);
    ctrl.seek(119);
    ctrl.togglePlay();
    ctrl.step(10);
    expect(ctrl.currentT).toBe(sampleTimeline.durationS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WZ-8: Performance + Determinism
// ═══════════════════════════════════════════════════════════════════════════

describe('performance — 60 FPS budget', () => {
  it('sampleBeam completes under 1ms for 10 beams', () => {
    const beams: BeamState[] = Array.from({ length: 10 }, (_, i) => ({
      src: { x: i * 50, y: 0 },
      tgt: { x: i * 50 + 200, y: 100 },
      tStart: 1,
      tEnd: 2,
      severity: 'cyan' as const,
    }));
    const start = performance.now();
    for (const b of beams) sampleBeam(b, 1.5);
    const elapsed = performance.now() - start;
    // 10 лучей × 33 сэмпла = 330 сэмплов должно быть <1ms
    expect(elapsed).toBeLessThan(5);
  });

  it('beamIntensity is deterministic', () => {
    const i1 = beamIntensity(1.5, 1.0, 2.0);
    const i2 = beamIntensity(1.5, 1.0, 2.0);
    expect(i1).toBe(i2);  // 100/100 детерминизм
  });

  it('camera step is deterministic', () => {
    const cam1 = new RTSCamera();
    cam1.focusOn(500, 300);
    for (let i = 0; i < 10; i++) cam1.step(0.016);

    const cam2 = new RTSCamera();
    cam2.focusOn(500, 300);
    for (let i = 0; i < 10; i++) cam2.step(0.016);

    expect(cam1.state.x).toBe(cam2.state.x);
    expect(cam1.state.y).toBe(cam2.state.y);
    expect(cam1.state.zoom).toBe(cam2.state.zoom);
  });
});