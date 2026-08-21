/**
 * Собрать ProgramKpi из текущих Admin + checks stores.
 */
import { listChecks } from '../checks/checksStore';
import { listDeploys, linksByDeployMap } from './deployStore';
import { deriveProgramKpi } from './deriveProgramKpi';
import { listAllEvidence } from './evidenceRegistry';
import type { ProgramKpi } from './types';

export function loadLiveProgramKpi(windowDays: 7 | 30 = 7): ProgramKpi {
  return deriveProgramKpi({
    deploys: listDeploys(),
    checks: listChecks(),
    evidence: listAllEvidence(),
    linksByDeploy: linksByDeployMap(),
    windowDays,
  });
}
