/**
 * CO-PILOT META (PoC) — BoundedRunner.
 *
 * Фоновый процесс строго ОГРАНИЧЕН: лимит времени + лимит итераций.
 * Явный Stop. Каждое изменение workspace — отдельное подтверждение, либо
 * шаг входит в заранее подтверждённый run-scope. При исчерпании лимита —
 * честный bounded failure, не бесконечный цикл.
 */

import type {
  BoundedRunConfig,
  BoundedRunPhase,
  BoundedRunState,
  RunStepOutcome,
  ProposedStep,
} from './types';

export const DEFAULT_MAX_TIME_MS = 60_000; // 60 секунд
export const DEFAULT_MAX_ITERATIONS = 10;

export interface StepRunner {
  /** Выполнить один шаг сценария. Возвращает outcome. */
  runStep(step: ProposedStep, signal: { stopped: () => boolean }): Promise<RunStepOutcome>;
}

export interface BoundedRunnerOptions {
  config?: Partial<BoundedRunConfig>;
  /** Шаги, заранее подтверждённые оператором (run-scope). */
  approvedStepIds?: string[];
  runner: StepRunner;
  /** Уведомить об изменении состояния (для UI). */
  onChange?: (state: BoundedRunState) => void;
}

export class BoundedRunner {
  private config: BoundedRunConfig;
  private approvedStepIds: Set<string>;
  private runner: StepRunner;
  private onChange?: (state: BoundedRunState) => void;

  private state: BoundedRunState;
  private stopRequested = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: BoundedRunnerOptions) {
    this.config = {
      maxTimeMs: opts.config?.maxTimeMs ?? DEFAULT_MAX_TIME_MS,
      maxIterations: opts.config?.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      approvedStepIds: opts.approvedStepIds ?? [],
    };
    this.approvedStepIds = new Set(this.config.approvedStepIds);
    this.runner = opts.runner;
    this.onChange = opts.onChange;

    this.state = {
      phase: 'idle',
      currentIteration: 0,
      maxIterations: this.config.maxIterations,
      startedAt: 0,
      elapsedMs: 0,
      outcomes: [],
    };
  }

  getState(): BoundedRunState {
    return this.state;
  }

  isRunning(): boolean {
    return this.state.phase === 'running' || this.state.phase === 'awaiting_approval';
  }

  /** Запросить остановку. Процесс завершится после текущего шага. */
  stop(): void {
    if (!this.isRunning()) return;
    this.stopRequested = true;
    this.setState({ ...this.state, phase: 'stopped' });
  }

  /** Проверить: входит ли шаг в подтверждённый run-scope. */
  isStepApproved(stepId: string): boolean {
    return this.approvedStepIds.has(stepId);
  }

  /** Добавить шаг в run-scope (отдельное явное подтверждение оператором). */
  approveStep(stepId: string): void {
    this.approvedStepIds.add(stepId);
  }

  /** Запустить bounded run по предложению. */
  async run(steps: ProposedStep[]): Promise<BoundedRunState> {
    if (this.isRunning()) {
      throw new Error('BoundedRunner is already running');
    }

    this.stopRequested = false;
    this.state = {
      phase: 'running',
      currentIteration: 0,
      maxIterations: this.config.maxIterations,
      startedAt: Date.now(),
      elapsedMs: 0,
      outcomes: [],
    };
    this.emit();

    this.timer = setTimeout(() => {
      // Лимит времени исчерпан → bounded failure
      this.stopRequested = true;
      this.setState({
        ...this.state,
        phase: 'bounded_failure',
        failureReason: `Превышен лимит времени (${this.config.maxTimeMs}ms)`,
      });
    }, this.config.maxTimeMs);

    try {
      for (const step of steps) {
        if (this.stopRequested) break;

        // Каждый шаг вне run-scope требует подтверждения (awaiting_approval)
        if (!this.isStepApproved(step.id)) {
          this.setState({ ...this.state, phase: 'awaiting_approval' });
          // Ждём подтверждения или Stop — внешний цикл вызовет approveStep + continue
          // Для PoC: пропускаем шаг как требующий отдельного подтверждения.
          // Engine сам управляет подтверждениями; здесь фиксируем границу.
          break;
        }

        if (this.state.currentIteration >= this.config.maxIterations) {
          this.setState({
            ...this.state,
            phase: 'bounded_failure',
            failureReason: `Превышен лимит итераций (${this.config.maxIterations})`,
          });
          break;
        }

        const outcome = await this.runner.runStep(step, {
          stopped: () => this.stopRequested,
        });

        this.state = {
          ...this.state,
          currentIteration: this.state.currentIteration + 1,
          elapsedMs: Date.now() - this.state.startedAt,
          outcomes: [...this.state.outcomes, outcome],
        };
        this.emit();

        if (this.stopRequested) {
          this.setState({ ...this.state, phase: 'stopped' });
          break;
        }

        if (!outcome.ok) {
          // Честный провал шага — не бесконечный цикл
          this.setState({
            ...this.state,
            phase: 'done',
          });
          break;
        }
      }

      // Если дошли до конца без stop/failure → done
      if (this.state.phase === 'running' && !this.stopRequested) {
        this.setState({ ...this.state, phase: 'done' });
      }
    } finally {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    }

    return this.state;
  }

  private setState(next: BoundedRunState): void {
    this.state = next;
    this.emit();
  }

  private emit(): void {
    this.onChange?.(this.state);
  }
}

/** Фабрика runner'а из простых функций (для тестов / PoC). */
export function makeStepRunner(
  fn: (step: ProposedStep) => Promise<RunStepOutcome>,
): StepRunner {
  return {
    runStep: (step) => fn(step),
  };
}
