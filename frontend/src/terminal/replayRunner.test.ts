/**
 * @vitest-environment node
 * BBA-FE-2: чистые юнит-тесты Replay Runner (без React/DOM).
 */
import { describe, it, expect, vi } from 'vitest';
import { runReplay, abortableDelay } from './replayRunner';
import type { StepExecutor, ReplayStepState, ReplayOptions } from './replayRunner';
import type { ScenarioStepModel } from '../studio/scenarioStepModel';

function step(id: string, overrides?: Partial<ScenarioStepModel>): ScenarioStepModel {
  return {
    id,
    action: 'Click',
    strategy: 'css',
    strategyValue: '#x',
    payload: '',
    continueOnError: false,
    led: 'queued',
    ...overrides,
  };
}

function collect(
  executor: StepExecutor,
  steps: ScenarioStepModel[],
  opts: Partial<ReplayOptions> = {},
) {
  const seen: ReplayStepState[] = [];
  const run = () =>
    runReplay(steps, executor, { onStepState: (s) => seen.push(s), stepDelayMs: 0, ...opts });
  return { seen, run };
}

describe('replayRunner — runReplay', () => {
  it('исполняет все шаги и помечает их passed', async () => {
    const executor = vi.fn(async () => ({ ok: true }));
    const steps = [step('a'), step('b'), step('c')];
    const { seen, run } = collect(executor, steps);

    const result = await run();

    expect(result.aborted).toBe(false);
    expect(result.stoppedOnError).toBe(false);
    expect(executor).toHaveBeenCalledTimes(3);
    expect(seen.filter((s) => s.status === 'passed').map((s) => s.stepId)).toEqual(['a', 'b', 'c']);
  });

  it('останавливается на первой ошибке и возвращает failed + stoppedOnError', async () => {
    const executor = vi
      .fn<StepExecutor>()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'boom' });
    const steps = [step('a'), step('b'), step('c')];
    const { seen, run } = collect(executor, steps);

    const result = await run();

    expect(result.stoppedOnError).toBe(true);
    expect(executor).toHaveBeenCalledTimes(2); // 'c' не исполняется
    const failed = seen.find((s) => s.status === 'failed');
    expect(failed?.stepId).toBe('b');
    expect(failed?.error).toBe('boom');
  });

  it('продолжает после ошибки при step-level continueOnError', async () => {
    const executor = vi
      .fn<StepExecutor>()
      .mockResolvedValueOnce({ ok: false, error: 'soft' })
      .mockResolvedValueOnce({ ok: true });
    const steps = [step('a', { continueOnError: true }), step('b')];
    const { run } = collect(executor, steps);

    const result = await run();

    expect(result.stoppedOnError).toBe(false);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('продолжает после ошибки при scenario-level continueOnError', async () => {
    const executor = vi
      .fn<StepExecutor>()
      .mockResolvedValueOnce({ ok: false, error: 'x' })
      .mockResolvedValueOnce({ ok: true });
    const steps = [step('a'), step('b')];
    const { run } = collect(executor, steps, { continueOnError: true });

    const result = await run();

    expect(result.stoppedOnError).toBe(false);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('startIndex пропускает уже пройденные шаги (Continue)', async () => {
    const executor = vi.fn(async () => ({ ok: true }));
    const steps = [step('a'), step('b'), step('c')];
    const { seen, run } = collect(executor, steps, { startIndex: 1 });

    await run();

    expect(executor).toHaveBeenCalledTimes(2);
    expect(seen.filter((s) => s.status === 'passed').map((s) => s.stepId)).toEqual(['b', 'c']);
  });

  it('прерывается по signal и не помечает отменённый шаг как failed', async () => {
    const controller = new AbortController();
    const executor = vi.fn(async (_step, signal) => {
      if (signal?.aborted) return { ok: true };
      controller.abort();
      return { ok: true };
    });
    const steps = [step('a'), step('b'), step('c')];
    const seen: ReplayStepState[] = [];

    const result = await runReplay(steps, executor, {
      signal: controller.signal,
      onStepState: (s) => seen.push(s),
      stepDelayMs: 0,
    });

    expect(result.aborted).toBe(true);
    expect(seen.some((s) => s.status === 'failed')).toBe(false);
  });
});

describe('replayRunner — abortableDelay', () => {
  it('завершается немедленно при уже aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(abortableDelay(1000, controller.signal)).resolves.toBeUndefined();
  });

  it('разрешается досрочно по abort', async () => {
    const controller = new AbortController();
    let resolved = false;
    const p = abortableDelay(10000, controller.signal).then(() => {
      resolved = true;
    });
    controller.abort();
    await p;
    expect(resolved).toBe(true);
  });
});
