/**
 * FE EvidenceRegistry — local mirror of orchestrator check_evidence_refs.
 * Deploy card aggregates by deploy_id / linked checks.
 */

import type { CheckEvidenceRefs, DeployEvidencePack } from './evidenceTypes';
import { buildDemoEvidenceRefs, demoPackForDeploy, packFromRefs } from './mockEvidencePack';

const EVIDENCE_KEY = 'pk.admin.evidence_refs.v1';

type Snapshot = { version: 1; items: Record<string, CheckEvidenceRefs> };

function readRaw(): string | undefined {
  try {
    return window.localStorage.getItem(EVIDENCE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeRaw(value: string): void {
  try {
    window.localStorage.setItem(EVIDENCE_KEY, value);
  } catch {
    /* ignore */
  }
}

function loadSnapshot(): Snapshot {
  const raw = readRaw();
  if (!raw) {
    return { version: 1, items: {} };
  }
  try {
    const parsed = JSON.parse(raw) as Snapshot;
    if (parsed?.version === 1 && parsed.items && typeof parsed.items === 'object') {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return { version: 1, items: {} };
}

function saveSnapshot(snap: Snapshot): void {
  writeRaw(JSON.stringify(snap));
}

export function upsertEvidence(refs: CheckEvidenceRefs): CheckEvidenceRefs {
  const snap = loadSnapshot();
  const prev = snap.items[refs.check_id];
  const merged: CheckEvidenceRefs = {
    ...prev,
    ...refs,
    check_id: refs.check_id,
    updated_at: refs.updated_at ?? new Date().toISOString(),
  };
  snap.items[refs.check_id] = merged;
  saveSnapshot(snap);
  return merged;
}

export function getEvidence(checkId: string): CheckEvidenceRefs | undefined {
  return loadSnapshot().items[checkId];
}

export function listAllEvidence(): CheckEvidenceRefs[] {
  return Object.values(loadSnapshot().items);
}

export function listEvidenceForDeploy(deployId: string): CheckEvidenceRefs[] {
  return Object.values(loadSnapshot().items)
    .filter((r) => r.deploy_id === deployId)
    .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
}

export function listEvidenceForChecks(checkIds: string[]): CheckEvidenceRefs[] {
  const snap = loadSnapshot();
  return checkIds
    .map((id) => snap.items[id])
    .filter((r): r is CheckEvidenceRefs => Boolean(r));
}

/** Prefer check-level refs; fall back to deploy.last hooks as thin synthetic. */
export function resolveDeployEvidenceStrip(
  deployId: string,
  checkIds: string[],
  deployHooks?: { allure_report_url?: string; dojo_engagement_url?: string },
): CheckEvidenceRefs[] {
  const fromRegistry = listEvidenceForChecks(checkIds);
  if (fromRegistry.length > 0) {
    return fromRegistry;
  }
  const byDeploy = listEvidenceForDeploy(deployId);
  if (byDeploy.length > 0) {
    return byDeploy;
  }
  if (deployHooks?.allure_report_url || deployHooks?.dojo_engagement_url) {
    return [
      {
        check_id: checkIds[0] ?? `${deployId}:last`,
        deploy_id: deployId,
        source: 'manual',
        allure: deployHooks.allure_report_url
          ? {
              report_url: deployHooks.allure_report_url,
              allure_project_id: 'default',
              status: 'ok',
            }
          : undefined,
        dojo: deployHooks.dojo_engagement_url
          ? { engagement_url: deployHooks.dojo_engagement_url }
          : undefined,
      },
    ];
  }
  return [];
}

export function resetEvidenceRegistryForTests(): void {
  try {
    window.localStorage.removeItem(EVIDENCE_KEY);
  } catch {
    /* ignore */
  }
}

/** Lab seed so Deploy card shows EvidenceRefs without a live finalize. */
export function seedDemoEvidenceIfEmpty(): void {
  const snap = loadSnapshot();
  const existing = snap.items.chk_demo_ib_web;
  if (existing?.history && existing.history.length >= 2) {
    return;
  }
  upsertEvidence(buildDemoEvidenceRefs());
}

/** Pack for Deploy card: registry history or demo showcase. */
export function resolveDeployEvidencePack(
  deployId: string,
  applicationName: string,
  metaProjectId: string,
): DeployEvidencePack {
  const refs = listEvidenceForDeploy(deployId);
  if (refs.some((r) => (r.history?.length ?? 0) > 0 || r.allure?.summary || r.dojo?.stats)) {
    return packFromRefs(deployId, applicationName, metaProjectId, refs);
  }
  return (
    demoPackForDeploy(deployId) ??
    packFromRefs(deployId, applicationName, metaProjectId, refs)
  );
}
