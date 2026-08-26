// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BuddyDockController } from './BuddyDockController';
import type { BuddyEngineState } from '../../buddy/buddyEngine';

// Мок движка: не поднимаем настоящий BuddyEngine + CDP runner
const mockAddMessage = vi.fn();
const mockBuildProposal = vi.fn();
const mockApproveProposal = vi.fn();
const mockRejectProposal = vi.fn();
const mockRun = vi.fn();
const mockStopRun = vi.fn();
const mockSubscribe = vi.fn();

let mockState: BuddyEngineState;

function setMockState(s: BuddyEngineState) {
  mockState = s;
}

vi.mock('../../buddy/buddyEngine', () => ({
  BuddyEngine: class {
    subscribe = mockSubscribe;
    addMessage = mockAddMessage;
    buildProposal = mockBuildProposal;
    approveProposal = mockApproveProposal;
    rejectProposal = mockRejectProposal;
    run = mockRun;
    stopRun = mockStopRun;
    getState = () => mockState;
  },
}));

vi.mock('../../buddy/cdpStepRunner', () => ({
  makeCdpStepRunner: () => ({ runStep: vi.fn() }),
}));

function baseState(): BuddyEngineState {
  return {
    phase: 'collecting',
    intent: { messages: [] },
    skeleton: null,
    clarification: null,
    proposal: null,
    runState: null,
    evidence: null,
    trace: { intentId: 'intent-1', events: [] },
    status: 'Ожидаю описание',
  };
}

beforeEach(() => {
  mockAddMessage.mockReset();
  mockBuildProposal.mockReset();
  mockApproveProposal.mockReset();
  mockRejectProposal.mockReset();
  mockRun.mockReset();
  mockStopRun.mockReset();
  mockSubscribe.mockReset();
  setMockState(baseState());
});

afterEach(() => {
  cleanup();
});

describe('BuddyDockController (BUD-10)', () => {
  it('пустой intent → LaunchpadHero', () => {
    render(<BuddyDockController />);
    expect(screen.getByTestId('buddy-launchpad-hero')).toBeDefined();
  });

  it('intent с сообщением → SkeletonCard, не Launchpad', () => {
    setMockState({
      ...baseState(),
      phase: 'skeleton',
      intent: { messages: [{ id: 'm1', role: 'operator', text: 'SPA /catalog', ts: 1 }] },
      skeleton: {
        appType: 'SPA',
        pages: [{ id: 'p1', name: 'catalog', path: '/catalog', confidence: 'explicit' }],
        transitions: [],
        actions: [{ id: 'a1', kind: 'click', target: 'Купить', confidence: 'explicit' }],
        expectations: [],
        assumptions: [],
      },
    });
    render(<BuddyDockController />);
    expect(screen.getByTestId('buddy-dock')).toBeDefined();
    expect(screen.getByTestId('skeleton-card')).toBeDefined();
  });

  it('phase proposal → LiveDiffBanner', () => {
    setMockState({
      ...baseState(),
      phase: 'proposal',
      intent: { messages: [{ id: 'm1', role: 'operator', text: 'SPA /catalog', ts: 1 }] },
      skeleton: {
        appType: 'SPA', pages: [], transitions: [], actions: [], expectations: [], assumptions: [],
      },
      proposal: {
        id: 'prop-1',
        pageObject: { name: 'Main', elements: [] },
        scenario: { name: 'Scenario', steps: [], expectations: [] },
        sourceIntentId: 'm1',
      },
    });
    render(<BuddyDockController />);
    expect(screen.getByTestId('live-diff-banner')).toBeDefined();
  });

  it('phase approved → кнопка запуска', () => {
    setMockState({
      ...baseState(),
      phase: 'approved',
      intent: { messages: [{ id: 'm1', role: 'operator', text: 'SPA', ts: 1 }] },
      skeleton: { appType: 'SPA', pages: [], transitions: [], actions: [], expectations: [], assumptions: [] },
      proposal: {
        id: 'prop-1',
        pageObject: { name: 'Main', elements: [] },
        scenario: { name: 'Scenario', steps: [], expectations: [] },
        sourceIntentId: 'm1',
      },
    });
    render(<BuddyDockController />);
    expect(screen.getByTestId('buddy-run')).toBeDefined();
  });

  it('finished → EvidenceMatrix', () => {
    setMockState({
      ...baseState(),
      phase: 'finished',
      intent: { messages: [{ id: 'm1', role: 'operator', text: 'SPA', ts: 1 }] },
      skeleton: { appType: 'SPA', pages: [], transitions: [], actions: [], expectations: [], assumptions: [] },
      runState: { phase: 'done', currentIteration: 1, maxIterations: 10, startedAt: 0, elapsedMs: 10, outcomes: [] },
      evidence: { pass: true, assertions: [], advisories: [] },
    });
    render(<BuddyDockController />);
    expect(screen.getByTestId('evidence-matrix')).toBeDefined();
  });

  it('running → StepRadar', () => {
    setMockState({
      ...baseState(),
      phase: 'running',
      intent: { messages: [{ id: 'm1', role: 'operator', text: 'SPA', ts: 1 }] },
      skeleton: { appType: 'SPA', pages: [], transitions: [], actions: [], expectations: [], assumptions: [] },
      runState: { phase: 'running', currentIteration: 1, maxIterations: 10, startedAt: 0, elapsedMs: 0, outcomes: [] },
    });
    render(<BuddyDockController />);
    expect(screen.getByTestId('step-radar')).toBeDefined();
  });

  it('run-кнопка вызывает engine.run()', () => {
    setMockState({
      ...baseState(),
      phase: 'approved',
      intent: { messages: [{ id: 'm1', role: 'operator', text: 'SPA', ts: 1 }] },
      skeleton: { appType: 'SPA', pages: [], transitions: [], actions: [], expectations: [], assumptions: [] },
      proposal: {
        id: 'prop-1',
        pageObject: { name: 'Main', elements: [] },
        scenario: { name: 'Scenario', steps: [], expectations: [] },
        sourceIntentId: 'm1',
      },
    });
    render(<BuddyDockController />);
    fireEvent.click(screen.getByTestId('buddy-run'));
    expect(mockRun).toHaveBeenCalled();
  });

  it('Take Control вызывает stopRun()', () => {
    setMockState({
      ...baseState(),
      phase: 'running',
      intent: { messages: [{ id: 'm1', role: 'operator', text: 'SPA', ts: 1 }] },
      skeleton: { appType: 'SPA', pages: [], transitions: [], actions: [], expectations: [], assumptions: [] },
      runState: { phase: 'running', currentIteration: 1, maxIterations: 10, startedAt: 0, elapsedMs: 0, outcomes: [] },
    });
    render(<BuddyDockController />);
    fireEvent.click(screen.getByTestId('take-control'));
    expect(mockStopRun).toHaveBeenCalled();
  });
});
