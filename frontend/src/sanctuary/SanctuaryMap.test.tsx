// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Мок единого описания карты (B1: карта из описания, не из кода).
vi.mock('@sanctuary/system-map.json', () => ({
  default: {
    version: '1',
    lastUpdated: '2026-08-27',
    nodes: [
      { id: 'prettyk', label: 'PrettyK', level: 'landscape', status: 'native_v2', lenses: ['architecture', 'flow'] },
      { id: 'studio', label: 'Studio', level: 'system', parent: 'prettyk', status: 'native_v2', route: '#/checks/<id>/studio', lenses: ['architecture', 'flow'] },
      { id: 'busted', label: 'Busted', level: 'system', parent: 'prettyk', status: 'legacy_only', route: '#/nope/x', lenses: ['architecture'] },
    ],
    edges: [{ id: 'e1', source: 'prettyk', target: 'studio', type: 'dependency', lenses: ['architecture'] }],
  },
}));

vi.mock('@xyflow/react', () => {
  const React = require('react') as typeof import('react');
  return {
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    ReactFlow: ({ nodes, edges, children, nodeTypes }: { nodes: Array<{ id: string; type?: string; data: Record<string, unknown> }>; edges: unknown[]; children?: React.ReactNode; nodeTypes?: Record<string, React.ComponentType<{ id: string; data: Record<string, unknown> }>> }) => (
      <div data-testid="rf" data-nodes={nodes.length} data-edges={edges.length}>
        {nodes.map((n) => {
          const C = nodeTypes?.[n.type ?? ''];
          return C ? <C key={n.id} id={n.id} data={n.data} /> : <div key={n.id} data-testid={`map-node-${n.id}`} />;
        })}
        {children}
      </div>
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Panel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    MarkerType: { ArrowClosed: 'arrowclosed' },
    useReactFlow: () => ({ fitView: vi.fn() }),
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' },
  };
});

vi.mock('../checks/hashRoute', () => ({
  parseHash: (h: string) => ({ kind: 'check', checkId: 'chk-1', view: 'studio' }),
  navigateHash: vi.fn(),
}));

vi.mock('../checks/checksStore', () => ({
  getActiveCheckId: () => 'chk-1',
}));

import { SanctuaryMap } from './SanctuaryMap';

describe('SanctuaryMap (smoke)', () => {
  beforeEach(() => cleanup());

  it('рендерит узлы из единого описания и фильтрует по линзе (architecture)', async () => {
    render(<SanctuaryMap />);
    // Дефолтная линза architecture: prettyk + studio + busted видимы.
    const rf = await screen.findByTestId('rf');
    // 3 узла на L0? Нет: L0 показывает landscape-корни (только prettyk), у busted есть route → битая.
    expect(rf.getAttribute('data-nodes')).toBe('1');
  });

  it('проваливается в prettyk (L1) — показываются дети', async () => {
    render(<SanctuaryMap />);
    const prettyk = await screen.findByTestId('map-node-prettyk');
    fireEvent.click(prettyk);
    const rf = screen.getByTestId('rf');
    // L1: prettyk (breadcrumb) + studio + busted = 3 узла.
    expect(rf.getAttribute('data-nodes')).toBe('3');
  });

  it('помечает битую ссылку узла', async () => {
    render(<SanctuaryMap />);
    const prettyk = await screen.findByTestId('map-node-prettyk');
    fireEvent.click(prettyk);
    const busted = await screen.findByTestId('map-node-busted');
    expect(busted.getAttribute('data-broken')).toBe('true');
  });

  it('телепортирует на канонический маршрут (подставляет <id>)', async () => {
    const { navigateHash } = await import('../checks/hashRoute');
    render(<SanctuaryMap />);
    const prettyk = await screen.findByTestId('map-node-prettyk');
    fireEvent.click(prettyk);
    const teleport = await screen.findByTestId('teleport-studio');
    fireEvent.click(teleport);
    expect(navigateHash).toHaveBeenCalled();
  });
});
