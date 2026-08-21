/**
 * Единые базовые адреса API (B4).
 * - Playground (`:8765`) — run-start/eval/validate. В dev ходим через Vite proxy `/api`, на проде через Apache `/api`.
 * - Live (`:8767`) — метрики/статус/журнал/hooks.
 * Автодетект: на localhost/127.0.0.1 используем прямые порты (http://127.0.0.1:8767 и :8765),
 * на проде (prettyk.io / non-localhost) используем относительные пути без обращения к клиентскому loopback (PNA/Mixed Content protection).
 */

export function isLocalHost(): boolean {
  if (typeof window === 'undefined') return true;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local');
}

const ENV_PLAYGROUND = import.meta.env.VITE_PLAYGROUND_BASE as string | undefined;
const ENV_LIVE = import.meta.env.VITE_LIVE_BASE as string | undefined;

/** Playground editor API (run/eval/validate). Через Vite proxy `/api` в dev, через Apache proxy на проде. */
export const API_BASE: string = ENV_PLAYGROUND?.trim() || '';

/** Live server (:8767) — метрики, статус, журнал, hooks. */
export const LIVE_BASE: string =
  ENV_LIVE?.trim() || (isLocalHost() ? 'http://127.0.0.1:8767' : '');

/** Lab runner base (:8765) для прямого поллинга статуса прогона. */
export const LAB_RUN_BASE: string =
  ENV_PLAYGROUND?.trim() || (isLocalHost() ? 'http://127.0.0.1:8765' : '');

/** Playground run-start / run-stop endpoints. */
export const RUN_START_URL: string = `${API_BASE}/api/run/start`;
export const RUN_STOP_URL: string = `${API_BASE}/api/run/stop`;
export const LAB_RUN_STATUS_URL: string = `${LAB_RUN_BASE}/api/run/status`;

/** Checks registry endpoint. */
export const CHECKS_API_URL: string = `${API_BASE}/api/checks`;

/** Live endpoints (метрики/статус). */
export const LIVE_META_URL = `${LIVE_BASE}/api/meta`;
export const LIVE_HOOKS_URL = `${LIVE_BASE}/api/results/hooks`;
export const LIVE_JOURNAL_URL = `${LIVE_BASE}/api/journal/latest`;
export const LIVE_TREND_URL = `${LIVE_BASE}/api/summary/trend`;
export const LIVE_SUMMARY_URL = `${LIVE_BASE}/api/summary/latest`;
export const LIVE_RUN_SUMMARY_URL = `${LIVE_BASE}/api/run_summary/latest`;
export const LIVE_PACKAGE_URL = `${LIVE_BASE}/api/package/latest`;
export const LIVE_CI_URL = `${LIVE_BASE}/api/ci/status`;
export const LIVE_EVIDENCE_URL = `${LIVE_BASE}/api/evidence`;
export const LIVE_GATE_POLICY_URL = `${LIVE_BASE}/api/gate/policy`;
export const LIVE_RETENTION_POLICY_URL = `${LIVE_BASE}/api/retention/policy`;
export const LIVE_DOJO_PROGRAM_URL = `${LIVE_BASE}/api/dojo/program`;
export const LIVE_DOJO_FINDINGS_URL = `${LIVE_BASE}/api/dojo/findings`;
export const LIVE_HOME = LIVE_BASE ? `${LIVE_BASE}/` : '/';
