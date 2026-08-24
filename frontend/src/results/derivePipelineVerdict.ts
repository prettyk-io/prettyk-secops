/**
 * derivePipelineVerdict branches (S3776).
 */
import type { PipelineRiskHints, PipelineVerdict, PipelineVerdictInput } from './pipelineVerdict';

const SOFT_SEVERITIES = new Set(['medium', 'low', 'info', 'informational']);

function norm(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

function isFailRun(
  conclusion: string,
  exitCode: number | null,
  gate: string,
  hints: PipelineRiskHints | null,
): boolean {
  if (
    conclusion === 'failure' ||
    conclusion === 'cancelled' ||
    conclusion === 'timed_out' ||
    exitCode === 1 ||
    gate === 'error'
  ) {
    return true;
  }
  if (gate === 'void') {
    // DBG: exit 0 + VOID — операторский прогон, не сбой исполнения.
    if (
      exitCode === 0 &&
      (hints?.admission_void === true || hints?.debug_mode === true)
    ) {
      return false;
    }
    return true;
  }
  return false;
}

function passVerdictFromHints(hints: PipelineRiskHints | null): PipelineVerdict {
  if (hints?.elevated === true) {
    return 'pass_edge';
  }
  const highest = norm(hints?.highest_severity);
  if (highest && SOFT_SEVERITIES.has(highest)) {
    return 'pass_watch';
  }
  const counts = hints?.counts ?? {};
  const softCount =
    Number(counts.medium || 0) + Number(counts.low || 0) + Number(counts.info || 0);
  if (softCount > 0) {
    return 'pass_watch';
  }
  return 'pass';
}

export function computePipelineVerdict(input: PipelineVerdictInput): PipelineVerdict {
  const phase = norm(input.phase);
  const conclusion = norm(input.conclusion);
  const gate = norm(input.gate);
  const exitCode =
    typeof input.exit_code === 'number' && Number.isFinite(input.exit_code)
      ? input.exit_code
      : null;
  const hints = input.risk_hints ?? null;

  if (phase === 'queued' || phase === 'in_progress') {
    return 'running';
  }
  if (isFailRun(conclusion, exitCode, gate, hints)) {
    return 'fail_run';
  }
  if (exitCode === 2 || gate === 'fail') {
    return 'fail_gate';
  }

  const completedOk =
    phase === 'completed' ||
    conclusion === 'success' ||
    exitCode === 0 ||
    gate === 'pass';

  if (!completedOk && phase === '' && conclusion === '' && exitCode === null && gate === '') {
    return 'idle';
  }
  if (completedOk || exitCode === 0) {
    return passVerdictFromHints(hints);
  }
  return 'idle';
}
