/**
 * RP-VIZ: маппинг шага replay → целевой кандидат из живого snapshot.
 *
 * Чистый, тестируемый слой развязки между Replay Runner и overlay-подсветкой.
 * FE только ПОТРЕБЛЯЕТ snapshot (`GET /api/browser/elements` → CandidateElement[]),
 * сам DOM не перечисляет (контракт BBA-FE-4, зона Boss).
 */
import type { ScenarioStepModel } from '../studio/scenarioStepModel';
import type { CandidateElement } from './candidateInspect';

/** Действия без целевого DOM-элемента — не подсвечиваются рамкой. */
export const NO_TARGET_ACTIONS: ReadonlySet<string> = new Set([
  'Open', 'Wait', 'Wheel', 'Scroll', 'Drag',
  'Let', 'Secret', 'GenerateEmail', 'GeneratePhone',
  'Crawl', 'ActiveScan', 'Check', 'scannerReport',
  'FuzzWave', 'Mutate', 'Intruder',
]);

/**
 * Найти кандидата, соответствующего целевому селектору/имени шага.
 *
 * Возвращает null для действий без таргета или когда в snapshot нет совпадения.
 * Best-effort (подсветка не должна ломать replay — только визуализация).
 */
export function matchStepToCandidate(
  step: ScenarioStepModel,
  candidates: CandidateElement[],
): CandidateElement | null {
  if (NO_TARGET_ACTIONS.has(step.action)) return null;
  const sv = (step.strategyValue ?? '').trim();
  if (!sv) return null;

  // Точное совпадение селектора (css/label/xpath + любой fallback).
  const bySelector = candidates.find((c) => c.cssSelector === sv);
  if (bySelector) return bySelector;

  // role/text/test_id: strategyValue = accessibleName элемента.
  const byName = candidates.find(
    (c) => c.text === sv || c.role === sv || c.cssSelector === sv,
  );
  if (byName) return byName;

  // Последний шанс: селектор как суффикс (например, «#login» внутри сложного).
  return candidates.find((c) => c.cssSelector.endsWith(sv) || c.role === sv) ?? null;
}

/**
 * Короткий человекочитаемый лейбл подсветки: `<Action> <name|selector>`.
 * Для шага без таргета — только действие.
 */
export function replayHighlightLabel(step: ScenarioStepModel, target: CandidateElement | null): string {
  const name = target
    ? (target.text || target.role || target.cssSelector)
    : (step.strategyValue.trim() || step.action);
  if (name === step.action) return step.action;
  return `${step.action} ${name}`;
}