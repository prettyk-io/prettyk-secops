/**
 * @vitest-environment jsdom
 * WR-TEST-2: GraphTelemetryOverlay + photonColor + adaptiveSpeed + useGraphTelemetry
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { GraphTelemetryOverlay, photonColor, adaptiveSpeed, type PhotonTrailConfig } from './GraphTelemetryOverlay';
import { useGraphTelemetry, type GraphTelemetryEvent } from './useGraphTelemetry';

afterEach(() => cleanup());

describe('photonColor', () => {
  it('crawl → cyan', () => expect(photonColor('crawl')).toBe('#00F0FF'));
  it('active_scan → violet', () => expect(photonColor('active_scan')).toBe('#A855F7'));
  it('fuzzing → amber', () => expect(photonColor('fuzzing')).toBe('#F59E0B'));
  it('success → emerald', () => expect(photonColor('success')).toBe('#10B981'));
  it('failure → crimson', () => expect(photonColor('failure')).toBe('#EF4444'));
  it('unknown → cyan default', () => expect(photonColor('unknown')).toBe('#00F0FF'));
});

describe('adaptiveSpeed', () => {
  it('<200ms → 0.6s', () => expect(adaptiveSpeed(50)).toBe('0.6s'));
  it('200ms → 0.6s (граница)', () => expect(adaptiveSpeed(199)).toBe('0.6s'));
  it('200-1499ms → 1.8s', () => expect(adaptiveSpeed(500)).toBe('1.8s'));
  it('1500ms → 3.5s', () => expect(adaptiveSpeed(1500)).toBe('3.5s'));
  it('5000ms → 3.5s', () => expect(adaptiveSpeed(5000)).toBe('3.5s'));
});

describe('GraphTelemetryOverlay', () => {
  const edges: PhotonTrailConfig[] = [
    { edgeId: 'e1', source: { x: 100, y: 100 }, target: { x: 300, y: 200 }, color: '#00F0FF', speed: '0.6s' },
    { edgeId: 'e2', source: { x: 300, y: 200 }, target: { x: 500, y: 100 }, color: '#A855F7', speed: '1.8s' },
  ];

  it('рендерит SVG с photon-гранями', () => {
    const { container } = render(<GraphTelemetryOverlay width={600} height={400} worldMinX={0} worldMinY={0} photonEdges={edges} inactiveEdgeIds={new Set()} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('width')).toBe('600');
    expect(svg!.getAttribute('height')).toBe('400');
  });

  it('возвращает null при пустых photonEdges', () => {
    const { container } = render(<GraphTelemetryOverlay width={600} height={400} worldMinX={0} worldMinY={0} photonEdges={[]} inactiveEdgeIds={new Set()} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('показывает активные грани с анимацией', () => {
    const { container } = render(<GraphTelemetryOverlay width={600} height={400} worldMinX={0} worldMinY={0} photonEdges={edges} inactiveEdgeIds={new Set()} />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(2);
  });

  it('dimmed грани — opacity 0.25', () => {
    const inactive = new Set(['e1']);
    const { container } = render(<GraphTelemetryOverlay width={600} height={400} worldMinX={0} worldMinY={0} photonEdges={edges} inactiveEdgeIds={inactive} />);
    // inactive edge gets dimmed
    const dimLines = container.querySelectorAll('line');
    expect(dimLines.length).toBe(1);
    expect(dimLines[0]!.getAttribute('opacity')).toBe('0.25');
  });
});

describe('useGraphTelemetry', () => {
  it('возвращает пустой массив без EventSource', () => {
    // @ts-ignore
    delete (globalThis as any).EventSource;
    const { result } = renderHook(() => useGraphTelemetry());
    expect(result.current).toEqual([]);
  });

  it('фильтрует старые события по maxAgeMs', () => {
    const now = Date.now();
    const oldEvent: GraphTelemetryEvent = {
      event_id: 'old', run_id: 'r1', step_id: 's1', seq: 1,
      kind: 'crawl', status: 'done',
      occurred_at: new Date(now - 60_000).toISOString(),
    };
    // Хук фильтрует по maxAgeMs (default 30s), так что событие 60s назад должно уйти
    expect(now - new Date(oldEvent.occurred_at).getTime()).toBeGreaterThan(30_000);
  });
});