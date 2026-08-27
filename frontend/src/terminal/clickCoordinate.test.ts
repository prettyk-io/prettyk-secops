// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  computeViewportCoords,
  computeViewportCoordsFromEvent,
} from './clickCoordinate';

describe('HDO-F1: computeViewportCoords (letterboxing math)', () => {
  const viewport = { naturalW: 1280, naturalH: 800 };

  it('centre click maps to centre of viewport', () => {
    const containerW = 640;  // exactly half
    const containerH = 400;  // exactly half
    const p = computeViewportCoords(
      { ...viewport, containerW, containerH },
      320, // centre X
      200, // centre Y
    );
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(640, 0);
    expect(p!.y).toBeCloseTo(400, 0);
  });

  it('top-left click maps to top-left of viewport', () => {
    const containerW = 640;
    const containerH = 400;
    const p = computeViewportCoords(
      { ...viewport, containerW, containerH },
      0,
      0,
    );
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(0, 0);
    expect(p!.y).toBeCloseTo(0, 0);
  });

  it('bottom-right click maps to bottom-right of viewport', () => {
    const containerW = 640;
    const containerH = 400;
    const p = computeViewportCoords(
      { ...viewport, containerW, containerH },
      640,
      400,
    );
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(1280, 0);
    expect(p!.y).toBeCloseTo(800, 0);
  });

  it('click in letterbox area returns null (horizontal bars)', () => {
    // Container is wider than image aspect → horizontal letterbox
    const containerW = 1280;
    const containerH = 600; // scale = min(1, 0.75) = 0.75 → displayH = 800*0.75 = 600, displayW = 1280*0.75 = 960
    // offsetY = (600 - 600) / 2 = 0, offsetX = (1280 - 960) / 2 = 160

    // Click in left letterbox
    const p = computeViewportCoords(
      { ...viewport, containerW, containerH },
      80, // less than offsetX=160
      300,
    );
    expect(p).toBeNull();
  });

  it('click in letterbox area returns null (vertical bars)', () => {
    // Container is taller than image aspect → vertical letterbox
    const containerW = 800;
    const containerH = 800; // scale = min(0.625, 1) = 0.625 → displayW = 1280*0.625 = 800, displayH = 800*0.625 = 500
    // offsetX = (800 - 800) / 2 = 0, offsetY = (800 - 500) / 2 = 150

    // Click in top letterbox
    const p = computeViewportCoords(
      { ...viewport, containerW, containerH },
      400,
      50, // less than offsetY=150
    );
    expect(p).toBeNull();
  });

  it('zero dimensions → null', () => {
    expect(computeViewportCoords({ naturalW: 0, naturalH: 800, containerW: 640, containerH: 400 }, 320, 200)).toBeNull();
    expect(computeViewportCoords({ naturalW: 1280, naturalH: 0, containerW: 640, containerH: 400 }, 320, 200)).toBeNull();
    expect(computeViewportCoords({ naturalW: 1280, naturalH: 800, containerW: 0, containerH: 400 }, 320, 200)).toBeNull();
  });

  it('exact 1:1 container → no offsets, direct mapping', () => {
    const p = computeViewportCoords(
      { naturalW: 1280, naturalH: 800, containerW: 1280, containerH: 800 },
      500,
      300,
    );
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(500, 1);
    expect(p!.y).toBeCloseTo(300, 1);
  });

  it('wider container → horizontal letterbox, skewed aspect works', () => {
    // naturalW=1920 naturalH=1080 containerW=960 containerH=540
    const p = computeViewportCoords(
      { naturalW: 1920, naturalH: 1080, containerW: 960, containerH: 540 },
      480, // centre X
      270, // centre Y
    );
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(960, 0);
    expect(p!.y).toBeCloseTo(540, 0);
  });
});

describe('HDO-F1: computeViewportCoordsFromEvent (DOM integration)', () => {
  it('translates click from DOM event to viewport', () => {
    const img = { naturalWidth: 1280, naturalHeight: 800, getBoundingClientRect: () => ({ left: 100, top: 50, width: 640, height: 400, right: 740, bottom: 450, x: 100, y: 50, toJSON: () => ({}) }) } as unknown as HTMLImageElement;
    const clientX = 420; // 100 + 320 = centre of img
    const clientY = 250; // 50 + 200 = centre of img
    const p = computeViewportCoordsFromEvent(img, clientX, clientY);
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(640, 0);
    expect(p!.y).toBeCloseTo(400, 0);
  });
});