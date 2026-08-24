/**
 * Соответствие смещений: в редакторе допускаются переносы строк, а парсер конструктора
 * работает с одной логической строкой (переносы выкидываются).
 */

export function toLogicalConstructor(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[\r\n]/g, '');
}

/** Смещение в исходном тексте модели → смещение в логической строке без `\n`. */
export function modelOffsetToLogical(text: string, modelOffset: number): number {
  const clamped = Math.max(0, Math.min(modelOffset, text.length));
  return toLogicalConstructor(text.slice(0, clamped)).length;
}

/** Смещение в логической строке → смещение в тексте модели. */
export function logicalOffsetToModel(text: string, logicalOffset: number): number {
  let logical = 0;
  let contentEnd = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\r') {
      continue;
    }
    if (char === '\n') {
      continue;
    }
    if (logical === logicalOffset) {
      return index;
    }
    logical += 1;
    contentEnd = index + 1;
  }
  // Do not map the end of a logical constructor onto padded empty canvas lines.
  return contentEnd;
}
