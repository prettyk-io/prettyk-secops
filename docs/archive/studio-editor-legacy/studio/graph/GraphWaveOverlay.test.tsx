/**
 * @vitest-environment jsdom
 * WR-TEST-1: GraphWaveOverlay — рендер, inverted, delayOffset, палитра Cyan/Violet/Magenta
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { GraphWaveOverlay } from './GraphWaveOverlay';
import { CORNER_IDS, cornerPoint, pointOnPerimeter, pointOnEdge, cornerDepartingEdges } from './wavePresets';

afterEach(() => cleanup());

describe('wavePresets — математические гарантии', () => {
  it('CORNER_IDS содержит 4 угла', () => {
    expect(CORNER_IDS).toEqual(['TL', 'TR', 'BR', 'BL']);
  });

  it('cornerPoint TL = (0,0)', () => {
    expect(cornerPoint('TL', 800, 600)).toEqual({ x: 0, y: 0 });
  });

  it('cornerPoint BR = (cw,ch)', () => {
    expect(cornerPoint('BR', 800, 600)).toEqual({ x: 800, y: 600 });
  });

  it('pointOnPerimeter 0 = TL', () => {
    expect(pointOnPerimeter(0, 800, 600)).toEqual({ x: 0, y: 0 });
  });

  it('pointOnPerimeter 2 = BR', () => {
    expect(pointOnPerimeter(2, 800, 600)).toEqual({ x: 800, y: 600 });
  });

  it('pointOnPerimeter 1 = TR', () => {
    expect(pointOnPerimeter(1, 800, 600)).toEqual({ x: 800, y: 0 });
  });

  it('pointOnPerimeter 3 = BL', () => {
    expect(pointOnPerimeter(3, 800, 600)).toEqual({ x: 0, y: 600 });
  });

  it('pointOnEdge top t=0.5 = центр верхнего края', () => {
    const p = pointOnEdge('top', 0.5, 800, 600, false);
    expect(p.x).toBeCloseTo(400, 0);
    expect(p.y).toBe(0);
  });

  it('pointOnEdge right t=0.5 reverse = снизу вверх', () => {
    const p = pointOnEdge('right', 0.5, 800, 600, true);
    expect(p.x).toBe(800);
    expect(p.y).toBeCloseTo(300, 0);
  });

  it('cornerDepartingEdges TL — 2 рёбра: top (not reversed), left (reversed)', () => {
    const edges = cornerDepartingEdges('TL');
    expect(edges).toHaveLength(2);
    // top edge from TL — not reversed (goes left→right)
    expect(edges[0]!.edge).toBe('top');
    expect(edges[0]!.reverse).toBe(false);
    // left edge from TL — reversed (goes bottom→top since TL is top of left edge)
    expect(edges[1]!.edge).toBe('left');
    expect(edges[1]!.reverse).toBe(true);
  });

  it('pointOnPerimeter оборачивает t за пределы [0..4)', () => {
    const p0 = pointOnPerimeter(0, 800, 600);
    const p4 = pointOnPerimeter(4, 800, 600);
    expect(p4.x).toBeCloseTo(p0.x, 0);
    expect(p4.y).toBeCloseTo(p0.y, 0);
  });

  it('pointOnPerimeter отрицательный t оборачивает', () => {
    const pMinus1 = pointOnPerimeter(-1, 800, 600);
    // -1 оборачивается в 3 → BL
    expect(pMinus1.x).toBe(0);
    expect(pMinus1.y).toBe(600);
  });
});

describe('GraphWaveOverlay', () => {
  let containerRef: React.RefObject<HTMLDivElement | null>;

  beforeEach(() => {
    const div = document.createElement('div');
    div.getBoundingClientRect = () => ({ width: 800, height: 600, x: 0, y: 0, top: 0, right: 800, bottom: 600, left: 0, toJSON: () => {} });
    containerRef = { current: div };
  });

  it('рендерит canvas с классом', () => {
    const { container } = render(<GraphWaveOverlay containerRef={containerRef} isIdle={true} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas!.className).toContain('pk-graph-wave-overlay');
  });

  it('не крашится с isIdle=false', () => {
    cleanup();
    const { container } = render(<GraphWaveOverlay containerRef={containerRef} isIdle={false} />);
    expect(container.querySelector('canvas')).toBeTruthy();
  });

  it('не крашится с inverted=true', () => {
    cleanup();
    const { container } = render(<GraphWaveOverlay containerRef={containerRef} isIdle={true} inverted={true} />);
    expect(container.querySelector('canvas')).toBeTruthy();
  });

  it('не крашится с delayOffset', () => {
    cleanup();
    const { container } = render(<GraphWaveOverlay containerRef={containerRef} isIdle={true} delayOffset={1.5} />);
    expect(container.querySelector('canvas')).toBeTruthy();
  });

  it('добавляет idle класс при isIdle=true', () => {
    cleanup();
    const { container } = render(<GraphWaveOverlay containerRef={containerRef} isIdle={true} />);
    expect(container.querySelector('.pk-graph-wave-overlay--idle')).toBeTruthy();
  });

  it('добавляет inverted класс при inverted=true', () => {
    cleanup();
    const { container } = render(<GraphWaveOverlay containerRef={containerRef} isIdle={false} inverted={true} />);
    expect(container.querySelector('.pk-graph-wave-overlay--inverted')).toBeTruthy();
  });
});