import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPipelineStart } from './appPipelineStart';

describe('runPipelineStart', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears hooks then startRun (no fake glow)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const startRun = vi.fn().mockResolvedValue({ ok: true, run_id: 'r1', pid: 1 });
    const onRunStarted = vi.fn();
    const onBeginAwaitStart = vi.fn();
    await runPipelineStart({
      pipelineStarting: false,
      setPipelineStarting: vi.fn(),
      gateConstructorsOrPenguin: async () => true,
      runValidation: () => [],
      isStudioView: () => false,
      switchToForm: vi.fn(),
      markValidationFailed: vi.fn(),
      markValidationPassed: vi.fn(),
      isCheckEmpty: () => false,
      onCheckEmpty: vi.fn(),
      getFormData: () => ({ meta: { name: 'x' }, test_suites: { scenarios: [{ scenario_name: 's1', steps: [{ constructor: 'Лог "ok"' }] }] } }),
      startRun,
      switchToResults: vi.fn(),
      onBeginAwaitStart,
      onSchemaBlocked: vi.fn(),
      onRunStarted,
      onRunBlocked: vi.fn(),
      schemaFeedback: () => ({
        title: 't',
        description: 'd',
        errorCount: 0,
        samples: [],
        samplesHint: '',
      }),
    });
    expect(fetchMock).toHaveBeenCalled();
    const clearBody = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    );
    expect(clearBody).toEqual({ clear: true });
    expect(onBeginAwaitStart).toHaveBeenCalledOnce();
    expect(startRun).toHaveBeenCalledOnce();
    expect(onRunStarted).toHaveBeenCalledWith('r1', undefined);
  });

  it('blocks on empty check before constructor gate or schema validation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const startRun = vi.fn();
    const gateConstructorsOrPenguin = vi.fn().mockResolvedValue(true);
    const runValidation = vi.fn().mockReturnValue([]);
    const onCheckEmpty = vi.fn();

    await runPipelineStart({
      pipelineStarting: false,
      setPipelineStarting: vi.fn(),
      gateConstructorsOrPenguin,
      runValidation,
      isStudioView: () => true,
      switchToForm: vi.fn(),
      markValidationFailed: vi.fn(),
      markValidationPassed: vi.fn(),
      isCheckEmpty: () => true,
      onCheckEmpty,
      getFormData: () => ({}),
      startRun,
      switchToResults: vi.fn(),
      onSchemaBlocked: vi.fn(),
      onRunStarted: vi.fn(),
      onRunBlocked: vi.fn(),
      schemaFeedback: () => ({
        title: 't',
        description: 'd',
        errorCount: 0,
        samples: [],
        samplesHint: '',
      }),
    });

    expect(onCheckEmpty).toHaveBeenCalledOnce();
    expect(gateConstructorsOrPenguin).not.toHaveBeenCalled();
    expect(runValidation).not.toHaveBeenCalled();
    expect(startRun).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
