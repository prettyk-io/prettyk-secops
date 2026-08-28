/**
 * DSL-F4: Sugar Diagnostics — понятные ошибки парсинга sugar.
 *
 * - `Клик ".NET Core"` → «Неоднозначный селектор. Используйте `Клик text ".NET Core"`»
 * - `Вставить $var "значение"` → «Порядок аргументов: Вставить <селектор> <значение>»
 */
import type * as monacoNs from 'monaco-editor';
import { isSugarAlias } from './monacoKeywordSugar';

const MARKER_OWNER = 'pk-sugar-diagnostics';

export interface SugarDiagnostic {
  line: number;     // 1-based
  message: string;
  severity: 'error' | 'warning';
  startCol?: number;
  endCol?: number;
}

/**
 * Проанализировать строку на сахарные ошибки.
 */
export function analyzeSugarLine(line: string, lineNumber: number): SugarDiagnostic[] {
  const diags: SugarDiagnostic[] = [];
  const clean = line.trim();
  if (!clean || clean.startsWith('#') || clean.startsWith('@')) return diags;

  // Проверка: короткий глагол + селектор без стратегии
  const firstWord = clean.split(/\s+/)[0] ?? '';

  if (isSugarAlias(firstWord) || /^(Нажать|Клик|Вставить|Дописать|Очистить|Выбрать|Ждать|ЖдатьЭлемент)$/.test(firstWord)) {
    // Проверка на порядок аргументов: $var не должен идти до селектора
    const args = clean.slice(firstWord.length).trim();
    if (/^\$\S+\s/.test(args)) {
      diags.push({
        line: lineNumber,
        message: `Порядок аргументов: ${firstWord} <селектор> <значение>. Переменная $var должна идти после селектора.`,
        severity: 'error',
        startCol: firstWord.length + 1,
        endCol: firstWord.length + (args.split(/\s+/)[0]?.length ?? 0) + 1,
      });
    }

    // Проверка на неоднозначный селектор: селектор без стратегии + значение с пробелами
    const strategyMatch = /^\s+(role|css|text|label|test_id|xpath)\s+/.exec(args);
    if (!strategyMatch && args.length > 0) {
      // Есть аргументы, но нет явной стратегии
      const rawSelector = args.split(/\s+/)[0] ?? '';
      if (rawSelector.startsWith('"') || rawSelector.startsWith("'")) {
        diags.push({
          line: lineNumber,
          message: `Неоднозначный селектор. Используйте «${firstWord} text "${rawSelector.replace(/^"|"$/g, '').slice(0, 20)}"» или «${firstWord} css "${rawSelector.replace(/^"|"$/g, '').slice(0, 20)}"»`,
          severity: 'warning',
          startCol: firstWord.length + 1,
          endCol: clean.length + 1,
        });
      }
    }
  }

  return diags;
}

/**
 * Применить сахарные диагностики к модели редактора.
 */
export function applySugarDiagnostics(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
): void {
  const lineCount = model.getLineCount();
  const markers: monacoNs.editor.IMarkerData[] = [];

  for (let i = 1; i <= lineCount; i++) {
    const line = model.getLineContent(i);
    const diags = analyzeSugarLine(line, i);
    for (const d of diags) {
      markers.push({
        severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        message: d.message,
        startLineNumber: d.line,
        startColumn: d.startCol ?? 1,
        endLineNumber: d.line,
        endColumn: d.endCol ?? line.length + 1,
      });
    }
  }

  monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
}