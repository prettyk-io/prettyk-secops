/**
 * ADM-E5: honest probe summary — HTTP vs non-probed connectors.
 */

import type { AirgapConnectors, ConnectorHealth } from './types';

export type ProbeLane = 'http' | 'skipped';

export type ProbeConnectorRow = {
  id: string;
  lane: ProbeLane;
  health: ConnectorHealth;
  note?: string;
};

export type ProbeReport = {
  at: string;
  rows: ProbeConnectorRow[];
  /** One-line operator summary (RU). */
  summary: string;
};

export function buildProbeReport(
  before: AirgapConnectors,
  after: AirgapConnectors,
  at: string = new Date().toISOString(),
  authNotes: Readonly<Record<string, string>> = {},
): ProbeReport {
  const rows: ProbeConnectorRow[] = [
    {
      id: 'allure',
      lane: 'http',
      health: after.allure_health,
      note: authNotes.allure,
    },
    {
      id: 'dojo',
      lane: 'http',
      health: after.dojo_health,
      note: authNotes.dojo,
    },
    {
      id: 'prom',
      lane: 'http',
      health: after.prom_health,
      note: authNotes.prom,
    },
    {
      id: 'siem',
      lane: 'http',
      health: after.siem_health,
      note: authNotes.siem || (before.siem_url.trim() ? undefined : 'URL пуст'),
    },
    {
      id: 'db',
      lane: 'skipped',
      health: after.db_health,
      note: 'нет сетевого probe (DSN/агент)',
    },
    {
      id: 'ssh',
      lane: 'skipped',
      health: after.ssh_health,
      note: 'нет сетевого probe',
    },
    {
      id: 'mq',
      lane: 'skipped',
      health: after.mq_health,
      note: 'нет сетевого probe',
    },
  ];

  const httpBits = rows
    .filter((r) => r.lane === 'http')
    .map((r) =>
      r.note?.includes('auth')
        ? `${r.id}=ok(auth)`
        : `${r.id}=${r.health}`,
    )
    .join(', ');
  const summary = `HTTP: ${httpBits || '—'}. DB/SSH/MQ не зондировались (unknown). CORS/lab может дать degraded/down.`;

  return { at, rows, summary };
}

/** After HTTP probe: force non-HTTP lanes to unknown (no stale ok). */
export function applySkippedHealthHonesty(next: AirgapConnectors): AirgapConnectors {
  return {
    ...next,
    db_health: 'unknown',
    ssh_health: 'unknown',
    mq_health: 'unknown',
  };
}
