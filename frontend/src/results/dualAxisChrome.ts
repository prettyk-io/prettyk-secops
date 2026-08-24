/**
 * QG-AF-13: cheap dual-axis labels under Results pipeline status.
 */
import type { PipelineVerdict } from './pipelineVerdict';

export type DualAxisChrome = {
  execution: string;
  admission: string;
  countsSource: string | null;
};

export function countsSourceLabel(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  switch (raw.trim()) {
    case 'dojo_stats':
      return 'Dojo ACTIVE (stats)';
    case 'dojo_findings':
      return 'Dojo ACTIVE (findings)';
    case 'zap':
      return 'ZAP fallback';
    default:
      return raw.trim();
  }
}

export function dualAxisChrome(input: {
  verdict: PipelineVerdict;
  exitCode?: number | null;
  gate?: string | null;
  countsSource?: unknown;
  admissionVoid?: boolean;
  executionFaultKind?: string | null;
  debugMode?: boolean;
}): DualAxisChrome {
  const exit = input.exitCode;
  const gate = (input.gate || '').trim().toLowerCase();
  const kind = (input.executionFaultKind || '').trim().toLowerCase();
  const admissionVoid =
    input.admissionVoid === true ||
    input.verdict === 'fail_run' ||
    exit === 1 ||
    gate === 'void' ||
    gate === 'error';

  let execution = 'Исполнение: —';
  if (input.verdict === 'running') {
    execution = 'Исполнение: в процессе';
  } else if (input.verdict === 'fail_run' || exit === 1) {
    execution =
      kind === 'webdriver'
        ? 'Исполнение: сбой WebDriver/Selenium (exit 1)'
        : 'Исполнение: сбой (exit 1)';
  } else if (typeof exit === 'number') {
    execution = 'Исполнение: завершено';
  } else if (input.verdict !== 'idle') {
    execution = 'Исполнение: завершено';
  }

  let admission = 'Допуск: —';
  if (admissionVoid) {
    admission =
      input.debugMode === true
        ? 'Допуск: недействителен (режим отладки)'
        : 'Допуск: недействителен';
  } else if (input.verdict === 'fail_gate' || gate === 'fail') {
    admission = 'Допуск: не пройден';
  } else if (input.verdict === 'pass_watch' || input.verdict === 'pass_edge') {
    admission = 'Допуск: с замечаниями';
  } else if (input.verdict === 'pass') {
    admission = 'Допуск: пройден';
  } else if (input.verdict === 'running') {
    admission = 'Допуск: ожидание';
  }

  return {
    execution,
    admission,
    countsSource: countsSourceLabel(input.countsSource),
  };
}
