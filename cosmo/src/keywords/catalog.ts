/**
 * Типизированный доступ к каталогу ключевых слов.
 * Файл src/generated/keywords.json создаётся скриптом orchestrator/tools/export_keywords.py
 * из исходников адаптеров и не редактируется вручную.
 */
import rawCatalog from '../generated/keywords.json';
import type { JsonValue } from '../utils/json';
import { compareLocaleStrings } from '../utils/sortStrings';

export type ParamKind = 'positional' | 'keyword_only' | 'var_positional' | 'var_keyword';

export interface KeywordParam {
  name: string;
  kind: ParamKind;
  required: boolean;
  /** Значение по умолчанию, если оно является JSON-литералом. */
  default?: JsonValue;
  /** Исходный текст значения по умолчанию, если литералом его записать нельзя. */
  default_expr?: string;
  /** Аннотация типа из исходника, как есть. */
  type?: string;
}

export interface KeywordAction {
  params: KeywordParam[];
  description?: string;
  defined_in: string;
  inherited_from?: string;
}

export interface KeywordComponent {
  class: string;
  module: string;
  actions: Record<string, KeywordAction>;
}

export interface KeywordCatalog {
  components: Record<string, KeywordComponent>;
}

export const keywordCatalog = rawCatalog as unknown as KeywordCatalog;

export const componentNames: string[] = Object.keys(keywordCatalog.components).sort(
  compareLocaleStrings,
);

export function getComponent(catalog: KeywordCatalog, component: string): KeywordComponent | undefined {
  return catalog.components[component];
}

export function getAction(
  catalog: KeywordCatalog,
  component: string,
  action: string,
): KeywordAction | undefined {
  return catalog.components[component]?.actions[action];
}

export function actionNames(catalog: KeywordCatalog, component: string): string[] {
  const found = catalog.components[component];
  return found ? Object.keys(found.actions).sort(compareLocaleStrings) : [];
}

/** Значение по умолчанию в виде текста для подсказок: `10`, `"css"`, `graal_js`. */
export function formatDefault(param: KeywordParam): string | undefined {
  if (param.default_expr !== undefined) {
    return param.default_expr;
  }
  if (!('default' in param)) {
    return undefined;
  }
  const value = param.default;
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/** Компактное описание параметра: `url`, `timeout=10`, `*args`, `**kwargs`. */
export function formatParam(param: KeywordParam): string {
  if (param.kind === 'var_positional') {
    return `*${param.name}`;
  }
  if (param.kind === 'var_keyword') {
    return `**${param.name}`;
  }
  const defaultText = formatDefault(param);
  return defaultText === undefined ? param.name : `${param.name}=${defaultText}`;
}

export interface SignatureLabel {
  label: string;
  /** Границы [start, end) каждого параметра внутри label — для подсветки в Monaco. */
  parameterRanges: [number, number][];
}

export function formatSignature(component: string, action: string, keyword: KeywordAction): SignatureLabel {
  let label = `${component}|${action}`;
  const parameterRanges: [number, number][] = [];
  for (const param of keyword.params) {
    label += '|';
    const start = label.length;
    label += formatParam(param);
    parameterRanges.push([start, label.length]);
  }
  return { label, parameterRanges };
}

/** Сколько всего аргументов принимает действие; null — не ограничено (*args / **kwargs). */
export function maxArgumentCount(keyword: KeywordAction): number {
  return keyword.params.length;
}

export function totalActionCount(catalog: KeywordCatalog): number {
  return Object.values(catalog.components).reduce(
    (sum, component) => sum + Object.keys(component.actions).length,
    0,
  );
}
