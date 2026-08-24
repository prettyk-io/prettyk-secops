/**
 * Results launch UI: act gate, restart visibility, timeout/error.
 */

import type { PipelineVerdict } from './pipelineVerdict';

/** Terminal pipe outcomes — restart becomes available. */
export const PIPELINE_TERMINAL_VERDICTS: ReadonlySet<PipelineVerdict> = new Set([
  'pass',
  'pass_watch',
  'pass_edge',
  'fail_gate',
  'fail_run',
]);

/** IB-axis terminal outcomes — акт допустим (в т.ч. fail_gate). */
export const ADMISSION_AXIS_READY_VERDICTS: ReadonlySet<PipelineVerdict> = new Set([
  'pass',
  'pass_watch',
  'pass_edge',
  'fail_gate',
]);

export type LaunchFault = 'start_failed' | 'timeout';

/** Allure + Dojo report hook URLs both arrived (Live `/api/results/hooks`). */
export function areReportHooksReady(
  allureReportUrl: string | undefined,
  dojoReportUrl: string | undefined,
): boolean {
  return Boolean(allureReportUrl?.trim() && dojoReportUrl?.trim());
}

/** Кнопка акта в DOM только когда манифест/meta просит формировать акт. */
export function isActDisplayed(generateAct: boolean | undefined | null): boolean {
  return generateAct === true;
}

/**
 * Ось допуска авторитетна (не VOID / не crash / не idle).
 * true: pass | pass_watch | pass_edge | fail_gate (exit 2 — валидный акт).
 */
export function isAdmissionAxisReady(input: {
  verdict: PipelineVerdict;
  exitCode?: number | null;
  admissionVoid?: boolean;
  launchFault?: LaunchFault | null;
}): boolean {
  if (input.launchFault === 'start_failed' || input.launchFault === 'timeout') {
    return false;
  }
  if (input.admissionVoid === true) {
    return false;
  }
  if (input.exitCode === 1) {
    return false;
  }
  if (input.verdict === 'fail_run' || input.verdict === 'idle' || input.verdict === 'running') {
    return false;
  }
  return ADMISSION_AXIS_READY_VERDICTS.has(input.verdict);
}

/** Act unlock: displayed + IB axis ready + hooks + handler. */
export function isActDownloadEnabled(input: {
  onDownloadAct: unknown;
  allureReportUrl: string | undefined;
  dojoReportUrl: string | undefined;
  generateAct: boolean | undefined | null;
  admissionAxisReady: boolean;
}): boolean {
  return (
    isActDisplayed(input.generateAct) &&
    input.admissionAxisReady &&
    Boolean(input.onDownloadAct) &&
    areReportHooksReady(input.allureReportUrl, input.dojoReportUrl)
  );
}

/** Restart: after any completed pipe status, or launch create/timeout fault. */
export function shouldShowRestart(
  verdict: PipelineVerdict,
  fault: LaunchFault | null,
): boolean {
  if (fault === 'start_failed' || fault === 'timeout') {
    return true;
  }
  return PIPELINE_TERMINAL_VERDICTS.has(verdict);
}

export function isPipelineRunning(verdict: PipelineVerdict): boolean {
  return verdict === 'running';
}

/** Lab runner или CI «идёт» — Запустить держим disabled до terminal/exit. */
export function isResultsLaunchLocked(input: {
  launchStarting: boolean;
  awaitingStart: boolean;
  verdict: PipelineVerdict;
  labRunPhase?: string | null;
}): boolean {
  if (input.launchStarting || input.awaitingStart) {
    return true;
  }
  if (input.verdict === 'running') {
    return true;
  }
  const lab = (input.labRunPhase || '').toLowerCase();
  return lab === 'running';
}

/** Остановить: только пока реально идёт spawn/прогон. */
export function isResultsStopVisible(input: {
  launchStarting: boolean;
  awaitingStart: boolean;
  verdict: PipelineVerdict;
  labRunPhase?: string | null;
}): boolean {
  if (input.verdict === 'running') {
    return true;
  }
  const lab = (input.labRunPhase || '').toLowerCase();
  if (lab === 'running') {
    return true;
  }
  return input.launchStarting || input.awaitingStart;
}
