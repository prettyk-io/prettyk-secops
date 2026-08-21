import { describe, expect, it } from 'vitest';
import { headerPipelineDisplay } from './headerPipelineDisplay';

describe('headerPipelineDisplay', () => {
  it('shows waiting only while starting / lab / CI running', () => {
    expect(
      headerPipelineDisplay({
        starting: true,
        ciVerdict: 'idle',
      }),
    ).toEqual({ busy: true, display: 'running' });
    expect(
      headerPipelineDisplay({
        starting: false,
        labPhase: 'running',
        ciVerdict: 'fail_run',
      }),
    ).toEqual({ busy: true, display: 'running' });
    expect(
      headerPipelineDisplay({
        starting: false,
        labPhase: 'finished',
        ciVerdict: 'running',
      }),
    ).toEqual({ busy: true, display: 'running' });
  });

  it('resets to idle on any terminal exit', () => {
    for (const ciVerdict of [
      'pass',
      'pass_watch',
      'pass_edge',
      'fail_gate',
      'fail_run',
      'idle',
    ] as const) {
      expect(
        headerPipelineDisplay({
          starting: false,
          labPhase: 'finished',
          ciVerdict,
        }),
      ).toEqual({ busy: false, display: 'idle' });
    }
  });
});
