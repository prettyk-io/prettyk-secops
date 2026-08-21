/**
 * Стабильная алфавитная сортировка строк (Sonar typescript:S2871).
 * Locale `ru` — как в methodIds; для ASCII/id ключей поведение предсказуемо.
 */
export function compareLocaleStrings(left: string, right: string): number {
  return left.localeCompare(right, 'ru');
}

/** Копия массива, отсортированная localeCompare (не мутирует вход). */
export function sortStringsAsc(values: Iterable<string>): string[] {
  return [...values].sort(compareLocaleStrings);
}
