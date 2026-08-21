/**
 * Разбор и диагностика строки-конструктора `component|action|arg1|arg2|...`.
 *
 * Логика повторяет рантайм:
 *   - Controller._parse_constructor разбивает строку по `|`, первый элемент — компонент,
 *     второй — action, остальные позиционно раскладываются по именам параметров метода;
 *     лишние аргументы уходят в `extra_args`, из-за чего вызов падает.
 *   - строка без `|` / неизвестный action — WiredError (рантайм больше не подменяет на log).
 *   - Backend-валидатор (dev API) использует тот же каталог, что export_keywords.
 *   - DataStream: канон ${var} / path.
 *
 * Модуль чистый: ни React, ни Monaco. Используется и виджетом, и тестами.
 */
import type { KeywordAction, KeywordCatalog, KeywordParam } from './catalog';
import { formatDefault } from './catalog';
import { describeKeywordAction } from './constructorDescribe';
import { collectConstructorsFromValue } from './constructorCollect';
import { flattenConstructorsInObject } from './constructorFlatten';
import {
  analyzeContextIncludeLines,
  analyzeGluedAssignmentLines,
  analyzeOpenNavigationLines,
} from './constructorLineNav';
import { advanceConstructorSplit } from './constructorSplit';
import { analyzeWireConstructor } from './constructorWireAnalyze';
import { detectLanguageScript } from './constructorLanguageDetect';
import { parseScenarioFailsafePrefix } from './scenarioFailsafe';
import { prettyTextToWire } from './prettyToWire';

export {
  analyzeContextIncludeLines,
  analyzeGluedAssignmentLines,
  analyzeOpenNavigationLines,
} from './constructorLineNav';
export {
  CONTEXT_INCLUDE_FORMAT_MSG,
  contextIncludeAllowed,
  OPEN_ABSOLUTE_MSG,
} from './constructorLineNav';

export const CONSTRUCTOR_SEPARATOR = '|';

export function looksLikeLanguageScript(text: string): boolean {
  return detectLanguageScript(text);
}

/**
 * Нормализация constructor перед рантаймом/скачиванием.
 * Wire-лист: переносы → пробелы (как раньше).
 * Language-скрипт: сохраняем `\n`, только CRLF→LF.
 */
export function flattenConstructorText(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (looksLikeLanguageScript(normalized)) {
    return normalized.replace(/\n{3,}/g, '\n\n').trim();
  }
  return normalized.replace(/\n+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * Текст для backend-проверки.
 * Language-скрипт передаём без схлопывания пустых строк: backend offsets тогда совпадают
 * с координатами Monaco. Wire остаётся плоским контрактом рантайма.
 */
export function constructorValidationText(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return looksLikeLanguageScript(normalized) ? normalized : flattenConstructorText(normalized);
}

export type CollectedConstructor = {
  /** Стабильный id для batch-validate. */
  id: string;
  /** JSON Pointer-подобный путь для сообщения. */
  path: string;
  text: string;
};

/**
 * Непустые `constructor` страниц и сценариев.
 * `test_data_constructor` не собираем: модули не wire (`|`) и не MethodId-шаги.
 */
export function collectConstructorFields(
  data: unknown,
  path = '',
): CollectedConstructor[] {
  return collectConstructorsFromValue(data, path, constructorValidationText);
}

/**
 * Перед скачиванием/копированием/JSON Студии:
 * flatten + pretty/MethodId → wire (`Открыть x` → `webdriver|open|x`).
 * Модули не трогаем — там URL-stream / свои форматы, не перевод в `|`.
 */
export function flattenConstructorsInData(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => flattenConstructorsInData(item));
  }
  if (data !== null && typeof data === 'object') {
    return flattenConstructorsInObject(
      data as Record<string, unknown>,
      flattenConstructorsInData,
      prettyTextToWire,
      flattenConstructorText,
    );
  }
  return data;
}

export interface ConstructorSegment {
  /** 0 — компонент, 1 — action, дальше аргументы. */
  index: number;
  text: string;
  /** Смещения в исходной строке: [start, end). */
  start: number;
  end: number;
}

export type DiagnosticSeverity = 'error' | 'warning';

export interface ConstructorDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  start: number;
  end: number;
  line?: number;
  column?: number;
  /** Смещения относятся к Monaco-модели, а не к flattened wire. */
  coordinateSpace?: 'logical' | 'model';
}

export interface ParsedConstructor {
  segments: ConstructorSegment[];
  component: string;
  action: string;
  args: ConstructorSegment[];
}

