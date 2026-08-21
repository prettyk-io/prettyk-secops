/**
 * Status card line content for Results pipeline (S3776).
 */
import type { ReactNode } from 'react';
import type { LaunchFault } from './launchUi';
import type { PipelineJobStatus } from './pipelineVerdict';
import { verdictLabel } from './resultsLiveMeta';

export function pipelineStatusLineContent(
  pipeline: PipelineJobStatus,
  launchFault: LaunchFault | null,
): ReactNode {
  if (launchFault) {
    const faultHint =
      launchFault === 'start_failed'
        ? ' — пайплайн не создался или Live недоступен'
        : ' — нет завершения в срок';
    return (
      <>
        <strong>{verdictLabel(pipeline.verdict, launchFault)}</strong>
        {faultHint}
      </>
    );
  }
  if (pipeline.verdict === 'running') {
    return (
      <>
        Выполняется задача: <strong>{pipeline.job_name?.trim() || '—'}</strong>
      </>
    );
  }
  if (pipeline.verdict === 'idle') {
    return <>{verdictLabel(pipeline.verdict, null)}</>;
  }
  return (
    <>
      Задача: <strong>{pipeline.job_name?.trim() || '—'}</strong>
      {' · '}
      {verdictLabel(pipeline.verdict, null)}
    </>
  );
}
