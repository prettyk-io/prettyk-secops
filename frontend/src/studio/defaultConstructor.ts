/**
 * Дефолтный PrettyK: полотно ровно на CONSTRUCTOR_VISIBLE_LINES (32) строк.
 * Id задаётся только деревом. Не ужимать — иначе «слетают» пустые строки.
 * Enter в пустом хвосте не раздувает полотно сверх 32, пока контент < 32 строк.
 */
import { CONSTRUCTOR_VISIBLE_LINES } from '../monaco/constructorLayout';
import {
  lastNonEmptyLineNumber,
  targetConstructorLineCount,
} from '../monaco/minimumLines';

/** Добить до minLines и срезать пустой хвост сверх потолка (контент не режем). */
export function padConstructorCanvas(
  text: string,
  minLines: number = CONSTRUCTOR_VISIBLE_LINES,
): string {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const target = targetConstructorLineCount(
    lines.length,
    lastNonEmptyLineNumber(lines),
    minLines,
  );
  if (lines.length < target) {
    while (lines.length < target) {
      lines.push('');
    }
  } else if (lines.length > target) {
    lines.length = target;
  }
  return lines.join('\n');
}

export function defaultConstructorText(firstLine = ''): string {
  return padConstructorCanvas(firstLine);
}
