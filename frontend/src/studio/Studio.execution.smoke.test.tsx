// @vitest-environment jsdom
/**
 * Studio Execution Hub — F-7/F-9 camera + beam smoke tests.
 */
import { describe, expect, it } from 'vitest';
import { beamOpacity, beamColor, advanceBeam, DEFAULT_WARMUP_MS, DEFAULT_COOLING_MS } from './execution/canvas/BeamEngine';
import { RTSCAMERA, enqueueHitFocus, clearHitQueue, consumeHitTarget, fitAllTarget, applyCameraTransitionEased, type RtsState } from './execution/camera/RTSCamera';
import type { FuzzerBeam, SceneNode } from './execution/types';
import { WORLD_SIZE, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX } from './execution/types';

// ── F-7: BeamEngine dim curves ──

describe('BeamEngine (F-7 channeling stages)', () => {
  it('warmup starts at 0 and eases to 1', () => {
    const beam: FuzzerBeam = { id: 'b1', sourceId: 's', targetId: 't', status: 'warmup', progress: 0, stageStartedMs: 0, context: 'normal', warmupMs: 400, coolingMs: 250 };
    expect(beamOpacity(beam)).toBe(0);
    const mid = advanceBeam(beam, 200);
    expect(mid.progress!).toBeGreaterThan(0.4);
    expect(mid.progress!).toBeLessThan(0.6);
  });

  it('active is full opacity', () => {
    const beam: FuzzerBeam = { id: 'b1', sourceId: 's', targetId: 't', status: 'active', progress: 1, stageStartedMs: 0, context: 'normal' };
    expect(beamOpacity(beam)).toBe(1);
  });

  it('cooling eases to 0', () => {
    const beam: FuzzerBeam = { id: 'b1', sourceId: 's', targetId: 't', status: 'cooling', progress: 0, stageStartedMs: 0, context: 'normal', coolingMs: 250 };
    expect(beamOpacity(beam)).toBe(1);
    const mid = advanceBeam(beam, 125);
    const merged: FuzzerBeam = { ...beam, ...mid };
    expect(beamOpacity(merged)).toBeLessThan(0.8);
    const end = advanceBeam(merged, 150);
    expect(end.status).toBe('dead');
  });

  it('dead is zero opacity', () => {
    const beam: FuzzerBeam = { id: 'b1', sourceId: 's', targetId: 't', status: 'dead', progress: 1, stageStartedMs: 0, context: 'normal' };
    expect(beamOpacity(beam)).toBe(0);
  });

  it('beamColor: normal = cyan, critical = red', () => {
    expect(beamColor('normal')).toBe('#38bdf8');
    expect(beamColor('critical')).toBe('#ef4444');
  });

  it('advanceBeam transitions warmup → active → cooling → dead', () => {
    let beam: FuzzerBeam = { id: 'b1', sourceId: 's', targetId: 't', status: 'warmup', progress: 0, stageStartedMs: 0, context: 'normal', warmupMs: 400, coolingMs: 250 };
    beam = { ...beam, ...advanceBeam(beam, 410) };
    expect(beam.status).toBe('active');
    beam = { ...beam, status: 'cooling', progress: 0, stageStartedMs: Date.now(), coolingMs: 250 };
    beam = { ...beam, ...advanceBeam(beam, 260) };
    expect(beam.status).toBe('dead');
  });
});

// ── F-9: Camera ──

describe('RTS Camera (F-9 hit focus)', () => {
  it('enqueueHitFocus queues a target', () => {
    clearHitQueue();
    enqueueHitFocus(200, 300);
    const t = consumeHitTarget(Date.now());
    expect(t).not.toBeNull();
    expect(t!.cx).toBe(200);
    expect(t!.cy).toBe(300);
    expect(t!.zoom).toBe(3.5);
  });

  it('consecutive hits within merge window replace last', () => {
    clearHitQueue();
    enqueueHitFocus(100, 100);
    enqueueHitFocus(200, 200);
    const t = consumeHitTarget(Date.now());
    expect(t!.cx).toBe(200);
  });

  it('fitAllTarget returns center of nodes', () => {
    const nodes: { x: number; y: number }[] = [
      { x: 100, y: 100 }, { x: 300, y: 300 },
    ];
    const t = fitAllTarget(nodes);
    expect(t.cx).toBe(200);
    expect(t.cy).toBe(200);
    expect(t.zoom).toBe(1.0);
  });

  it('applyCameraTransitionEased moves toward target', () => {
    const c: RtsState = { cx: 500, cy: 500, zoom: 1 };
    applyCameraTransitionEased(c, { cx: 300, cy: 300, zoom: 2.8 }, 600, 16);
    expect(c.cx).toBeLessThan(500);
    expect(c.zoom).toBeGreaterThan(1);
  });
});

// ── Types ──

describe('Execution types (F-8 scene graph)', () => {
  it('SceneNode accepts all kinds', () => {
    const n: SceneNode = { id: 'p1', label: 'Login', kind: 'page_model', x: 200, y: 300, status: 'idle', health: 1 };
    expect(n.kind).toBe('page_model');
    expect(n.status).toBe('idle');
  });
});