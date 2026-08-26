// @vitest-environment jsdom
/**
 * Tests for PK-BL-6..10 Baseline Terminal UI Widgets:
 * - StrikeModal (BL-6)
 * - DragDropZone (BL-7)
 * - AttackSurfaceRadar (BL-8)
 * - LivePhaseRail (BL-9)
 * - BaselineDeltaLedger (BL-10)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { StrikeModal } from './StrikeModal';
import { DragDropZone, type DroppedSeed } from './DragDropZone';
import { AttackSurfaceRadar } from './AttackSurfaceRadar';
import { LivePhaseRail, type PhaseState } from './LivePhaseRail';
import { BaselineDeltaLedger, type DeltaItem } from './BaselineDeltaLedger';

afterEach(() => {
  cleanup();
});

describe('PK-BL-6: StrikeModal', () => {
  it('does not render when open is false', () => {
    const { container } = render(
      <StrikeModal open={false} onClose={vi.fn()} onRun={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders target URL, preflight chip, and buttons when open', () => {
    const onRun = vi.fn();
    const onClose = vi.fn();
    render(
      <StrikeModal
        open={true}
        onClose={onClose}
        onRun={onRun}
        defaultUrl="http://target-api:8080"
        preflightPassed={true}
      />
    );

    expect(screen.getByText('Drop & Strike')).toBeDefined();
    expect(screen.getByDisplayValue('http://target-api:8080')).toBeDefined();
    expect(screen.getByText(/Preflight passed/)).toBeDefined();

    const strikeBtn = screen.getByRole('button', { name: /Strike/i });
    fireEvent.click(strikeBtn);

    expect(onRun).toHaveBeenCalledWith('http://target-api:8080');
    expect(onClose).toHaveBeenCalled();
  });

  it('allows changing the URL and respects cancel button', () => {
    const onRun = vi.fn();
    const onClose = vi.fn();
    render(
      <StrikeModal open={true} onClose={onClose} onRun={onRun} />
    );

    const input = screen.getByPlaceholderText('http://juice-shop:3000') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'http://custom-target:9000' } });
    expect(input.value).toBe('http://custom-target:9000');

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
    expect(onRun).not.toHaveBeenCalled();
  });
});

describe('PK-BL-7: DragDropZone', () => {
  it('renders drop zone placeholder text and format hints', () => {
    render(<DragDropZone onDropSeed={vi.fn()} />);
    expect(screen.getByText('Drop seed files here')).toBeDefined();
    expect(screen.getByText('Wired JSON · HAR · OpenAPI · GraphQL · CSV')).toBeDefined();
  });

  it('renders seed list with format labels and remove trigger', () => {
    const seeds: DroppedSeed[] = [
      { name: 'session.har', format: 'har', size: 2048, content: '{}' },
      { name: 'schema.graphql', format: 'graphql', size: 1024, content: 'type Query {}' },
    ];
    const onRemove = vi.fn();

    const { container } = render(
      <DragDropZone onDropSeed={vi.fn()} seeds={seeds} onRemoveSeed={onRemove} />
    );

    expect(screen.getByText('session.har')).toBeDefined();
    expect(screen.getByText(/HAR Archive · 2.0 KB/)).toBeDefined();
    expect(screen.getByText('schema.graphql')).toBeDefined();
    expect(screen.getByText(/GraphQL SDL · 1.0 KB/)).toBeDefined();

    const removeBtns = container.querySelectorAll('button');
    expect(removeBtns.length).toBe(2);
    fireEvent.click(removeBtns[0]!);
    expect(onRemove).toHaveBeenCalledWith(0);
  });
});

describe('PK-BL-8: AttackSurfaceRadar', () => {
  it('renders SVG arcs, crosshairs, and protocol legend', () => {
    const targets = [
      { protocol: 'HTTPS', count: 10, color: '#38bdf8' },
      { protocol: 'gRPC', count: 5, color: '#a855f7' },
    ];
    render(<AttackSurfaceRadar targets={targets} size={180} />);

    expect(screen.getByText('HTTPS (10)')).toBeDefined();
    expect(screen.getByText('gRPC (5)')).toBeDefined();
    expect(screen.getByText('15 total endpoints')).toBeDefined();
  });
});

describe('PK-BL-9: LivePhaseRail', () => {
  it('renders all 6 phases in pipeline', () => {
    const phases: PhaseState[] = [
      { id: 'discovery', label: 'Discovery', icon: <span>D</span>, status: 'done', progress: 100, detail: '18 endpoints' },
      { id: 'auth', label: 'Auth', icon: <span>A</span>, status: 'running', progress: 45, detail: '45%' },
      { id: 'scan', label: 'Scan', icon: <span>S</span>, status: 'idle', progress: 0, detail: '—' },
      { id: 'fuzz', label: 'Fuzz', icon: <span>F</span>, status: 'idle', progress: 0, detail: '—' },
      { id: 'gate', label: 'Gate', icon: <span>G</span>, status: 'idle', progress: 0, detail: '—' },
      { id: 'evidence', label: 'Evidence', icon: <span>E</span>, status: 'idle', progress: 0, detail: '—' },
    ];

    render(<LivePhaseRail phases={phases} />);

    expect(screen.getByText('Discovery')).toBeDefined();
    expect(screen.getByText('18 endpoints')).toBeDefined();
    expect(screen.getByText('Auth')).toBeDefined();
    expect(screen.getByText('RUNNING')).toBeDefined();
    expect(screen.getByText('Scan')).toBeDefined();
  });
});

describe('PK-BL-10: BaselineDeltaLedger', () => {
  it('renders verdict card and delta items with NEW and RESOLVED indicators', () => {
    const items: DeltaItem[] = [
      { label: 'Critical Vulnerabilities', current: 0, previous: 2 },
      { label: 'Unprotected Endpoints', current: 3, previous: 0 },
      { label: 'Average Response Time', current: 45, previous: 40, unit: 'ms' },
    ];

    render(
      <BaselineDeltaLedger
        items={items}
        gate="passed"
        gateReason="All quality gates passed with zero criticals"
        previousRunDate="2026-08-24 18:00"
      />
    );

    expect(screen.getByText('PASSED')).toBeDefined();
    expect(screen.getByText('All quality gates passed with zero criticals')).toBeDefined();
    expect(screen.getByText(/Delta vs 2026-08-24 18:00/)).toBeDefined();

    // Critical reduced from 2 to 0 -> RESOLVED
    expect(screen.getByText('RESOLVED')).toBeDefined();
    // Unprotected increased from 0 to 3 -> NEW
    expect(screen.getByText('NEW')).toBeDefined();
    // Latency increased by 5 -> +5
    expect(screen.getByText('+5')).toBeDefined();
  });

  it('handles failed verdict and reasons', () => {
    render(
      <BaselineDeltaLedger
        items={[]}
        gate="failed"
        gateReason="Critical regression found in authentication flow"
      />
    );
    expect(screen.getByText('FAILED')).toBeDefined();
    expect(screen.getByText(/Critical regression/)).toBeDefined();
  });
});
