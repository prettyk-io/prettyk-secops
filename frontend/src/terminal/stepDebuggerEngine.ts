/**
 * PK-WB-E3 — Step Debugger Engine.
 *
 * Управляет сессией пошаговой отладки сценариев:
 * - Жизненный цикл: idle → stepping → paused → finished
 * - Управление шагами: stepInto, stepOver, stepOut, continue, stop
 * - Точки останова (step-level)
 * - Переменные с маскировкой секретов
 * - HTTP-обмен
 * - Мутация payload и повтор
 * - Мост StepStatus (CI-контракт) ↔ StepLedState (Studio-визуал)
 *
 *   import { createStepDebuggerEngine } from '@/terminal/stepDebuggerEngine';
 */

import type {
  StepStatus,
  StepTimelineEntry,
  VariableSnapshot,
  StepRuntimeSnapshot,
} from '../contracts/types';

// ═══════════════════════════════════════════════════════════════════════════
// Step IO model (extended from CI stepDebugger.ts)
// ═══════════════════════════════════════════════════════════════════════════

export interface StepDebugIO {
  stepId: string;
  label: string;
  /** Вход: строка конструктора DSL. */
  dslInput: string;
  /** Payload для отправки (редиактирован). */
  payload: Record<string, string>;
  /** Выход: HTTP-обмен. */
  httpExchange?: StepRuntimeSnapshot['httpExchange'];
  /** Выход: stdout / stderr. */
  stdout?: string;
  stderr?: string;
  /** Переменные на момент выполнения шага. */
  variables: VariableSnapshot[];
  /** Статус шага. */
  status: StepStatus;
  /** Ошибка (если status === 'failed'). */
  error?: string;
  /** Длительность (ms). */
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// StepLedState bridge
// ═══════════════════════════════════════════════════════════════════════════

export type StepLedState =
  | 'queued'
  | 'running'
  | 'success'
  | 'warning'
  | 'failure'
  | 'predicted';

export function stepStatusToLed(status: StepStatus): StepLedState {
  const map: Record<StepStatus, StepLedState> = {
    idle: 'queued',
    queued: 'queued',
    running: 'running',
    success: 'success',
    failed: 'failure',
    skipped: 'predicted',
  };
  return map[status];
}

// ═══════════════════════════════════════════════════════════════════════════
// Debug session state machine
// ═══════════════════════════════════════════════════════════════════════════

export type DebugPhase =
  | 'idle'       // Сессия не активна
  | 'stepping'   // Пошаговое выполнение
  | 'paused'     // Остановлена на брейкпоинте или step
  | 'finished';  // Все шаги выполнены или остановлена

export interface DebugSessionState {
  phase: DebugPhase;
  steps: StepDebugIO[];
  currentStepIndex: number;
  breakpoints: Set<string>;
  /** Последний проинспектированный снапшот. */
  lastSnapshot?: StepRuntimeSnapshot;
}

// ═══════════════════════════════════════════════════════════════════════════
// Генерация replay-команд
// ═══════════════════════════════════════════════════════════════════════════

export function buildReplayCommand(
  runId: string,
  stepId: string,
  newPayload?: string,
): string {
  if (newPayload) {
    return `pk replay-step ${runId} ${stepId} --payload '${newPayload}'`;
  }
  return `pk replay-step ${runId} ${stepId}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════════════════════════════════════

export interface StepDebuggerEngine {
  // --- session ---
  startSession(timeline: StepTimelineEntry[], snapshots?: StepRuntimeSnapshot[]): void;
  stopSession(): void;
  getState(): DebugSessionState;

  // --- control ---
  stepInto(): StepDebugIO | null;
  stepOver(): StepDebugIO | null;
  stepOut(): void;
  continue(): StepDebugIO | null;
  pause(): void;

  // --- breakpoints ---
  addBreakpoint(stepId: string): void;
  removeBreakpoint(stepId: string): void;
  toggleBreakpoint(stepId: string): void;
  hasBreakpoint(stepId: string): boolean;

  // --- replay ---
  buildPayloadReplay(stepId: string, newPayload: Record<string, string>): string;
  replayStep(runId: string, stepId: string, newPayload?: Record<string, string>): string;

  // --- inspection ---
  getCurrentStep(): StepDebugIO | null;
  getStepIO(stepId: string): StepDebugIO | null;

  // --- bulk step mutation ---
  updateStepPayload(stepId: string, payload: Record<string, string>): void;
  updateStepDsl(stepId: string, dsl: string): void;
}

export function createStepDebuggerEngine(): StepDebuggerEngine {
  let state: DebugSessionState = {
    phase: 'idle',
    steps: [],
    currentStepIndex: 0,
    breakpoints: new Set(),
  };
  let runId = '';
  let changeListeners: Array<() => void> = [];

  function notify(): void {
    changeListeners.forEach((fn) => fn());
  }

  function buildStepIO(
    entry: StepTimelineEntry,
    snapshot?: StepRuntimeSnapshot,
  ): StepDebugIO {
    return {
      stepId: entry.step_id,
      label: entry.name || entry.step_id,
      dslInput: '',
      payload: snapshot?.httpExchange?.requestHeaders
        ? { ...snapshot.httpExchange.requestHeaders }
        : {},
      httpExchange: snapshot?.httpExchange,
      stdout: snapshot?.stdout,
      stderr: snapshot?.stderr,
      variables: snapshot?.variables ?? [],
      status: entry.status,
      error: entry.error,
      durationMs: entry.duration_ms,
    };
  }

  const engine: StepDebuggerEngine = {
    startSession(timeline, snapshots) {
      const snapshotMap = new Map<string, StepRuntimeSnapshot>();
      snapshots?.forEach((s) => snapshotMap.set(s.step_id, s));

      state = {
        phase: 'stepping',
        steps: timeline.map((entry) => buildStepIO(entry, snapshotMap.get(entry.step_id))),
        currentStepIndex: 0,
        breakpoints: new Set(state.breakpoints), // preserve breakpoints across sessions
      };
      notify();
    },

    stopSession() {
      state = {
        phase: 'idle',
        steps: [],
        currentStepIndex: 0,
        breakpoints: state.breakpoints, // keep breakpoints
      };
      notify();
    },

    getState() {
      return { ...state, steps: [...state.steps], breakpoints: new Set(state.breakpoints) };
    },

    // ── control ──

    stepInto() {
      if (state.phase !== 'stepping' && state.phase !== 'paused') return null;
      if (state.currentStepIndex >= state.steps.length) {
        state.phase = 'finished';
        notify();
        return null;
      }
      const step = state.steps[state.currentStepIndex]!;
      state.currentStepIndex++;
      state.phase = 'paused';
      notify();
      return step;
    },

    stepOver() {
      // step-level: stepOver === stepInto
      return engine.stepInto();
    },

    stepOut() {
      // step-level: finish remaining
      state.currentStepIndex = state.steps.length;
      state.phase = 'finished';
      notify();
    },

    continue() {
      if (state.phase !== 'stepping' && state.phase !== 'paused') return null;
      state.phase = 'stepping';
      let lastStep: StepDebugIO | null = null;

      while (state.currentStepIndex < state.steps.length) {
        const step = state.steps[state.currentStepIndex]!;
        state.currentStepIndex++;
        lastStep = step;
        // Остановка на breakpoint
        if (state.breakpoints.has(step.stepId)) {
          state.phase = 'paused';
          notify();
          return step;
        }
      }

      state.phase = 'finished';
      notify();
      return lastStep;
    },

    pause() {
      if (state.phase === 'stepping') {
        state.phase = 'paused';
        notify();
      }
    },

    // ── breakpoints ──

    addBreakpoint(stepId) {
      state.breakpoints = new Set([...state.breakpoints, stepId]);
      notify();
    },

    removeBreakpoint(stepId) {
      const next = new Set(state.breakpoints);
      next.delete(stepId);
      state.breakpoints = next;
      notify();
    },

    toggleBreakpoint(stepId) {
      if (state.breakpoints.has(stepId)) {
        engine.removeBreakpoint(stepId);
      } else {
        engine.addBreakpoint(stepId);
      }
    },

    hasBreakpoint(stepId) {
      return state.breakpoints.has(stepId);
    },

    // ── replay ──

    buildPayloadReplay(stepId, newPayload) {
      const payloadStr = JSON.stringify(newPayload);
      return `pk replay-step ${runId} ${stepId} --payload '${payloadStr}'`;
    },

    replayStep(rId, stepId, newPayload) {
      if (rId) runId = rId;
      const payloadStr = newPayload ? JSON.stringify(newPayload) : undefined;
      return buildReplayCommand(runId, stepId, payloadStr);
    },

    // ── inspection ──

    getCurrentStep() {
      if (state.currentStepIndex <= 0 || state.currentStepIndex > state.steps.length) {
        return null;
      }
      return state.steps[state.currentStepIndex - 1] ?? null;
    },

    getStepIO(stepId) {
      return state.steps.find((s) => s.stepId === stepId) ?? null;
    },

    // ── bulk mutation ──

    updateStepPayload(stepId, payload) {
      const idx = state.steps.findIndex((s) => s.stepId === stepId);
      if (idx < 0) return;
      state.steps[idx] = { ...state.steps[idx]!, payload };
      notify();
    },

    updateStepDsl(stepId, dsl) {
      const idx = state.steps.findIndex((s) => s.stepId === stepId);
      if (idx < 0) return;
      state.steps[idx] = { ...state.steps[idx]!, dslInput: dsl };
      notify();
    },
  };

  return engine;
}