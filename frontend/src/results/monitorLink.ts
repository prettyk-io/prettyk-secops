/**
 * Deep-link в Live-монитор конкретного инстанса проверки.
 * В unified PW-AIRGAP кука летает во всех запросах — bind-токен избыточен.
 */
import { getCheck } from '../checks/checksStore';
import { LIVE_HOME } from '../api/apiBase';

/** URL монитора: `?run_id=&check_id=` для текущего/последнего run инстанса; иначе Live home. */
export function buildMonitorUrl(checkId: string | null | undefined): string {
  const instance = checkId ? getCheck(checkId) : undefined;
  const runs = instance?.runs ?? [];
  const active = runs.find((r) => r.status === 'running') ?? runs[0];
  const runId = active?.run_id ?? '';
  if (!runId) {
    return LIVE_HOME;
  }
  const params = new URLSearchParams({ run_id: runId });
  if (checkId) {
    params.set('check_id', checkId);
  }
  return `${LIVE_HOME}?${params.toString()}`;
}