/** Разбить по `|` вне кавычек и вне `${…}` (как orchestrator/core/wire_split.py). */
export function splitConstructor(value: string): ConstructorSegment[] {
  const segments: ConstructorSegment[] = [];
  let start = 0;
  let index = 0;
  let inStr: string | null = null;
  let i = 0;
  const push = (end: number) => {
    segments.push({ index, text: value.slice(start, end), start, end });
    index += 1;
    start = end + 1;
  };
  while (i < value.length) {
    const next = advanceConstructorSplit(value, i, inStr, CONSTRUCTOR_SEPARATOR, push);
    i = next.i;
    inStr = next.inStr;
  }
  push(value.length);
  return segments;
}

export function parseConstructor(value: string): ParsedConstructor {
  const segments = splitConstructor(value);
  return {
    segments,
    component: segments[0]?.text.trim() ?? '',
    action: segments[1]?.text.trim() ?? '',
    args: segments.slice(2),
  };
}

/** Индекс сегмента, в котором находится смещение курсора. */
export function segmentAtOffset(value: string, offset: number): ConstructorSegment {
  const segments = splitConstructor(value);
  for (const segment of segments) {
    if (offset >= segment.start && offset <= segment.end) {
      return segment;
    }
  }
  const last = segments[segments.length - 1];
  return last ?? { index: 0, text: '', start: 0, end: 0 };
}

/** Параметр, ожидаемый на позиции аргумента (0 — первый аргумент после action). */
export function paramAt(keyword: KeywordAction, argumentIndex: number): KeywordParam | undefined {
  return keyword.params[argumentIndex];
}

export interface AnalyzeOptions {
  /** Имена переменных, объявленных в манифесте (save_as шагов, id контекстных объектов). */
  knownVariables?: readonly string[];
  /** infrastructure.allowed_extra_domains — для ОткрытьПоURL / ВключитьВКонтекст. */
  allowedExtraDomains?: string;
  /** infrastructure.base_url_override — для ВключитьВКонтекст. */
  baseUrl?: string;
}

export function analyzeConstructor(
  value: string,
  catalog: KeywordCatalog,
  options: AnalyzeOptions = {},
): ConstructorDiagnostic[] {
  const knownVariables = options.knownVariables ?? [];
  const allowedExtraDomains = options.allowedExtraDomains ?? '';
  const baseUrl = options.baseUrl ?? '';
  const diagnostics: ConstructorDiagnostic[] = [];

  if (value.trim().length === 0) {
    return [{ severity: 'error', message: 'Конструктор не заполнен.', start: 0, end: 0 }];
  }

  let analyzeValue = value;
  let bodyOffset = 0;
  try {
    const parsed = parseScenarioFailsafePrefix(value);
    if (parsed.allowed) {
      analyzeValue = parsed.body;
      bodyOffset = parsed.bodyOffset;
      if (analyzeValue.trim().length === 0) {
        return [];
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Некорректный маркер <!>';
    return [{ severity: 'error', message: msg, start: 0, end: Math.min(3, value.length) }];
  }

  const lineNav = [
    ...analyzeOpenNavigationLines(analyzeValue, allowedExtraDomains),
    ...analyzeContextIncludeLines(analyzeValue, { allowedExtraDomains, baseUrl }),
    ...analyzeGluedAssignmentLines(analyzeValue),
  ].map((d) => ({
    ...d,
    start: d.start + bodyOffset,
    end: d.end + bodyOffset,
  }));

  // Language-скрипт (? / Пусть / Если…) — wire-разбор не применим; backend validate_language_script.
  // Allowlist / Открыть / ВключитьВКонтекст / склейка Пусть|Секрет — построчно и в language.
  if (looksLikeLanguageScript(analyzeValue) || looksLikeLanguageScript(value)) {
    return lineNav;
  }

  const atDirOnly = analyzeValue.split('\n').every((ln) => {
    const t = ln.trim();
    return !t || t.startsWith('@') || t === '<!>';
  });
  if (atDirOnly && analyzeValue.trim().length > 0) {
    return lineNav;
  }

  diagnostics.push(...lineNav);
  diagnostics.push(
    ...analyzeWireConstructor(
      analyzeValue,
      catalog,
      parseConstructor(analyzeValue),
      knownVariables,
    ).map((d) => ({
      ...d,
      start: d.start + bodyOffset,
      end: d.end + bodyOffset,
    })),
  );
  return diagnostics;
}

/** Текст для панели подсказки под полем: описание действия и его параметры. */
export function describeAction(component: string, action: string, keyword: KeywordAction): string {
  return describeKeywordAction(component, action, keyword, formatDefault);
}
