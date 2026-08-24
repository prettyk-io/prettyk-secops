/**
 * Folding ranges для Если / Цикл / Попытка (ED4).
 * Эвристика по отступам: блок от ключевого слова до меньшей/равной колонки.
 */
import type * as monacoNs from 'monaco-editor';

/** `\b` ломается на кириллице — см. prettykSymbols. */
const FOLD_START_RE =
  /^\s*(Если|ИначеЕсли|Цикл|Пока|Попытка)(?=[\s#]|$|[^\wА-Яа-яЁё])/;

export interface PrettykFoldRange {
  start: number;
  end: number;
  kind?: 'region';
}

function indentOf(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

/** Чистый extract folding (unit). */
export function extractPrettykFoldRanges(text: string): PrettykFoldRange[] {
  const lines = text.split(/\r?\n/);
  const ranges: PrettykFoldRange[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    if (!FOLD_START_RE.test(raw)) {
      continue;
    }
    const baseIndent = indentOf(raw);
    let end = i;
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j] ?? '';
      if (!next.trim()) {
        end = j;
        continue;
      }
      const ind = indentOf(next);
      if (ind <= baseIndent) {
        break;
      }
      end = j;
    }
    if (end > i) {
      ranges.push({ start: i + 1, end: end + 1, kind: 'region' });
    }
  }
  return ranges;
}

export function createPrettykFoldingRangeProvider(
  monaco: typeof monacoNs,
): monacoNs.languages.FoldingRangeProvider {
  return {
    provideFoldingRanges(model) {
      return extractPrettykFoldRanges(model.getValue()).map((r) => ({
        start: r.start,
        end: r.end,
        kind: r.kind === 'region' ? monaco.languages.FoldingRangeKind.Region : undefined,
      }));
    },
  };
}
