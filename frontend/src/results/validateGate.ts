/**
 * Validate-gate перед выгрузкой бланка / пакета (RES-1).
 * Сбор причин; side-effects (пингвин, scroll) остаются в App.ensureValidOrFocusErrors.
 */

export type ValidateGateReason = {
  source: 'constructor' | 'schema' | 'other';
  message: string;
};

export type ValidateGateResult = {
  ok: boolean;
  reasons: ValidateGateReason[];
};

export type GateIssueLike = {
  breadcrumb?: string;
  message: string;
  keyword?: string;
};

export type GateConstructorFailLike = {
  id: string;
  message: string;
  line?: number;
  column?: number;
};

/** Чистая сводка: оба контура без ошибок → ok. */
export function evaluateExportGate(input: {
  constructorFails?: GateConstructorFailLike[];
  schemaIssues?: GateIssueLike[];
  extraReasons?: ValidateGateReason[];
}): ValidateGateResult {
  const reasons: ValidateGateReason[] = [];

  for (const fail of input.constructorFails ?? []) {
    const where =
      fail.line != null
        ? `${fail.id} · ${String(fail.line)}:${String(fail.column ?? 1)}`
        : fail.id;
    reasons.push({
      source: 'constructor',
      message: `${where} — ${fail.message}`,
    });
  }

  for (const issue of input.schemaIssues ?? []) {
    const path = issue.breadcrumb?.trim() ? `${issue.breadcrumb} — ` : '';
    reasons.push({
      source: 'schema',
      message: `${path}${issue.message}`,
    });
  }

  for (const extra of input.extraReasons ?? []) {
    reasons.push(extra);
  }

  return { ok: reasons.length === 0, reasons };
}

/** Redact DoD: plaintext секрета не должен остаться в выгрузке. */
export function exportContainsPlainSecret(
  exportText: string,
  secretSamples: string[],
): boolean {
  for (const sample of secretSamples) {
    const trimmed = sample.trim();
    if (trimmed.length < 4) {
      continue;
    }
    if (exportText.includes(trimmed)) {
      return true;
    }
  }
  return false;
}
