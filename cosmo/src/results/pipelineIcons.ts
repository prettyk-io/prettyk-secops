/**
 * Иконки статуса пайплайна в шапке (NAV / RES launch).
 */

import pipelineFail from '../assets/icons/pipeline-fail.png';
import pipelinePassWatch from '../assets/icons/pipeline-pass-watch.png';
import pipelineRunning from '../assets/icons/pipeline-running.png';
import pipelineStart from '../assets/icons/pipeline-start.png';
import pipelineSuccess from '../assets/icons/pipeline-success.png';
import type { PipelineVerdict } from './pipelineVerdict';

export const PIPELINE_ICON_START = pipelineStart;
export const PIPELINE_ICON_RUNNING = pipelineRunning;
export const PIPELINE_ICON_SUCCESS = pipelineSuccess;
export const PIPELINE_ICON_PASS_WATCH = pipelinePassWatch;
export const PIPELINE_ICON_FAIL = pipelineFail;

export function pipelineIconForVerdict(verdict: PipelineVerdict): string {
  switch (verdict) {
    case 'running':
      return PIPELINE_ICON_RUNNING;
    case 'pass':
      return PIPELINE_ICON_SUCCESS;
    case 'pass_watch':
    case 'pass_edge':
      return PIPELINE_ICON_PASS_WATCH;
    case 'fail_gate':
    case 'fail_run':
      return PIPELINE_ICON_FAIL;
    default:
      return PIPELINE_ICON_START;
  }
}

export function pipelineIconHint(verdict: PipelineVerdict): string {
  switch (verdict) {
    case 'running':
      return 'Пайплайн выполняется';
    case 'pass':
      return 'Пайплайн успешен';
    case 'pass_watch':
    case 'pass_edge':
      return 'Pass с оговорками';
    case 'fail_gate':
      return 'Quality gate не пройден';
    case 'fail_run':
      return 'Пайплайн упал';
    default:
      return 'Запустить пайплайн (сначала валидация конструкторов)';
  }
}
