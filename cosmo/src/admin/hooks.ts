/**
 * VN-ADM hooks — useLiveStatus / useDojoStats / useStandHealth / useRunsIndex.
 * Polling API Live с таймером; при сбое отдаётся «down» — никаких выдуманных нулей.
 */
import { useEffect, useState } from 'react';
import {
  fetchDojoSeverity,
  fetchLiveMeta,
  fetchRunsIndex,
  fetchSeverityTrend,
  probeServiceHealth,
  type DojoSeverityEnvelope,
  type RunIndexRow,
  type ServiceHealth,
  type SeverityStats,
  type SeverityTrendPoint,
  type StandStatus,
} from './adminApi';

const DEFAULT_POLL_MS = 5000;

function usePolled<T>(loader: () => Promise<T>, fallback: T, pollMs = DEFAULT_POLL_MS): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      loader().then((v) => {
        if (!cancelled) {
          setValue(v);
        }
      });
    load().catch(() => undefined);
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // loader — стабильная ссылка из модуля; pollMs фиксирован на время жизни.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs]);
  return value;
}

/** Статус стенда (PrettyK Live) из /api/meta. down → "Нет данных". */
export function useLiveStatus(pollMs = DEFAULT_POLL_MS): StandStatus {
  return usePolled(() => fetchLiveMeta(), { ok: false, status: 'down', hasLive: false }, pollMs);
}

/** ACTIVE severity по project_id (через /api/dojo/severity). down → stats null. */
export function useDojoStats(
  projectId: string,
  pollMs = DEFAULT_POLL_MS,
): DojoSeverityEnvelope {
  return usePolled(
    () => fetchDojoSeverity(projectId),
    { ok: false, status: 'down', project_id: projectId, stats: null, series: [] },
    pollMs,
  );
}

/** Ручной/по запросу health ZAP/Dojo/Allure (+ Live). */
export function useStandHealth(pollMs = DEFAULT_POLL_MS): ServiceHealth[] {
  return usePolled(
    () => probeServiceHealth(),
    [
      { key: 'live', label: 'PrettyK Live', up: false, detail: '—' },
      { key: 'dojo', label: 'DefectDojo', up: false, detail: '—' },
      { key: 'allure', label: 'Allure', up: false, detail: '—' },
    ],
    pollMs,
  );
}

/** Реестр прогонов (последние N). down → [] (⇒ "Нет данных" в UI). */
export function useRunsIndex(limit = 200, pollMs = DEFAULT_POLL_MS): RunIndexRow[] {
  return usePolled(() => fetchRunsIndex(limit), [], pollMs);
}

/** Тренд severity + Allure pass-rate. */
export function useSeverityTrend(pollMs = DEFAULT_POLL_MS): SeverityTrendPoint[] {
  return usePolled(() => fetchSeverityTrend(), [], pollMs);
}

export type { SeverityStats, SeverityTrendPoint };
