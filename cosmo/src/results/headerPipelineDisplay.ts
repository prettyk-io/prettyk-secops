/**
 * Header «Старт»: только idle ↔ waiting. Terminal-вердикты на кнопку не красим.
 */
import type { PipelineVerdict } from './pipelineVerdict';

export type HeaderPipelineDisplay = {
  busy: boolean;
  display: 'idle' | 'running';
};

export function headerPipelineDisplay(input: {
  starting: boolean;
  labPhase?: string | null;
  ciVerdict: PipelineVerdict;
}): HeaderPipelineDisplay {
  const lab = (input.labPhase || '').toLowerCase();
  const busy =
    input.starting || lab === 'running' || input.ciVerdict === 'running';
  return { busy, display: busy ? 'running' : 'idle' };
}
