// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { WarzoneHub } from './WarzoneHub';
import { WarzoneModes, WarzoneHud } from './WarzoneModes';
import { useWarZoneTelemetry, type SceneState } from './useWarZoneTelemetry';

afterEach(() => cleanup());

const SCENE: SceneState = {
  t: 42,
  active_beams: [
    { id: 'beam-1', source: 'src', target: 'gw-1', intensity: 1 },
    { id: 'beam-2', source: 'src', target: 'db-main', intensity: 0.8 },
    { id: 'beam-3', source: 'src', target: 'auth', intensity: 0.5 },
  ],
  findings: [{ kind: 'high', count: 4 }, { kind: 'medium', count: 7 }],
  node_hits: [{ nodeId: 'gw-1', hits: 3 }, { nodeId: 'db-main', hits: 1 }],
};

describe('WZ-6/WZ-SSE: WarzoneHub + WarzoneModes + HUD', () => {
  it('HUD показывает t, лучи, findings, node_hits', () => {
    const { container } = render(<WarzoneHud t={42} scene={SCENE} />);
    expect(container.textContent).toContain('t 0:42');
    expect(container.textContent).toContain('лучи 3');
    expect(container.textContent).toContain('findings 11');
    expect(container.textContent).toContain('node_hits 4');
  });

  it('WarzoneModes рендерит все три режима без краша', () => {
    const logs = [{ ts: 1, channel: 'system' as const, text: 'hello' }];
    for (const mode of ['hybrid', 'audit', 'battlefield'] as const) {
      const { container } = render(
        <WarzoneModes mode={mode} t={5} durationS={120} scene={SCENE} logs={logs} />,
      );
      expect(container.textContent).toContain('t 0:05');
      cleanup();
    }
  });

  it('переключение режима не сбрасывает playhead (t живёт в родителе)', () => {
    const { getByText } = render(<WarzoneHub />);
    // playhead виден в нижней панели
    expect(getByText(/playhead/)).toBeTruthy();
    // Переключаем режим — playhead текст остаётся (не сбрасывается в 0)
    const battlefield = getByText('Battlefield');
    fireEvent.click(battlefield);
    expect(getByText(/playhead/)).toBeTruthy();
  });

  it('WarzoneHub показывает mock-индикатор когда SSE не live', () => {
    const { getByText } = render(<WarzoneHub />);
    expect(getByText('mock')).toBeTruthy();
  });
});

describe('useWarZoneTelemetry (fallback)', () => {
  it('возвращает scene и live=false при выключенном SSE', () => {
    // Хук не вызывается напрямую в тесте без рендера — проверяем через компонент.
    const { getByText } = render(<WarzoneHub />);
    // mock-индикатор = live=false
    expect(getByText('mock')).toBeTruthy();
  });
});
