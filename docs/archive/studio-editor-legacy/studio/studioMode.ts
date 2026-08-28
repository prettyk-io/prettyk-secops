/**
 * Когда Редактор показывает suites.
 *
 * `scan_policy` в анкете нет; в схеме фиксирован `custom_policy`.
 * Единственный продуктовый гейт — назначение `manual`.
 */

export type StudioSuiteMode = 'off' | 'on';

export type StudioOffReason = 'manual' | null;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function studioOffReason(formData: unknown): StudioOffReason {
  const meta = asRecord(asRecord(formData)?.meta);
  const purpose = typeof meta?.assessment_purpose === 'string' ? meta.assessment_purpose : '';
  if (purpose === 'manual') {
    return 'manual';
  }
  return null;
}

export function studioSuiteMode(formData: unknown): StudioSuiteMode {
  return studioOffReason(formData) === null ? 'on' : 'off';
}

/** Человеческий текст empty-state (без wire-имён и без «Студия»). */
export function studioOffEmptyDescription(formData: unknown): string {
  if (studioOffReason(formData) === 'manual') {
    return 'Редактор закрыт для назначения «Ручная проверка в scanner». В\u00A0Форме выберите другое назначение проверки.';
  }
  return 'Редактор недоступен.';
}
