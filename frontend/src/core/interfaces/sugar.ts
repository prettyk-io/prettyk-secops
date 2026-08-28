/**
 * DSL-L1: TypeScript-типы для Sugar DSL.
 *
 * Sugar DSL — человекочитаемый диалект PrettyK, парсится в typed AST
 * и обратно. Дополняет wire-формат `component|action|args`.
 */

/** Стратегия локации элемента (роль / метка / test_id / css / текст / placeholder). */
export type LocatorStrategy =
  | 'role'
  | 'label'
  | 'test_id'
  | 'css'
  | 'text'
  | 'placeholder'
  | 'xpath';

/** Типизированный локатор элемента. */
export interface SugarLocator {
  strategy: LocatorStrategy;
  value: string;
}

/** Глагол действия Sugar DSL. */
export type SugarVerb =
  | 'Клик'
  | 'Вставить'
  | 'Ждать'
  | 'Скрин'
  | 'Текст'
  | 'Значение'
  | 'Атрибут'
  | 'Дописать'
  | 'Очистить'
  | 'Выбрать';

/** Модификаторы шага Sugar DSL:
 *  - `>?` — опциональный шаг (продолжить при ошибке)
 *  - `-> $var` — сохранить результат в переменную
 *  - `>#hint` — комментарий/подсказка оператору
 */
export type SugarModifier = '>?' | '->' | '>#';

/** Одна строка Sugar DSL после парсинга. */
export interface ParsedSugarLine {
  verb: SugarVerb;
  locator: SugarLocator;
  /** Позиционные аргументы после локатора. */
  args: string[];
  /** Модификаторы со значениями: `{kind, value?}`. */
  modifiers: SugarModifierEntry[];
  /** Сырая строка до парсинга. */
  raw: string;
}

/** Один модификатор с опциональным значением. */
export interface SugarModifierEntry {
  kind: SugarModifier;
  /** Значение для `->` (имя переменной) и `>#` (текст подсказки). */
  value?: string;
}

// ── Интеграция с существующей системой типов ──

/**
 * Типизированный шаг сценария (WireStep).
 * Мост между wire `component|action|args`, Sugar DSL и runtime-манифестом.
 */
export interface WireStep {
  /** Уникальный идентификатор шага в рамках сценария. */
  stepId?: string;
  /** Сырой constructor: `component|action|arg1|arg2`. */
  constructor: string;
  /** Распарсенный Sugar DSL, если шаг прошёл через sugar-пайплайн. */
  sugar?: ParsedSugarLine;
  /** Локатор (role/label/test_id/css/text/placeholder/xpath). */
  locator?: SugarLocator;
  /** Параметры шага — ключ-значение (позиционные + именованные). */
  params?: Record<string, string>;
  /** Комментарий оператора. */
  note?: string;
}