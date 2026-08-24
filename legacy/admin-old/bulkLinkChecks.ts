/**
 * ADM-E6: bulk link checks ↔ deploys (pure + store apply).
 */

import { linkCheckToDeploy } from './deployStore';

export type BulkLinkPlan = {
  deployIds: string[];
  checkIds: string[];
  pairs: Array<{ deploy_id: string; check_id: string }>;
};

export function planBulkLink(
  deployIds: readonly string[],
  checkIds: readonly string[],
): BulkLinkPlan {
  const deps = [...new Set(deployIds.map((d) => d.trim()).filter(Boolean))];
  const checks = [...new Set(checkIds.map((c) => c.trim()).filter(Boolean))];
  const pairs: BulkLinkPlan['pairs'] = [];
  for (const deploy_id of deps) {
    for (const check_id of checks) {
      pairs.push({ deploy_id, check_id });
    }
  }
  return { deployIds: deps, checkIds: checks, pairs };
}

/** Preview line for modal: «N пар (D×C)». */
export function formatBulkLinkPreview(plan: BulkLinkPlan): string {
  const d = plan.deployIds.length;
  const c = plan.checkIds.length;
  const n = plan.pairs.length;
  return `${n} пар (${d}×${c})`;
}

/** Filter checks by id/title substring (modal search). */
export function filterCheckIdsByQuery(
  checks: readonly { check_id: string; title?: string }[],
  query: string,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return checks.map((c) => c.check_id);
  }
  return checks
    .filter(
      (c) =>
        c.check_id.toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q),
    )
    .map((c) => c.check_id);
}

/** Apply plan via deployStore; returns how many link calls made (incl. no-op dupes). */
export function applyBulkLink(plan: BulkLinkPlan): number {
  let n = 0;
  for (const p of plan.pairs) {
    linkCheckToDeploy(p.deploy_id, p.check_id);
    n += 1;
  }
  return n;
}
