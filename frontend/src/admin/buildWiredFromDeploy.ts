import { freshCheckWiredData } from '../shell/freshCheck';
import type { BankDeploy } from './types';

type WiredShape = {
  meta?: {
    project_id?: string;
    initiator_name?: string;
    app_leader?: string;
    assessment_purpose?: string;
    name?: string;
    target?: string;
  };
  infrastructure?: {
    base_url_override?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type buildWiredFromDeployOpts = {
  /** Default pre_release (admin). Expert blank → scheduled. */
  assessmentPurpose?: string;
};

/**
 * Prefill check from bank Deploy: URL → infrastructure.base_url_override,
 * project_id / leaders → meta (SoT field titles in docs/wired.json).
 */
export function buildWiredFromDeploy(
  deploy: BankDeploy,
  opts?: buildWiredFromDeployOpts,
): unknown {
  const base = freshCheckWiredData() as WiredShape;
  const meta = { ...(base.meta ?? {}) };
  const infrastructure = { ...(base.infrastructure ?? {}) };

  meta.project_id = deploy.project_id;
  meta.assessment_purpose = opts?.assessmentPurpose ?? 'pre_release';
  if (deploy.app_leader) {
    meta.app_leader = deploy.app_leader;
  }
  if (deploy.initiator_hint) {
    meta.initiator_name = deploy.initiator_hint;
  }
  meta.name = `${deploy.application_name} · ${deploy.build_number ?? deploy.build_id}`;
  meta.target = deploy.deploy_url;

  infrastructure.base_url_override = deploy.deploy_url;

  return {
    ...base,
    meta,
    infrastructure,
  };
}

export function titleFromDeploy(deploy: BankDeploy): string {
  return `${deploy.application_name} (${deploy.deploy_env})`;
}
