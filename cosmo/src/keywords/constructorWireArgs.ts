/**
 * Wire constructor arg diagnostics (S3776).
 */
import type { KeywordAction } from './catalog';
import type {
  ConstructorDiagnostic,
  ConstructorSegment,
  ParsedConstructor,
} from './constructor';
import { findRefsInText } from './refs';

function variableDiagnostics(
  segment: ConstructorSegment,
  knownVariables: readonly string[],
): ConstructorDiagnostic[] {
  const diagnostics: ConstructorDiagnostic[] = [];
  for (const ref of findRefsInText(segment.text)) {
    const root = ref.path.split(/[.[\]]/, 1)[0] ?? '';
    const start = segment.start + ref.start;
    const end = segment.start + ref.end;

    if (root.length === 0) {
      diagnostics.push({
        severity: 'error',
        message: 'Пустое имя переменной в подстановке.',
        start,
        end,
      });
    } else if (knownVariables.length > 0 && !knownVariables.includes(root)) {
      diagnostics.push({
        severity: 'warning',
        message:
          `Переменная «${root}» не объявлена в манифесте (ожидается save_as у шага, id ` +
          'контекста или Пусть). При soft-resolve фрагмент `$…` может остаться как есть.',
        start,
        end,
      });
    }
  }
  return diagnostics;
}

const NUMERIC_PARAM_NAMES = new Set([
  'timeout',
  'seconds',
  'delay',
  'retry',
  'retries',
  'retry_delay',
  'port',
  'index',
  'status_code',
  'count',
  'max_depth',
  'limit',
  'offset',
  'wait_seconds',
  'implicit',
  'page_load',
  'multiplier',
  'size_abs_delta',
  'max_requests',
  'requests_per_second',
]);

const BOOLEAN_PARAM_NAMES = new Set([
  'failsafe',
  'continue_on_failure',
  'follow_redirects',
  'session_replay',
  'disabled',
  'enabled',
  'secure',
  'http_only',
  'clear',
  'strict',
]);

function typeCheckDiagnostic(
  argument: ConstructorSegment,
  param: { name: string; type?: string },
  component: string,
  action: string,
): ConstructorDiagnostic | null {
  const val = argument.text.trim();
  if (!val || val.startsWith('$') || val.startsWith('${')) {
    return null;
  }
  const pType = (param.type || '').toLowerCase();
  const pName = (param.name || '').toLowerCase();

  const isNum = pType === 'int' || pType === 'integer' || pType === 'float' || pType === 'number' || NUMERIC_PARAM_NAMES.has(pName);
  if (isNum && pType !== 'str' && pType !== 'string') {
    if (!/^-?\d+(?:\.\d+)?$/.test(val)) {
      return {
        severity: 'error',
        message: `${component}|${action}: параметр «${param.name}» ожидает число или $переменную, получено «${val}».`,
        start: argument.start,
        end: argument.end,
      };
    }
  }

  const isBool = pType === 'bool' || pType === 'boolean' || BOOLEAN_PARAM_NAMES.has(pName);
  if (isBool && pType !== 'str' && pType !== 'string') {
    if (!['true', 'false', '1', '0', 'да', 'нет'].includes(val.toLowerCase())) {
      return {
        severity: 'error',
        message: `${component}|${action}: параметр «${param.name}» ожидает true/false или $переменную, получено «${val}».`,
        start: argument.start,
        end: argument.end,
      };
    }
  }

  return null;
}

export function diagnoseWireArgs(
  parsed: ParsedConstructor,
  keyword: KeywordAction,
  knownVariables: readonly string[],
  actionSegment: ConstructorSegment,
  valueLength: number,
): ConstructorDiagnostic[] {
  const diagnostics: ConstructorDiagnostic[] = [];
  const params = keyword.params;

  parsed.args.forEach((argument, argumentIndex) => {
    const param = params[argumentIndex];
    if (param === undefined) {
      diagnostics.push({
        severity: 'error',
        message:
          `Лишний аргумент: «${parsed.component}|${parsed.action}» принимает ${String(params.length)} ` +
          `(${params.map((item) => item.name).join(', ') || 'ни одного'}). ` +
          'Лишние аргументы рантайм собирает в extra_args, и вызов метода падает с TypeError.',
        start: argument.start,
        end: argument.end,
      });
      return;
    }
    if (param.kind === 'var_positional') {
      diagnostics.push({
        severity: 'error',
        message:
          `Аргумент попадает в *${param.name}: рантайм передаёт аргументы по имени, ` +
          `а параметр *${param.name} по имени передать нельзя — вызов упадёт с TypeError.`,
        start: argument.start,
        end: argument.end,
      });
      return;
    }
    if (argument.text.length === 0 && param.required) {
      diagnostics.push({
        severity: 'warning',
        message: `Обязательный параметр «${param.name}» передан пустой строкой.`,
        start: argument.start,
        end: argument.end,
      });
    }
    const typeDiag = typeCheckDiagnostic(argument, param, parsed.component, parsed.action);
    if (typeDiag) {
      diagnostics.push(typeDiag);
    }
    diagnostics.push(...variableDiagnostics(argument, knownVariables));
  });

  const missing = params
    .slice(parsed.args.length)
    .filter(
      (param) =>
        param.required && param.kind !== 'var_positional' && param.kind !== 'var_keyword',
    );
  if (missing.length > 0) {
    diagnostics.push({
      severity: 'error',
      message:
        `Не заданы обязательные параметры без значения по умолчанию: ` +
        `${missing.map((param) => param.name).join(', ')}.`,
      start: actionSegment.start,
      end: valueLength,
    });
  }
  return diagnostics;
}
