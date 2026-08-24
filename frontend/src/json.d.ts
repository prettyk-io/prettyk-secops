/**
 * Импорт JSON без resolveJsonModule: типы сгенерированных файлов описываются вручную
 * (src/keywords/catalog.ts, src/wired/*), а не выводятся из литерала.
 * Так tsc не разворачивает тип двухтысячестрочной схемы и остаётся быстрым, а границы
 * данных остаются явными.
 */
declare module '*.json' {
  const value: unknown;
  export default value;
}
