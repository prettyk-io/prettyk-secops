/**
 * ADM-PURE-5: Честный Gate Engine — расчёт вердикта по находкам и политике.
 *
 * Правила:
 * — Неактивная политика → passed (bypass).
 * — Статус запуска running/unavailable → failed (не оцениваем неготовое).
 * — Находки превысили порог severity → failed.
 * — Есть CRITICAL находки (но в пределах порога) → warning.
 * — Всё чисто → passed.
 */
import type { Run, Finding, GatePolicy, GateVerdict } from './types';

export interface GateResult {
  verdict: GateVerdict;
  reason: string;
}

/**
 * Оценивает запуск по заданной политике и списку находок.
 * Не превращает отсутствие данных в passed.
 */
export function evaluateGate(run: Run, findings: Finding[], policy: GatePolicy): GateResult {
  // 1. Неактивная политика — gate bypass
  if (!policy.active) {
    return {
      verdict: 'passed',
      reason: `Policy "${policy.name}" is inactive — gate bypassed.`,
    };
  }

  // 2. Незавершённый или недоступный запуск — не прошёл
  if (run.status === 'running') {
    return {
      verdict: 'failed',
      reason: 'Run is still running — cannot evaluate gate until completion.',
    };
  }

  if (run.status === 'unavailable') {
    return {
      verdict: 'failed',
      reason: `Target unavailable — run status is "${run.status}". Gate cannot pass.`,
    };
  }

  // 3. Считаем активные находки по severity
  const activeFindings = findings.filter((f) => f.status === 'active');

  // Проверяем каждый порог политики
  for (const rule of policy.rules) {
    const count = activeFindings.filter((f) => f.severity === rule.severity).length;

    if (count > rule.maxAllowed) {
      return {
        verdict: 'failed',
        reason: `${count} active ${rule.severity} findings exceed max allowed ${rule.maxAllowed}.`,
      };
    }
  }

  // 4. Проверка на warning: есть CRITICAL находки, но в пределах порога
  const criticalCount = activeFindings.filter((f) => f.severity === 'CRITICAL').length;
  if (criticalCount > 0) {
    return {
      verdict: 'warning',
      reason: `${criticalCount} active CRITICAL finding(s) present — gate passed with warning.`,
    };
  }

  // 5. Чисто
  return {
    verdict: 'passed',
    reason: 'All severity thresholds within policy limits. Zero critical findings.',
  };
}