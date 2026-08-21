/**
 * Extra lines under Results pipeline status (S3776).
 */
import { Typography } from 'antd';
import { dualAxisChrome } from './dualAxisChrome';
import type { LaunchFault } from './launchUi';
import type { PipelineJobStatus } from './pipelineVerdict';

export function ResultsPipelineExtras(props: {
  pipeline: PipelineJobStatus;
  launchFault: LaunchFault | null;
  jobUrl: string | undefined;
  session: string;
}): React.JSX.Element {
  const { pipeline, launchFault, jobUrl, session } = props;
  const showJobLink =
    Boolean(jobUrl) &&
    !launchFault &&
    (pipeline.verdict === 'fail_run' ||
      pipeline.verdict === 'fail_gate' ||
      pipeline.verdict === 'running');
  const axes =
    !launchFault && pipeline.verdict !== 'idle'
      ? dualAxisChrome({
          verdict: pipeline.verdict,
          exitCode: pipeline.exit_code,
          gate: pipeline.gate,
          countsSource: pipeline.counts_source,
          admissionVoid: pipeline.risk_hints?.admission_void === true,
          executionFaultKind: pipeline.risk_hints?.execution_fault_kind,
          debugMode: pipeline.risk_hints?.debug_mode === true,
        })
      : null;
  return (
    <>
      {axes ? (
        <Typography.Text
          type="secondary"
          className="pk-results-pipeline-axes"
          data-testid="results-dual-axis"
        >
          {axes.execution}
          {' · '}
          {axes.admission}
          {axes.countsSource ? ` · ${axes.countsSource}` : ''}
        </Typography.Text>
      ) : null}
      {pipeline.job_description?.trim() && !launchFault ? (
        <Typography.Text type="secondary" className="pk-results-pipeline-desc">
          {pipeline.job_description.trim()}
        </Typography.Text>
      ) : null}
      {showJobLink ? (
        <Typography.Link href={jobUrl} target="_blank" rel="noreferrer">
          Открыть job
        </Typography.Link>
      ) : null}
      {pipeline.recommendations && pipeline.recommendations.length > 0 ? (
        <Typography.Text type="secondary">
          Рекомендаций для акта: {pipeline.recommendations.length}
        </Typography.Text>
      ) : null}
      <Typography.Text type="secondary">Сессия: {session}</Typography.Text>
    </>
  );
}
