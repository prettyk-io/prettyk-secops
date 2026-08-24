import { describe, expect, it } from 'vitest';
import {
  PIPELINE_ICON_FAIL,
  PIPELINE_ICON_PASS_WATCH,
  PIPELINE_ICON_RUNNING,
  PIPELINE_ICON_START,
  PIPELINE_ICON_SUCCESS,
  pipelineIconForVerdict,
} from './pipelineIcons';

describe('pipelineIconForVerdict', () => {
  it('мапит статусы на иконки', () => {
    expect(pipelineIconForVerdict('idle')).toBe(PIPELINE_ICON_START);
    expect(pipelineIconForVerdict('running')).toBe(PIPELINE_ICON_RUNNING);
    expect(pipelineIconForVerdict('pass')).toBe(PIPELINE_ICON_SUCCESS);
    expect(pipelineIconForVerdict('pass_watch')).toBe(PIPELINE_ICON_PASS_WATCH);
    expect(pipelineIconForVerdict('pass_edge')).toBe(PIPELINE_ICON_PASS_WATCH);
    expect(pipelineIconForVerdict('fail_gate')).toBe(PIPELINE_ICON_FAIL);
    expect(pipelineIconForVerdict('fail_run')).toBe(PIPELINE_ICON_FAIL);
  });
});
