/**
 * VN-POL-F2: Экспорт результатов проверки.
 * buildResultsDump — JSON-сводка манифеста + хуков (секреты замаскированы).
 */

import { redactWiredSecrets } from '../form/redactSecrets';

export interface ResultsDump {
  /** Версия формата дампа */
  dump_version: 1;
  /** ISO-8601 timestamp генерации */
  generated_at: string;
  /** Манифест (секреты ***) */
  wired: unknown;
  /** Снапшот хуков (Allure/Dojo URLs) */
  hooks: unknown;
  /** Мета прогона (run_id, check_id, статус) */
  meta: unknown;
}

export function buildResultsDump(input: {
  wired: unknown;
  hooks: unknown;
  meta: unknown;
}): ResultsDump {
  return {
    dump_version: 1,
    generated_at: new Date().toISOString(),
    wired: redactWiredSecrets(input.wired),
    hooks: input.hooks,
    meta: input.meta,
  };
}

export function buildResultsDumpJson(input: {
  wired: unknown;
  hooks: unknown;
  meta: unknown;
}): string {
  return `${JSON.stringify(buildResultsDump(input), null, 2)}\n`;
}
