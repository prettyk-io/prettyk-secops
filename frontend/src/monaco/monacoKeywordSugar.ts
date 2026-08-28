/**
 * DSL-F1: Сахарные алиасы ключевых слов Monaco автодополнения.
 *
 * Короткие глаголы → канонические имена. Оба варианта видны в AC,
 * оба ведут к одному wire. Не трогает keywords.json.
 *
 * Правило: alias label → canonical insertText.
 * На каждый канонический глагол один короткий алиас.
 */

export type SugarAlias = {
  /** Что видит пользователь в списке автодополнения. */
  label: string;
  /** Каноническое имя (вставляется в редактор). */
  canonical: string;
};

/** Пары «короткий алиас → канонический глагол». */
export const DSL_SUGAR_ALIASES: readonly SugarAlias[] = [
  { label: 'Клик', canonical: 'Нажать' },
  { label: 'Вставить', canonical: 'ВставитьЗначение' },
  { label: 'Ждать', canonical: 'ЖдатьЭлемент' },
  { label: 'Скрин', canonical: 'Скриншот' },
  { label: 'Текст', canonical: 'ПолучитьТекст' },
  { label: 'Значение', canonical: 'ПолучитьЗначение' },
  { label: 'Атрибут', canonical: 'ПолучитьАтрибут' },
  { label: 'Дописать', canonical: 'ДописатьТекст' },
  { label: 'Очистить', canonical: 'ОчиститьЗначение' },
  { label: 'Выбрать', canonical: 'ВыбратьПоТексту' },
];

/** По короткому алиасу найти canonical. */
export function resolveSugarAlias(label: string): string | undefined {
  const hit = DSL_SUGAR_ALIASES.find((a) => a.label === label);
  return hit?.canonical;
}

/** Все сахарные лейблы для быстрой проверки. */
const SUGAR_LABELS = new Set(DSL_SUGAR_ALIASES.map((a) => a.label));

/** Канонические имена из алиасов. */
const SUGAR_CANONICALS = new Set(DSL_SUGAR_ALIASES.map((a) => a.canonical));

/**
 * Фильтр: оставить action names, которые НЕ являются сахарными канониками.
 * Канонические глаголы приходят из keywords.json,
 * сахарные лейблы добавляются сверху — дубликатов не будет.
 */
export function filterNonSugarCanonicals(names: readonly string[]): string[] {
  return names.filter((n) => !SUGAR_CANONICALS.has(n));
}

/** Добавить сахарные лейблы, чей canonical есть в наборе имён. */
export function matchingSugarAliases(names: readonly string[]): SugarAlias[] {
  const nameSet = new Set(names);
  return DSL_SUGAR_ALIASES.filter((a) => nameSet.has(a.canonical));
}

/** Проверить: является ли имя сахарным алиасом. */
export function isSugarAlias(name: string): boolean {
  return SUGAR_LABELS.has(name);
}