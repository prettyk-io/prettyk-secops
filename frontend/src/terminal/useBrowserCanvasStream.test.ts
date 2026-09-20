import { describe, it, expect } from 'vitest';
import { computeFittedCanvasSize } from './useBrowserCanvasStream';

describe('BBA-FE-1: computeFittedCanvasSize (responsive aspect-fit)', () => {
  it('same aspect → fills container exactly (no bars, no distortion)', () => {
    const r = computeFittedCanvasSize(1280, 800, 1280, 800)!;
    expect(r.width).toBe(1280);
    expect(r.height).toBe(800);
  });

  it('wider container → height-limited, fills height, horizontal letterbox', () => {
    // frame 1280×800 (1.6), container 1600×800 (2.0)
    const r = computeFittedCanvasSize(1600, 800, 1280, 800)!;
    expect(r.width).toBe(1280);
    expect(r.height).toBe(800);
  });

  it('taller container → width-limited, fills width, vertical letterbox', () => {
    // frame 1280×800 (1.6), container 1280×1600 (0.8)
    const r = computeFittedCanvasSize(1280, 1600, 1280, 800)!;
    expect(r.width).toBe(1280);
    expect(r.height).toBe(800);
  });

  it('downscale keeps aspect when frame is larger than container', () => {
    const r = computeFittedCanvasSize(640, 400, 1280, 800)!;
    expect(r.width).toBe(640);
    expect(r.height).toBe(400);
  });

  it('resize: same frame re-fits to a larger container (no stale size)', () => {
    const small = computeFittedCanvasSize(960, 600, 1280, 800)!;
    const large = computeFittedCanvasSize(1920, 1200, 1280, 800)!;
    expect(small.width).toBe(960);
    expect(small.height).toBe(600);
    expect(large.width).toBe(1920);
    expect(large.height).toBe(1200);
    expect(large.width / large.height).toBeCloseTo(1280 / 800, 5);
  });

  it('zero sizes → null', () => {
    expect(computeFittedCanvasSize(0, 800, 1280, 800)).toBeNull();
    expect(computeFittedCanvasSize(640, 400, 0, 800)).toBeNull();
    expect(computeFittedCanvasSize(640, 400, 1280, 0)).toBeNull();
  });
});
