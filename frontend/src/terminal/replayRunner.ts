/**
 * BBA-FE-2: структурированный Replay Runner.
 *
 * Выносит цикл исполнения шагов сценария из сырых inline-циклов
 * (`doPlay` в BrowserStage/BrowserPanel) в чистую, тестируемую функцию.
 *
 * Гарантии:
 *   - статус каждого шага отслеживается: idle → running → passed | failed;
 *   - ошибка шага НЕ «глотается» — возвращается статус failed + сообщение;
 *   - сценарий останавливается на первой ошибке (если не `continueOnError`);
 *   - отмена (AbortSignal) прерывает и задержки между шагами, и Wait.
 */
import type { ScenarioStepModel } from '../studio/scenarioStepModel';

export type ReplayStepStatus = 'idle' | 'running' | 'passed' | 'failed';

export interface ReplayStepState {
  stepId: string;
  index: number;
  status: ReplayStepStatus;
  error?: string;
  /** BBA-FE-3: base64 PNG-скриншот, снятый бэкендом при ошибке шага. */
  screenshotB64?: string;
  /** Бэкенд-замер длительности шага (ms). */
  durationMs?: number;
}

export interface StepExecutionResult {
  ok: boolean;
  error?: string;
  /** BBA-FE-3: base64 PNG-скриншот при сбое шага. */
  screenshotB64?: string;
  /** Бэкенд-замер длительности шага (ms). */
  durationMs?: number;
}

/** Исполнитель одного шага (инъекция зависимости для чистых юнит-тестов). */
export type StepExecutor = (
  step: ScenarioStepModel,
  signal?: AbortSignal,
) => Promise<StepExecutionResult>;

export interface ReplayOptions {
  signal?: AbortSignal;
  onStepState?: (state: ReplayStepState) => void;
  /** Сценарий-уровневый continueOnError (поверх step.continueOnError). */
  continueOnError?: boolean;
  /** Пауза между шагами, ms. */
  stepDelayMs?: number;
  /** С какого индекса начать (для «Continue» после ошибки). */
  startIndex?: number;
}

export interface ReplayRunResult {
  states: ReplayStepState[];
  aborted: boolean;
  stoppedOnError: boolean;
}

/** Пауза, которую можно прервать через AbortSignal. */
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      if (timer !== null) clearTimeout(timer);
      resolve();
    };
    const onAbort = () => finish();
    signal?.addEventListener('abort', onAbort);
    timer = setTimeout(finish, ms);
  });
}

export async function runReplay(
  steps: ScenarioStepModel[],
  executor: StepExecutor,
  options: ReplayOptions = {},
): Promise<ReplayRunResult> {
  const {
    signal,
    onStepState,
    continueOnError = false,
    stepDelayMs = 800,
    startIndex = 0,
  } = options;

  const states: ReplayStepState[] = [];
  let stoppedOnError = false;

  for (let i = startIndex; i < steps.length; i++) {
    if (signal?.aborted) break;
    const step = steps[i]!;

    const running: ReplayStepState = { stepId: step.id, index: i, status: 'running' };
    states.push(running);
    onStepState?.(running);

    const result = await executor(step, signal);

    // Отменено пользователем — не помечаем шаг как failed.
    if (signal?.aborted) break;

    const done: ReplayStepState = result.ok
      ? { stepId: step.id, index: i, status: 'passed', durationMs: result.durationMs }
      : { stepId: step.id, index: i, status: 'failed', error: result.error, screenshotB64: result.screenshotB64, durationMs: result.durationMs };
    states.push(done);
    onStepState?.(done);

    if (!result.ok && !step.continueOnError && !continueOnError) {
      stoppedOnError = true;
      break;
    }

    if (i < steps.length - 1 && !signal?.aborted) {
      await abortableDelay(stepDelayMs, signal);
    }
  }

  return { states, aborted: !!signal?.aborted, stoppedOnError };
}
