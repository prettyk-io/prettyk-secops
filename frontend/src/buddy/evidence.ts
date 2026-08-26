/**
 * CO-PILOT META (PoC) — EvidenceMatrix.
 *
 * pass выдаётся ТОЛЬКО если все заявленные assertions доказаны.
 * Для каждого assertion — конкретное evidence (HTTP-код, DOM-срез, AX-tree,
 * скриншот). Провал — честная причина, не зелёная магия.
 */

import type {
  AssertionResult,
  EvidenceItem,
  EvidenceMatrix,
  SkeletonExpectation,
  RunStepOutcome,
} from './types';

// ---------------------------------------------------------------------------
// Оценка assertions по outcomes
// ---------------------------------------------------------------------------

/** Сопоставить expectation с evidence из outcomes. */
export function evaluateAssertions(
  expectations: SkeletonExpectation[],
  outcomes: RunStepOutcome[],
): EvidenceMatrix {
  const assertions: AssertionResult[] = expectations.map((exp) => {
    // Ищем evidence в outcomes: любой outcome с ok=true и непустым evidence
    const evidence: EvidenceItem[] = outcomes.flatMap((o) => o.evidence ?? []);

    // Assertion доказан, если:
    // 1. Есть хотя бы один outcome с ok=true
    // 2. И собранное evidence покрывает expectation
    const anyOk = outcomes.some((o) => o.ok);

    const proven = anyOk && evidence.length > 0;

    return {
      assertionId: exp.id,
      expectation: exp.description,
      proven,
      evidence: proven ? evidence : [],
      failReason: proven
        ? undefined
        : !anyOk
          ? 'Ни один шаг сценария не завершился успешно'
          : 'Отсутствует evidence: assertion не подкреплён HTTP/DOM/AX/скриншотом',
    };
  });

  const pass = assertions.length > 0 && assertions.every((a) => a.proven);

  return {
    pass,
    assertions,
    advisories: collectAdvisories(outcomes),
  };
}

/** Advisory-замечания (не влияют на pass): тайминги, слабые локаторы и т.п. */
function collectAdvisories(outcomes: RunStepOutcome[]): string[] {
  const advisories: string[] = [];
  for (const o of outcomes) {
    if (o.elapsedMs > 500) {
      advisories.push(`Шаг ${o.stepId} выполняется медленно: ${o.elapsedMs}ms`);
    }
    if (!o.ok && o.error) {
      advisories.push(`Шаг ${o.stepId} не выполнен: ${o.error}`);
    }
  }
  return advisories;
}

/** Пустой (неубедительный) результат — никогда не pass. */
export function emptyEvidenceMatrix(): EvidenceMatrix {
  return { pass: false, assertions: [], advisories: [] };
}
