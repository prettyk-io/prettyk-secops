/**
 * describeAction param line (S3776).
 */
import type { KeywordAction, KeywordParam } from './catalog';

type FormatDefault = (param: KeywordParam) => string | undefined;

function describeParam(param: KeywordParam, formatDefault: FormatDefault): string {
  const defaultText = formatDefault(param);
  if (param.kind === 'var_positional') {
    return `*${param.name} (по имени передать нельзя)`;
  }
  if (param.kind === 'var_keyword') {
    return `**${param.name}`;
  }
  return defaultText === undefined
    ? `${param.name} (обязательный)`
    : `${param.name} = ${defaultText}`;
}

/** RU override для hover WireK — без правки generated keywords / orchestrator. */
const ACTION_HEADER_RU: Record<string, string> = {
  'webdriver.gather_info':
    'СборИнформации: обход URL в браузере, затем паутина ZAP по живому графу. Не плоский Сканер.',
};

export function describeKeywordAction(
  component: string,
  action: string,
  keyword: KeywordAction,
  formatDefault: FormatDefault,
): string {
  const params = keyword.params
    .map((param) => describeParam(param, formatDefault))
    .join(', ');
  const key = `${component}.${action}`;
  const header = ACTION_HEADER_RU[key] ?? keyword.description ?? `${component}.${action}`;
  return params.length > 0 ? `${header}\nПараметры: ${params}` : `${header}\nБез параметров`;
}
