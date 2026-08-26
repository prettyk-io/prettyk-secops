/**
 * PK-WB-E5 — Evidence Bridge.
 *
 * Links DSL editor steps to their execution outcomes:
 *   DSL step → Run → Finding → Evidence artifact
 * + Policy Lens: объясняет gate-вердикт по правилам политики.
 *
 * Связка: FindingRecord.stepId / EvidenceRecord.stepId → DslTabRef.entityId / path
 */

import type { FindingRecord, EvidenceRecord, RunRecord } from '../ci/types';

// ---------------------------------------------------------------------------
// Evidence Chain Types
// ---------------------------------------------------------------------------

/** Одно звено цепочки DSL → execution → finding → artifact. */
export interface EvidenceChainLink {
  /** ID шага в DSL (scenario_name, page key, module name, etc.). */
  stepId: string;
  /** Человекочитаемая метка шага. */
  stepLabel: string;
  /** DSL-путь в formData (JSON pointer). */
  dslPath: string;

  /** Прогоны, в которых шаг участвовал. */
  runs: EvidenceChainRun[];
}

/** Один прогон — находки и артефакты для шага. */
export interface EvidenceChainRun {
  runId: string;
  state: string;
  createdAt?: string;
  /** Находки, порождённые этим шагом. */
  findings: EvidenceChainFinding[];
  /** Артефакты (скриншоты, логи, трассировка). */
  artifacts: EvidenceChainArtifact[];
}

/** Находка в цепочке доказательств. */
export interface EvidenceChainFinding {
  dedupKey: string;
  severity?: string;
  title?: string;
  observedAt: string;
  /** URL артефакта (Allure, DefectDojo, etc.). */
  artifactUrl?: string;
}

/** Артефакт в цепочке доказательств. */
export interface EvidenceChainArtifact {
  dedupKey: string;
  kind?: string;
  checksum?: string;
  observedAt: string;
}

/** Сводка по шагу: вердикт + причина + ссылки. */
export interface StepEvidenceSummary {
  stepId: string;
  stepLabel: string;
  dslPath: string;
  /** Сколько прогонов задокументировано для этого шага. */
  totalRuns: number;
  /** Сколько находок суммарно. */
  totalFindings: number;
  /** Сводка по severity. */
  severityBreakdown: Partial<Record<string, number>>;
  /** Самый жёсткий вердикт из всех прогонов. */
  worstVerdict: 'clean' | 'warning' | 'failed' | 'untested';
  /** Человекочитаемое объяснение. */
  verdictReason: string;
  /** Есть ли артефакты для просмотра. */
  hasArtifacts: boolean;
}

// ---------------------------------------------------------------------------
// Policy Lens Types
// ---------------------------------------------------------------------------

/** Правило политики с подсчитанным количеством находок. */
export interface PolicyRuleStatus {
  severity: string;
  maxAllowed: number;
  actualCount: number;
  exceeded: boolean;
}

/** Полная policy lens: политика + подсчёт + вердикт. */
export interface PolicyLensData {
  policyName: string;
  policyActive: boolean;
  rules: PolicyRuleStatus[];
  verdict: 'passed' | 'warning' | 'failed';
  reason: string;
  totalActiveFindings: number;
}

// ---------------------------------------------------------------------------
// Step → Findings Bridge
// ---------------------------------------------------------------------------

/**
 * Найти все находки, связанные с конкретным DSL-шагом.
 * Матчит по FindingRecord.stepId.
 */
export function getStepFindings(
  stepId: string,
  findings: FindingRecord[],
): FindingRecord[] {
  return findings.filter((f) => f.stepId === stepId);
}

/**
 * Найти все артефакты, связанные с конкретным DSL-шагом.
 * Матчит по EvidenceRecord.stepId.
 */
export function getStepEvidence(
  stepId: string,
  evidence: EvidenceRecord[],
): EvidenceRecord[] {
  return evidence.filter((e) => e.stepId === stepId);
}

/**
 * Построить полную цепочку доказательств DSL → run → finding → artifact.
 *
 * @param stepId — ID шага (entityId из DslTabRef)
 * @param stepLabel — человекочитаемая метка
 * @param dslPath — JSON pointer путь в formData
 * @param runs — все RunRecord'ы (содержат findings и evidence внутри runEngine)
 * @param allFindings — плоский список всех FindingRecord'ов
 * @param allEvidence — плоский список всех EvidenceRecord'ов
 */
