/**
 * PURE minimal wired field validation.
 * LEGACY-REGULATION (2026-08-21): regulation-heavy checks removed for PURE.
 * Осталась только проверка URL и browser из infrastructure.
 */
import { getPath } from './path';

export interface FieldError {
  path: string;
  message: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function validateWiredFields(state: unknown): FieldError[] {
  const errors: FieldError[] = [];
  const prefix = typeof state === 'object' && state && 'regulation' in state ? 'regulation.' : '';

  const url = str(getPath(state, `${prefix}infrastructure.base_url_override`));
  if (!url) {
    errors.push({ path: `${prefix}infrastructure.base_url_override`, message: 'URL сканирования обязателен' });
  } else if (!/^https?:\/\/\S+$/i.test(url)) {
    errors.push({ path: `${prefix}infrastructure.base_url_override`, message: 'URL должен начинаться с http:// или https://' });
  }

  return errors;
}

export function hasErrors(errors: FieldError[]): boolean {
  return errors.length > 0;
}