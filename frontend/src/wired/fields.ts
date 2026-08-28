/**
 * Декларативный конфиг полей формы (прямой маппер wired → UI).
 * Не JSON Schema: каждое поле — строка конфига, рендерится в antd-input/select/switch.
 * Data-driven WiredForm читает SECTIONS и рендерит без JSX-простыней.
 * Порт из to-sanitize/wired/fields.ts, без RJSF.
 */

export type FieldKind = 'text' | 'number' | 'boolean' | 'select';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  /** Dotted-путь в состояние, напр. `meta.assessment_purpose`. */
  path: string;
  label: string;
  kind: FieldKind;
  options?: FieldOption[];
  placeholder?: string;
  readOnly?: boolean;
  min?: number;
  max?: number;
  /** Подсказка под полем (ант-хелп). */
  help?: string;
  /** Показывать хелп только при условии (иначе always). */
  helpIf?: (state: Record<string, unknown>) => boolean;
  /** Красная звёздочка у лейбла (Form.Item required). */
  required?: boolean;
  /** Дефолт для number-полей (если value undefined). */
  defaultValue?: unknown;
  /** Поле занимает целую строку (не спаривается с соседним). */
  fullWidth?: boolean;
  /** Виден только при условии от текущего состояния (иначе поле не рендерится). */
  visibleIf?: (state: Record<string, unknown>) => boolean;
  /** Блокировка на чтение при условии. */
  lockedIf?: (state: Record<string, unknown>) => boolean;
}

export interface SectionDef {
  key: string;
  label: string;
  fields: FieldDef[];
}

// ===== LEGACY-REGULATION (2026-08-21, Максим 2FA PURE-URL-FREE) =====
// Все секции регламента убраны из SECTIONS для PURE.
// WiredForm рендерит 0 полей — название + URL + browser задаются при создании чека.
// Suite setup в Студии (gear icon + клик на Scenarios → prettyPane) заменил форму.
// При custom/enterprise-деплое: восстановить старые секции из git history.
// git show 3b65bea~1:cosmo/src/wired/fields.ts
export const SECTIONS: SectionDef[] = [];

// Сохранены как reference для Suite setup в Студии.
// PURPOSE_OPTIONS, scanner_MODE_OPTIONS, BROWSER_OPTIONS, AUTH_TYPE_OPTIONS — закомментированы.