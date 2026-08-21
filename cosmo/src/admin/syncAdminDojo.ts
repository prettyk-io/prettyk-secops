/**
 * ADM-DOJO-2: evidence Live sync + Dojo program aggregate for Admin charts.
 */
import { listDeploys, linksByDeployMap } from './deployStore';
import { applyDojoProgramToDeploys } from './applyDojoProgram';
import { fetchDojoProgram } from './fetchDojoProgram';
import { syncEvidenceFromLive } from './syncEvidenceFromLive';

export type SyncAdminDojoResult = {
  evidenceOk: boolean;
  evidenceUpserted: number;
  evidenceError?: string;
  dojoStatus: string;
  dojoApplied: number;
  dojoError?: string;
  dojoItemErrors: string[];
};

export async function syncAdminDojoFromLive(
  fetchImpl: typeof fetch = fetch,
): Promise<SyncAdminDojoResult> {
  const evidence = await syncEvidenceFromLive(fetchImpl);
  const deploys = listDeploys();
  const projectIds = deploys.map((d) => d.project_id).filter(Boolean);
  const dojo = await fetchDojoProgram(projectIds, fetchImpl);
  const applied = applyDojoProgramToDeploys(dojo, deploys, linksByDeployMap());
  return {
    evidenceOk: evidence.ok,
    evidenceUpserted: evidence.upserted,
    evidenceError: evidence.error,
    dojoStatus: applied.status,
    dojoApplied: applied.applied,
    dojoError: dojo.error,
    dojoItemErrors: applied.errors,
  };
}
