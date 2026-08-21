/**
 * Live/hooks meta helpers for ResultsWorkspace (S3776 extract).
 */
import type { LaunchFault } from './launchUi';
import type { PipelineVerdict } from './pipelineVerdict';
import type { LiveMetaSnapshot, ResultsHooksSnapshot, RunStatus } from './types';

export type HubTone = 'live' | 'idle' | 'ready' | 'pending';

export function mapLiveStatus(raw: string | undefined): RunStatus {
  const s = (raw || '').toLowerCase();
  if (!s || s === 'idle' || s === 'waiting') return 'idle';
  if (s === 'running' || s === 'live' || s === 'active') return 'running';
  if (s === 'success' || s === 'ok' || s === 'passed' || s === 'done' || s === 'finished') {
    return 'success';
  }
  if (s === 'failed' || s === 'fail' || s === 'error') return 'failed';
  return 'unknown';
}

export function verdictLabel(verdict: PipelineVerdict, fault: LaunchFault | null): string {
  if (fault === 'start_failed') {
    return 'Ошибка запуска';
  }
  if (fault === 'timeout') {
    return 'Таймаут ожидания';
  }
  switch (verdict) {
    case 'running':
      return 'Выполняется';
    case 'pass':
      return 'Успех';
    case 'pass_watch':
      return 'Успех с замечаниями';
    case 'pass_edge':
      return 'Успех на кромке риска';
    case 'fail_gate':
      return 'Quality gate не пройден';
    case 'fail_run':
      return 'Задача упала';
    default:
      return 'Нет активного пайплайна';
  }
}

export async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function isVncLive(status: RunStatus): boolean {
  return status === 'running';
}

export function shellTone(meta: LiveMetaSnapshot | null): HubTone {
  return meta ? 'live' : 'idle';
}

export function hookTone(reportUrl: string | undefined): HubTone {
  return reportUrl ? 'ready' : 'pending';
}

/** Absolute http(s) only — garbage / javascript: must not green Results tiles. */
export function isHttpReportUrl(url: string | undefined | null): boolean {
  if (typeof url !== 'string') return false;
  const cleaned = url.trim();
  if (!cleaned) return false;
  const lower = cleaned.toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://');
}

export function hookReportUrl(
  hooks: ResultsHooksSnapshot | null,
  key: 'allure' | 'dojo',
): string | undefined {
  const entry = hooks?.[key];
  const url = entry?.report_url;
  if (typeof url !== 'string') return undefined;
  const cleaned = url.trim();
  return isHttpReportUrl(cleaned) ? cleaned : undefined;
}
