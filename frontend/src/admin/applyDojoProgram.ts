/**
 * ADM-DOJO-2: влить Live Dojo program stats в EvidenceRegistry (Live-first charts).
 */
import type { BankDeploy } from './types';
import type { CheckEvidenceRefs, EvidenceHistoryPoint } from './evidenceTypes';
import { getEvidence, listEvidenceForDeploy, upsertEvidence } from './evidenceRegistry';
import type { DojoProgramItem, DojoProgramResponse } from './fetchDojoProgram';

const STATUS_KEY = 'pk.admin.dojo_program.last';

export type ApplyDojoProgramResult = {
  applied: number;
  status: string;
  errors: string[];
};

export function readLastDojoProgramStatus(): {
  status: string;
  at?: string;
  error?: string;
} | null {
  try {
    const raw = window.localStorage.getItem(STATUS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { status: string; at?: string; error?: string };
  } catch {
    return null;
  }
}

function writeLastStatus(payload: DojoProgramResponse): void {
  try {
    window.localStorage.setItem(
      STATUS_KEY,
      JSON.stringify({
        status: payload.status,
        at: new Date().toISOString(),
        error: payload.error,
      }),
    );
  } catch {
    /* ignore */
  }
}

function syntheticCheckId(deployId: string): string {
  return `dojo-prog:${deployId}`;
}

function historyPoint(
  checkId: string,
  item: DojoProgramItem,
): EvidenceHistoryPoint {
  return {
    at: item.at || new Date().toISOString(),
    check_id: checkId,
    dojo_engagement_url: item.engagement_url || undefined,
    dojo_stats: item.stats ?? undefined,
    note: `dojo_program:${item.status}`,
  };
}

function mergeItemOntoRefs(
  refs: CheckEvidenceRefs,
  item: DojoProgramItem,
): CheckEvidenceRefs {
  const point = historyPoint(refs.check_id, item);
  const history = [...(refs.history ?? []), point].slice(-40);
  return {
    ...refs,
    dojo: {
      ...refs.dojo,
      product_id: item.product_id ?? refs.dojo?.product_id,
      product_name: item.product_name ?? refs.dojo?.product_name,
      engagement_url: item.engagement_url || refs.dojo?.engagement_url,
      stats: item.stats ?? refs.dojo?.stats,
      active_findings: item.findings_n ?? refs.dojo?.active_findings,
    },
    history,
    source: refs.source || 'hooks',
    updated_at: new Date().toISOString(),
  };
}

/** Apply ok items onto deploys by project_id. Non-ok never writes fake zero stats. */
export function applyDojoProgramToDeploys(
  payload: DojoProgramResponse,
  deploys: readonly BankDeploy[],
  linksByDeploy: ReadonlyMap<string, readonly string[]>,
): ApplyDojoProgramResult {
  writeLastStatus(payload);
  let applied = 0;
  const errors: string[] = [];

  for (const deploy of deploys) {
    const pid = (deploy.project_id || '').trim();
    if (!pid) continue;
    const item = payload.items[pid];
    if (!item) continue;
    if (!item.ok || !item.stats) {
      if (item.status && item.status !== 'ok') {
        errors.push(`${pid}:${item.status}`);
      }
      continue;
    }

    const linked = linksByDeploy.get(deploy.deploy_id) ?? [];
    let targetId = linked[0];
    if (targetId) {
      const existing = getEvidence(targetId);
      upsertEvidence(
        mergeItemOntoRefs(
          existing ?? {
            check_id: targetId,
            deploy_id: deploy.deploy_id,
            source: 'hooks',
          },
          item,
        ),
      );
      applied += 1;
      continue;
    }

    const byDeploy = listEvidenceForDeploy(deploy.deploy_id);
    if (byDeploy[0]) {
      upsertEvidence(mergeItemOntoRefs(byDeploy[0], item));
      applied += 1;
      continue;
    }

    const sid = syntheticCheckId(deploy.deploy_id);
    upsertEvidence(
      mergeItemOntoRefs(
        {
          check_id: sid,
          deploy_id: deploy.deploy_id,
          source: 'hooks',
        },
        item,
      ),
    );
    applied += 1;
  }

  return { applied, status: String(payload.status), errors };
}
