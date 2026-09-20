// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { computeCanvasClickToViewport, computeFittedContentRect } from './clickCoordinate';

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

describe('BBA-2: computeFittedContentRect (letterboxing)', () => {
  it('same aspect → content fills container, no letterbox', () => {
    const r = computeFittedContentRect(640, 400, 1280, 800)!;
    expect(r.left).toBe(0);
    expect(r.top).toBe(0);
    expect(r.width).toBe(640);
    expect(r.height).toBe(400);
  });

  it('wider container → horizontal letterbox with vertical centering', () => {
    // content 800×800 (square), container 1600×800 → scaled to 800×800, left offset 400
    const r = computeFittedContentRect(1600, 800, 800, 800)!;
    expect(r.width).toBe(800);
    expect(r.height).toBe(800);
    expect(r.left).toBe(400);
    expect(r.top).toBe(0);
  });

  it('taller container → vertical letterbox with horizontal centering', () => {
    // content 1280×800, container 1280×1600 → scaled to 1280×800, top offset 400
    const r = computeFittedContentRect(1280, 1600, 1280, 800)!;
    expect(r.width).toBe(1280);
    expect(r.height).toBe(800);
    expect(r.left).toBe(0);
    expect(r.top).toBe(400);
  });

  it('zero sizes → null', () => {
    expect(computeFittedContentRect(0, 400, 1280, 800)).toBeNull();
    expect(computeFittedContentRect(640, 400, 0, 800)).toBeNull();
  });
});

describe('BBA-2: computeCanvasClickToViewport letterbox mapping', () => {
  function fakeCanvas(rect: DOMRect): HTMLCanvasElement {
    return { getBoundingClientRect: () => rect, clientWidth: rect.width, clientHeight: rect.height } as unknown as HTMLCanvasElement;
  }

  it('maps viewport center through letterboxed canvas (horizontal bars)', () => {
    // content 800×800 drawn into 1600×800 container → fitted 800×800 at left=400
    const canvas = fakeCanvas({ left: 0, top: 0, width: 1600, height: 800, right: 1600, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
    // Click at visual center of the drawn content (400 + 400, 400) = (800, 400)
    const p = computeCanvasClickToViewport(canvas, 800, 800, 800, 400);
    expect(p!.x).toBe(400);
    expect(p!.y).toBe(400);
  });

  it('click in letterbox bar → null (outside drawn content)', () => {
    // horizontal bar on the left (x < 400) has no content
    const canvas = fakeCanvas({ left: 0, top: 0, width: 1600, height: 800, right: 1600, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
    const p = computeCanvasClickToViewport(canvas, 800, 800, 100, 400);
    expect(p).toBeNull();
  });
});