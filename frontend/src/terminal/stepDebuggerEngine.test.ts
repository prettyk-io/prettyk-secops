/**
 * PK-WB-E3 — Step Debugger Engine Tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createStepDebuggerEngine,
  stepStatusToLed,
  buildReplayCommand,
} from './stepDebuggerEngine';
import type {
  StepTimelineEntry,
  StepRuntimeSnapshot,
} from '../contracts/types';
import type { StepDebuggerEngine } from './stepDebuggerEngine';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function makeTimeline(entries: Partial<StepTimelineEntry>[]): StepTimelineEntry[] {
  return entries.map((e, i) => ({
    step_id: e.step_id ?? `step-${i}`,
    name: e.name ?? `Step ${i}`,
    status: e.status ?? 'idle',
    duration_ms: e.duration_ms ?? 0,
    started_at: e.started_at ?? new Date().toISOString(),
    ended_at: e.ended_at,
    error: e.error,
  }));
}

function makeSnapshots(
  stepIds: string[],
  opts?: { variables?: boolean; http?: boolean },
): StepRuntimeSnapshot[] {
  return stepIds.map((stepId) => ({
    step_id: stepId,
    variables: opts?.variables
      ? [
          { name: 'BASE_URL', value: 'https://example.com', isSecret: false },
          { name: 'API_KEY', value: 'sk-1234567890abcdef', isSecret: true },
          { name: 'SESSION', value: 'sess_abcd', isSecret: false },
        ]
      : [],
    timestamp: new Date().toISOString(),
    httpExchange: opts?.http
      ? {
          requestUrl: 'https://example.com/api/auth',
          method: 'POST',
          status: 200,
          requestHeaders: { 'Content-Type': 'application/json', Authorization: '***' },
          responseHeaders: { 'Content-Type': 'application/json' },
          responseBodyPreview: '{"token":"jwt..."}',
        }
      : undefined,
  }));
}

function freshEngine(): StepDebuggerEngine {
  return createStepDebuggerEngine();
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('stepStatusToLed — bridge', () => {
  it('maps idle → queued', () => { expect(stepStatusToLed('idle')).toBe('queued'); });
  it('maps queued → queued', () => { expect(stepStatusToLed('queued')).toBe('queued'); });
  it('maps running → running', () => { expect(stepStatusToLed('running')).toBe('running'); });
  it('maps success → success', () => { expect(stepStatusToLed('success')).toBe('success'); });
  it('maps failed → failure', () => { expect(stepStatusToLed('failed')).toBe('failure'); });
  it('maps skipped → predicted', () => { expect(stepStatusToLed('skipped')).toBe('predicted'); });
});

describe('buildReplayCommand', () => {
  it('builds basic replay', () => {
    expect(buildReplayCommand('r1', 's1')).toBe('pk replay-step r1 s1');
  });
  it('builds replay with payload', () => {
    expect(buildReplayCommand('r1', 's1', '{"x":1}'))
      .toBe("pk replay-step r1 s1 --payload '{\"x\":1}'");
  });
});

describe('Engine: session lifecycle', () => {
  let engine: StepDebuggerEngine;

  beforeEach(() => { engine = freshEngine(); });

  it('starts in idle', () => {
    expect(engine.getState().phase).toBe('idle');
    expect(engine.getState().steps).toEqual([]);
  });

  it('startSession sets phase to stepping', () => {
    const timeline = makeTimeline([{ step_id: 'a' }, { step_id: 'b' }]);
    engine.startSession(timeline);
    expect(engine.getState().phase).toBe('stepping');
    expect(engine.getState().steps).toHaveLength(2);
    expect(engine.getState().steps[0]!.stepId).toBe('a');
    expect(engine.getState().steps[1]!.stepId).toBe('b');
  });

  it('startSession with snapshots hydrates step IO', () => {
    const timeline = makeTimeline([{ step_id: 's1' }, { step_id: 's2' }]);
    const snapshots = makeSnapshots(['s1', 's2'], { variables: true });
    engine.startSession(timeline, snapshots);

    const s1 = engine.getStepIO('s1');
    expect(s1!.variables).toHaveLength(3);
    expect(s1!.variables[0]!.name).toBe('BASE_URL');
    expect(s1!.variables[1]!.isSecret).toBe(true);
  });

  it('startSession loads http exchange from snapshot', () => {
    const timeline = makeTimeline([{ step_id: 's1' }]);
    const snapshots = makeSnapshots(['s1'], { http: true });
    engine.startSession(timeline, snapshots);

    const s1 = engine.getStepIO('s1');
    expect(s1!.httpExchange?.method).toBe('POST');
    expect(s1!.httpExchange?.status).toBe(200);
    expect(s1!.httpExchange?.requestUrl).toBe('https://example.com/api/auth');
  });

  it('stopSession resets to idle', () => {
    engine.startSession(makeTimeline([{ step_id: 'a' }]));
    engine.stopSession();
    expect(engine.getState().phase).toBe('idle');
    expect(engine.getState().steps).toEqual([]);
  });

  it('stopSession preserves breakpoints', () => {
    engine.addBreakpoint('s1');
    engine.startSession(makeTimeline([{ step_id: 's1' }]));
    engine.stopSession();
    expect(engine.hasBreakpoint('s1')).toBe(true);
  });

  it('getState returns immutable snapshot', () => {
    engine.startSession(makeTimeline([{ step_id: 'a' }]));
    const s1 = engine.getState();
    s1.steps.push({ stepId: 'x', label: '', dslInput: '', payload: {}, variables: [], status: 'idle', durationMs: 0 });
    expect(engine.getState().steps).toHaveLength(1);
  });
});

describe('Engine: step control', () => {
  let engine: StepDebuggerEngine;

  beforeEach(() => {
    engine = freshEngine();
    engine.startSession(makeTimeline([
      { step_id: 's1', name: 'Login', status: 'success', duration_ms: 120 },
      { step_id: 's2', name: 'Check', status: 'success', duration_ms: 250 },
      { step_id: 's3', name: 'Logout', status: 'failed', duration_ms: 80, error: 'timeout' },
    ]));
  });

  it('stepInto returns first step and pauses', () => {
    const step = engine.stepInto();
    expect(step).not.toBeNull();
    expect(step!.stepId).toBe('s1');
    expect(step!.label).toBe('Login');
    expect(step!.durationMs).toBe(120);
    expect(engine.getState().phase).toBe('paused');
    expect(engine.getState().currentStepIndex).toBe(1);
  });

  it('stepInto returns null when all steps done', () => {
    engine.stepInto(); // s1
    engine.stepInto(); // s2
    engine.stepInto(); // s3
    const step = engine.stepInto(); // beyond
    expect(step).toBeNull();
    expect(engine.getState().phase).toBe('finished');
  });

  it('stepOver behaves same as stepInto (step-level)', () => {
    const step = engine.stepOver();
    expect(step!.stepId).toBe('s1');
    expect(engine.getState().phase).toBe('paused');
  });

  it('stepOut finishes all remaining', () => {
    engine.stepInto(); // s1 — now paused at index 1
    engine.stepOut();
    expect(engine.getState().phase).toBe('finished');
    expect(engine.getState().currentStepIndex).toBe(3);
  });

  it('continue runs all steps when no breakpoints', () => {
    const step = engine.continue();
    expect(engine.getState().phase).toBe('finished');
    expect(step!.stepId).toBe('s3'); // last step
  });

  it('continue stops at breakpoint', () => {
    engine.addBreakpoint('s2');
    const step = engine.continue();
    expect(step!.stepId).toBe('s2');
    expect(engine.getState().phase).toBe('paused');
    expect(engine.getState().currentStepIndex).toBe(2);
  });

  it('continue resumes from paused position', () => {
    engine.addBreakpoint('s3');
    engine.stepInto(); // s1, paused
    engine.stepInto(); // s2, paused
    const step = engine.continue(); // runs until s3 breakpoint or end
    expect(step!.stepId).toBe('s3');
    expect(engine.getState().phase).toBe('paused');
  });

  it('pause sets phase to paused', () => {
    // start session then continue to be in 'stepping' state
    engine.continue();
    // Now start another session and test pause mid-continue
    engine.startSession(makeTimeline([{ step_id: 'a' }, { step_id: 'b' }]));
    // Force stepping phase by calling stepInto first
    engine.stepInto();
    engine.pause();
    expect(engine.getState().phase).toBe('paused');
  });

  it('getCurrentStep returns active step', () => {
    expect(engine.getCurrentStep()).toBeNull(); // none stepped yet
    engine.stepInto();
    expect(engine.getCurrentStep()!.stepId).toBe('s1');
    engine.stepInto();
    expect(engine.getCurrentStep()!.stepId).toBe('s2');
  });

  it('stepInto/stepOver when not active returns null', () => {
    const idle = createStepDebuggerEngine();
    expect(idle.stepInto()).toBeNull();
    expect(idle.stepOver()).toBeNull();
    expect(idle.continue()).toBeNull();
  });
});

describe('Engine: breakpoints', () => {
  let engine: StepDebuggerEngine;

  beforeEach(() => {
    engine = freshEngine();
    engine.startSession(makeTimeline([{ step_id: 'a' }, { step_id: 'b' }]));
  });

  it('add/remove/toggle breakpoint', () => {
    expect(engine.hasBreakpoint('a')).toBe(false);
    engine.addBreakpoint('a');
    expect(engine.hasBreakpoint('a')).toBe(true);
    engine.removeBreakpoint('a');
    expect(engine.hasBreakpoint('a')).toBe(false);
  });

  it('toggleBreakpoint adds then removes', () => {
    engine.toggleBreakpoint('a');
    expect(engine.hasBreakpoint('a')).toBe(true);
    engine.toggleBreakpoint('a');
    expect(engine.hasBreakpoint('a')).toBe(false);
  });

  it('breakpoints survive session restart', () => {
    engine.addBreakpoint('a');
    engine.stopSession();
    engine.startSession(makeTimeline([{ step_id: 'c' }, { step_id: 'a' }]));
    expect(engine.hasBreakpoint('a')).toBe(true);
  });
});

describe('Engine: replay commands', () => {
  let engine: StepDebuggerEngine;

  beforeEach(() => { engine = freshEngine(); });

  it('replayStep builds without payload', () => {
    expect(engine.replayStep('run-1', 'step-A')).toBe('pk replay-step run-1 step-A');
  });

  it('replayStep builds with payload', () => {
    expect(engine.replayStep('run-1', 'step-A', { x: '1' }))
      .toBe('pk replay-step run-1 step-A --payload \'{"x":"1"}\'');
  });

  it('buildPayloadReplay returns command string', () => {
    // replayStep internally calls buildReplayCommand
    expect(engine.replayStep('r99', 's88', { key: 'val' }))
      .toBe('pk replay-step r99 s88 --payload \'{"key":"val"}\'');
  });
});

describe('Engine: bulk mutation', () => {
  let engine: StepDebuggerEngine;

  beforeEach(() => {
    engine = freshEngine();
    engine.startSession(makeTimeline([{ step_id: 'a' }, { step_id: 'b' }]));
  });

  it('updateStepPayload modifies step', () => {
    engine.updateStepPayload('a', { method: 'GET' });
    const step = engine.getStepIO('a')!;
    expect(step.payload).toEqual({ method: 'GET' });
  });

  it('updateStepPayload is no-op on unknown step', () => {
    engine.updateStepPayload('x', {});
    // No throw
  });

  it('updateStepDsl modifies dsl', () => {
    engine.updateStepDsl('a', 'Type /login');
    expect(engine.getStepIO('a')!.dslInput).toBe('Type /login');
  });

  it('getStepIO returns null on unknown', () => {
    expect(engine.getStepIO('z')).toBeNull();
  });
});

describe('Engine: step IO hydration', () => {
  let engine: StepDebuggerEngine;

  beforeEach(() => { engine = freshEngine(); });

  it('step with error sets error field', () => {
    engine.startSession(makeTimeline([{ step_id: 'e1', status: 'failed', error: 'ERR_TIMEOUT' }]));
    const step = engine.getStepIO('e1')!;
    expect(step.status).toBe('failed');
    expect(step.error).toBe('ERR_TIMEOUT');
  });

  it('step with stdout/stderr from snapshot', () => {
    const timeline = makeTimeline([{ step_id: 's1' }]);
    const snapshots: StepRuntimeSnapshot[] = [
      { step_id: 's1', variables: [], stdout: 'login OK', stderr: '' },
    ];
    engine.startSession(timeline, snapshots);
    const step = engine.getStepIO('s1')!;
    expect(step.stdout).toBe('login OK');
  });

  it('empty snapshots array is safe', () => {
    engine.startSession(makeTimeline([{ step_id: 'a' }]), []);
    expect(engine.getStepIO('a')!.variables).toEqual([]);
  });
});