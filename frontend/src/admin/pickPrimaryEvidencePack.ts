/**
 * MC-RES-1: для Evidence charts предпочитать реальные check refs, не ib-web showcase.
 */
import type { CheckInstance } from '../checks/types';
import type { BankDeploy } from './types';
import type { DeployEvidencePack } from './evidenceTypes';
import {
  getEvidence,
  listEvidenceForDeploy,
  resolveDeployEvidencePack,
} from './evidenceRegistry';
import { packFromRefs } from './mockEvidencePack';

export type PrimaryEvidencePick = {
  pack: DeployEvidencePack;
  /** Подпись над графиками */
  caption: string;
  /** true — из registry / Live sync, не demo seed */
  fromLive: boolean;
};

function refsLookLive(refs: { history?: unknown[]; allure?: { summary?: unknown }; dojo?: { stats?: unknown } }[]): boolean {
  return refs.some(
    (r) =>
      (r.history?.length ?? 0) > 0 ||
      Boolean(r.allure?.summary) ||
      Boolean(r.dojo?.stats),
  );
}

export function pickPrimaryEvidencePack(
  deploys: readonly BankDeploy[],
  checks: readonly CheckInstance[],
  showcase: DeployEvidencePack,
): PrimaryEvidencePick {
  for (const deploy of deploys) {
    const refs = listEvidenceForDeploy(deploy.deploy_id);
    if (!refsLookLive(refs)) {
      continue;
    }
    const pack = packFromRefs(
      deploy.deploy_id,
      deploy.application_name,
      deploy.project_id,
      refs,
    );
    if (pack.severity_trend.length > 0 || pack.pass_rate_trend.length > 0) {
      return {
        pack,
        caption: deploy.application_name,
        fromLive: true,
      };
    }
  }

  for (const check of checks) {
    const refs = getEvidence(check.check_id);
    if (!refs || !refsLookLive([refs])) {
      continue;
    }
    const deployId = refs.deploy_id || check.check_id;
    const pack = packFromRefs(deployId, check.title || check.check_id, check.check_id, [
      refs,
    ]);
    if (pack.severity_trend.length > 0 || pack.pass_rate_trend.length > 0 || pack.history.length) {
      return {
        pack,
        caption: check.title || check.check_id,
        fromLive: true,
      };
    }
  }

  // Fallback: resolve showcase deploy (demo seed) — явно пометить
  const demo = resolveDeployEvidencePack(
    'dep_ib_web_2401',
    'Интернет-банк Web',
    'ib-web',
  );
  return {
    pack: demo.history.length ? demo : showcase,
    caption: 'Showcase ib-web (demo)',
    fromLive: false,
  };
}
