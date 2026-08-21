/**
 * Deep-link в Live-монитор конкретного инстанса проверки.
 * MON-13: bind-токен из CheckRunRef (выдан при start_run) — «свой без логина».
 */
import { getCheck } from '../checks/checksStore';
import { LIVE_HOME } from '../api/apiBase';

/** URL монитора: `?run_id=&token=&check_id=` для текущего/последнего run инстанса; иначе Live home. */
export function buildMonitorUrl(checkId: string | null | undefined): string {
  const instance = checkId ? getCheck(checkId) : undefined;
  const runs = instance?.runs ?? [];
  const active = runs.find((r) => r.status === 'running') ?? runs[0];
  const runId = active?.run_id ?? '';
  if (!runId) {
    return LIVE_HOME;
  }
  const params = new URLSearchParams({ run_id: runId });
  const token = active?.monitor_token ?? '';
  if (token) {
    params.set('token', token);
  }
  if (checkId) {
    params.set('check_id', checkId);
  }
  return `${LIVE_HOME}?${params.toString()}`;
}