export function buildEvidenceChain(
  stepId: string,
  stepLabel: string,
  dslPath: string,
  runs: RunRecord[],
  allFindings: FindingRecord[],
  allEvidence: EvidenceRecord[],
): EvidenceChainLink {
  const stepFindings = getStepFindings(stepId, allFindings);
  const stepEvidence = getStepEvidence(stepId, allEvidence);

  // Группируем по runId
  const findingsByRun = new Map<string, FindingRecord[]>();
  const evidenceByRun = new Map<string, EvidenceRecord[]>();

  for (const f of stepFindings) {
    const list = findingsByRun.get(f.runId) || [];
    list.push(f);
    findingsByRun.set(f.runId, list);
  }
  for (const e of stepEvidence) {
    const list = evidenceByRun.get(e.runId) || [];
    list.push(e);
    evidenceByRun.set(e.runId, list);
  }

  // Собираем уникальные runId
  const runIds = new Set<string>();
  for (const f of stepFindings) runIds.add(f.runId);
  for (const e of stepEvidence) runIds.add(e.runId);

  // Строим цепочку
  const chainRuns: EvidenceChainRun[] = [];
  for (const runId of runIds) {
    const run = runs.find((r) => r.id === runId);
    const runFindings = (findingsByRun.get(runId) || []).map((f) => ({
      dedupKey: f.dedupKey,
      severity: f.severity,
      title: f.title,
      observedAt: f.observedAt,
    }));
    const runArtifacts = (evidenceByRun.get(runId) || []).map((e) => ({
      dedupKey: e.dedupKey,
      kind: e.kind,
      checksum: e.checksum,
      observedAt: e.observedAt,
    }));

    chainRuns.push({
      runId,
      state: run?.state ?? 'unknown',
      createdAt: run?.createdAt,
      findings: runFindings,
      artifacts: runArtifacts,
    });
  }

  // Сортируем: свежие прогоны сверху
  chainRuns.sort(
    (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
  );

  return {
    stepId,
    stepLabel,
    dslPath,
    runs: chainRuns,
  };
}

/**
 * Построить сводку по шагу — агрегированные метрики + вердикт.
 */
export function buildStepEvidenceSummary(
  chain: EvidenceChainLink,
): StepEvidenceSummary {
  const allFindings = chain.runs.flatMap((r) => r.findings);
  const allArtifacts = chain.runs.flatMap((r) => r.artifacts);

  const severityBreakdown: Partial<Record<string, number>> = {};
  let worstVerdict: StepEvidenceSummary['worstVerdict'] = 'untested';

  for (const f of allFindings) {
    const sev = f.severity || 'UNKNOWN';
    severityBreakdown[sev] = (severityBreakdown[sev] || 0) + 1;

    // Определяем worst verdict по severity
    if (sev === 'CRITICAL') worstVerdict = 'failed';
    else if (sev === 'HIGH' && worstVerdict !== 'failed') worstVerdict = 'warning';
    else if (sev === 'MEDIUM' && worstVerdict === 'untested') worstVerdict = 'clean';
  }

  if (allFindings.length === 0 && chain.runs.length > 0) {
    worstVerdict = 'clean';
  }

  const verdictReason =
    worstVerdict === 'failed'
      ? `Step produced CRITICAL findings`
      : worstVerdict === 'warning'
        ? `Step produced HIGH-severity findings`
        : worstVerdict === 'clean'
          ? `No findings from this step`
          : `Step has not been executed yet`;

  return {
    stepId: chain.stepId,
    stepLabel: chain.stepLabel,
    dslPath: chain.dslPath,
    totalRuns: chain.runs.length,
    totalFindings: allFindings.length,
    severityBreakdown,
    worstVerdict,
    verdictReason,
    hasArtifacts: allArtifacts.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Policy Lens
// ---------------------------------------------------------------------------

/**
 * Построить Policy Lens: полный разбор правил политики с подсчётом находок.
 *
 * @param policyName — имя политики
 * @param policyActive — активна ли политика
 * @param rules — правила политики (severity → maxAllowed)
 * @param activeFindingsBySeverity — подсчёт активных находок по severity
 */
export function buildPolicyLens(
  policyName: string,
  policyActive: boolean,
  rules: Array<{ severity: string; maxAllowed: number }>,
  activeFindingsBySeverity: Record<string, number>,
): PolicyLensData {
  if (!policyActive) {
    return {
      policyName,
      policyActive: false,
      rules: rules.map((r) => ({
        severity: r.severity,
        maxAllowed: r.maxAllowed,
        actualCount: 0,
        exceeded: false,
      })),
      verdict: 'passed',
      reason: `Policy "${policyName}" is inactive — gate bypassed.`,
      totalActiveFindings: 0,
    };
  }

  const ruleStatuses: PolicyRuleStatus[] = [];
  let verdict: PolicyLensData['verdict'] = 'passed';
  let reason = 'All severity thresholds within policy limits.';

  for (const rule of rules) {
    const actualCount = activeFindingsBySeverity[rule.severity] || 0;
    const exceeded = actualCount > rule.maxAllowed;

    ruleStatuses.push({
      severity: rule.severity,
      maxAllowed: rule.maxAllowed,
      actualCount,
      exceeded,
    });

    if (exceeded) {
      verdict = 'failed';
      reason = `${actualCount} active ${rule.severity} findings exceed max allowed ${rule.maxAllowed}.`;
    }
  }

  const totalCritical = activeFindingsBySeverity['CRITICAL'] || 0;
  if (verdict === 'passed' && totalCritical > 0) {
    verdict = 'warning';
    reason = `${totalCritical} active CRITICAL finding(s) present — gate passed with warning.`;
  }

  const totalActive = Object.values(activeFindingsBySeverity).reduce(
    (sum, count) => sum + count,
    0,
  );

  return {
    policyName,
    policyActive,
    rules: ruleStatuses,
    verdict,
    reason,
    totalActiveFindings: totalActive,
  };
}

/**
 * Собрать severity breakdown из плоского списка FindingRecord'ов.
 */
export function countFindingsBySeverity(
  findings: FindingRecord[],
): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const f of findings) {
    const sev = f.severity || 'UNKNOWN';
    breakdown[sev] = (breakdown[sev] || 0) + 1;
  }
  return breakdown;
}

/**
 * Найти все уникальные stepId, упомянутые в находках.
 * Используется чтобы подсветить в Explorer'е шаги, у которых есть evidence.
 */
export function getTestedStepIds(
  findings: FindingRecord[],
  evidence: EvidenceRecord[],
): Set<string> {
  const ids = new Set<string>();
  for (const f of findings) {
    if (f.stepId) ids.add(f.stepId);
  }
  for (const e of evidence) {
    if (e.stepId) ids.add(e.stepId);
  }
  return ids;
}