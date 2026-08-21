import type * as monacoNs from 'monaco-editor';

const OWNER = 'prettyk-diagnostics';

export interface PrettyKDiagnostic {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: monacoNs.MarkerSeverity;
}

const PRETTYK_ROOT_KEYWORDS = [
  'Нажать', 'ОткрытьПоURL', 'Браузер', 'Ввод', 'Клик',
  'Проверить', 'Получить', 'Заголовок', 'Элемент',
  'Страница', 'Форма', 'Сессия', 'Cookie',
  'Найти', 'Ждать', 'Выбрать', 'Текст', 'Утверждение',
  'Отправить', 'Перейти', 'Закрыть',
];

const PRETTYK_PIPE_ACTIONS = [
  'Браузер|', 'webdriver|', 'zap|', 'http|', 'Сессия|',
  'Драйвер|', 'Фаззер|', 'Проверка|', 'Утверждение|',
  'Отчёт|',
];

const PIPE_LOCATOR_ACTIONS = new Set([
  'Браузер|ввод|', 'Браузер|клик|', 'Браузер|нажать|',
  'webdriver|input|', 'webdriver|click|', 'webdriver|press|',
  'Сессия|ввод|', 'Сессия|клик|',
]);

function stripComments(line: string): string {
  const commentIdx = line.indexOf('#');
  return commentIdx >= 0 ? line.substring(0, commentIdx) : line;
}

export function analyzePrettyk(model: monacoNs.editor.ITextModel): PrettyKDiagnostic[] {
  const diagnostics: PrettyKDiagnostic[] = [];
  const lineCount = model.getLineCount();

  for (let lineNum = 1; lineNum <= lineCount; lineNum++) {
    const rawLine = model.getLineContent(lineNum);
    const line = stripComments(rawLine).trim();
    if (!line) continue;

    const rawTrimmed = rawLine.trimStart();
    const indentLen = rawLine.length - rawTrimmed.length;

    checkPipeSyntax(line, lineNum, indentLen, diagnostics);
    checkRootKeyword(line, rawTrimmed, lineNum, indentLen, diagnostics);
    checkBraceBalance(line, lineNum, diagnostics, model);
  }

  return diagnostics;
}

function checkPipeSyntax(
  line: string, lineNum: number, indent: number, diags: PrettyKDiagnostic[],
): void {
  if (!line.includes('|')) return;

  const segments = line.split('|');
  if (segments.length < 2) {
    diags.push({
      startLine: lineNum, startColumn: indent + line.indexOf('|') + 1,
      endLine: lineNum, endColumn: indent + line.length + 1,
      message: 'Синтаксис: component | action | аргументы...',
      severity: 8 as monacoNs.MarkerSeverity,
    });
    return;
  }

  const pipeIdx = line.indexOf('|');
  const component = line.substring(0, pipeIdx).trim();
  if (!component) {
    diags.push({
      startLine: lineNum, startColumn: indent + 1,
      endLine: lineNum, endColumn: indent + pipeIdx + 2,
      message: 'Отсутствует название компонента перед |',
      severity: 8 as monacoNs.MarkerSeverity,
    });
    return;
  }

  const afterFirst = line.substring(pipeIdx + 1);
  const secondPipe = afterFirst.indexOf('|');
  const action = secondPipe >= 0 ? afterFirst.substring(0, secondPipe).trim() : afterFirst.trim();
  if (!action) {
    diags.push({
      startLine: lineNum, startColumn: indent + pipeIdx + 1,
      endLine: lineNum, endColumn: indent + line.length + 1,
      message: 'Отсутствует действие после компонента',
      severity: 8 as monacoNs.MarkerSeverity,
    });
  }
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

function checkRootKeyword(
  line: string, rawTrimmed: string, lineNum: number, indent: number, diags: PrettyKDiagnostic[],
): void {
  const lowerLine = line.toLowerCase();

  if (lowerLine.startsWith('открытьпоurl') || lowerLine.startsWith('открытьпоурл')) {
    const rest = line.substring(line.indexOf(' ') >= 0 ? line.indexOf(' ') + 1 : line.length).trim();
    if (!rest || !URL_PATTERN.test(rest)) {
      diags.push({
        startLine: lineNum, startColumn: indent + 1,
        endLine: lineNum, endColumn: indent + rawTrimmed.length + 1,
        message: 'ОткрытьПоURL требует валидный URL: ОткрытьПоURL https://...',
        severity: 8 as monacoNs.MarkerSeverity,
      });
    }
    return;
  }

  if (lowerLine.startsWith('нажать')) {
    const rest = line.substring(6).trim();
    if (!rest) {
      diags.push({
        startLine: lineNum, startColumn: indent + 1,
        endLine: lineNum, endColumn: indent + rawTrimmed.length + 1,
        message: 'Нажать ожидает цель: Нажать submit или Нажать css ".selector" или Нажать $el',
        severity: 4 as monacoNs.MarkerSeverity,
      });
    }
    return;
  }

  if (lowerLine.startsWith('ввод') && !lowerLine.includes('|')) {
    const rest = line.substring(4).trim();
    if (!rest) {
      diags.push({
        startLine: lineNum, startColumn: indent + 1,
        endLine: lineNum, endColumn: indent + rawTrimmed.length + 1,
        message: 'Ввод ожидает аргументы: Ввод email "значение" или Ввод css "selector" "значение"',
        severity: 4 as monacoNs.MarkerSeverity,
      });
    }
    return;
  }

  for (const prefix of PIPE_LOCATOR_ACTIONS) {
    if (lowerLine.startsWith(prefix.toLowerCase())) {
      const afterAction = line.substring(prefix.length).trim();
      if (!afterAction) {
        diags.push({
          startLine: lineNum, startColumn: indent + prefix.length + 1,
          endLine: lineNum, endColumn: indent + rawTrimmed.length + 1,
          message: 'Действие требует указания цели: css "selector" или $element',
          severity: 4 as monacoNs.MarkerSeverity,
        });
      }
      break;
    }
  }
}

function checkBraceBalance(
  line: string, _lineNum: number, _diags: PrettyKDiagnostic[],
  _model: monacoNs.editor.ITextModel,
): void {
  const open = (line.match(/\${/g) || []).length;
  const close = (line.match(/}/g) || []).length;
  if (open > close) {
    _diags.push({
      startLine: _lineNum,
      startColumn: line.lastIndexOf('${') + 1,
      endLine: _lineNum,
      endColumn: line.length + 1,
      message: 'Незакрытая фигурная скобка в ${...}',
      severity: 8 as monacoNs.MarkerSeverity,
    });
  }
}

export function applyPrettykDiagnostics(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
): void {
  const diags = analyzePrettyk(model);
  const markers = diags.map((d) => ({
    severity: d.severity,
    message: d.message,
    startLineNumber: d.startLine,
    startColumn: d.startColumn,
    endLineNumber: d.endLine,
    endColumn: d.endColumn,
  }));
  monaco.editor.setModelMarkers(model, OWNER, markers);
}

export function clearPrettykDiagnostics(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
): void {
  monaco.editor.setModelMarkers(model, OWNER, []);
}