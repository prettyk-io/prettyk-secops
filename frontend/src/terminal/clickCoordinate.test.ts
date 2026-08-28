// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { computeCanvasClickToViewport } from './clickCoordinate';

describe('VP-F1: computeCanvasClickToViewport (canvas coordinate mapping)', () => {
  function fakeCanvas(clientWidth: number, clientHeight: number, rect: DOMRect): HTMLCanvasElement {
    const c = { getBoundingClientRect: () => rect, clientWidth, clientHeight } as unknown as HTMLCanvasElement;
    return c;
  }

  const rect: DOMRect = { left: 100, top: 50, width: 640, height: 400, right: 740, bottom: 450, x: 100, y: 50, toJSON: () => ({}) };

  it('centr экрана → centr viewport (1280×800)', () => {
    const canvas = fakeCanvas(640, 400, rect);
    // Click at canvas centre = (100+320, 50+200) = (420, 250)
    const p = computeCanvasClickToViewport(canvas, 1280, 800, 420, 250);
    expect(p).not.toBeNull();
    expect(p!.x).toBe(640);
    expect(p!.y).toBe(400);
  });

  it('scaleX = frameWidth / canvasWidth', () => {
    const canvas = fakeCanvas(320, 200, { left: 0, top: 0, width: 320, height: 200, right: 320, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    // frameWidth=1280, canvasWidth=320 → scaleX=4, scaleY=4
    const p = computeCanvasClickToViewport(canvas, 1280, 800, 160, 100);
    expect(p).not.toBeNull();
    expect(p!.x).toBe(640);
    expect(p!.y).toBe(400);
  });

  it('клик за пределами canvas → null', () => {
    const canvas = fakeCanvas(640, 400, rect);
    expect(computeCanvasClickToViewport(canvas, 1280, 800, 50, 300)).toBeNull(); // left of canvas
    expect(computeCanvasClickToViewport(canvas, 1280, 800, 800, 300)).toBeNull(); // right of canvas
  });

  it('frameWidth=0 / frameHeight=0 → null', () => {
    const canvas = fakeCanvas(640, 400, rect);
    expect(computeCanvasClickToViewport(canvas, 0, 800, 420, 250)).toBeNull();
    expect(computeCanvasClickToViewport(canvas, 1280, 0, 420, 250)).toBeNull();
  });

  it('rect.width=0 → null', () => {
    const canvas = { getBoundingClientRect: () => ({ ...rect, width: 0 }), clientWidth: 0, clientHeight: 0 } as unknown as HTMLCanvasElement;
    expect(computeCanvasClickToViewport(canvas, 1280, 800, 420, 250)).toBeNull();
  });
});