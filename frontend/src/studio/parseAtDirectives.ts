/**
 * Извлечение @-директив из constructor-текста сценария/страницы.
 * @ Description / @ Описание → scenario.description
 * @ Title / @ Название → переопределение заголовка
 */
export interface AtDirectives {
  description?: string;
  title?: string;
}

export function parseAtDirectives(text: string): AtDirectives {
  const result: AtDirectives = {};
  if (!text) return result;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const t = line.trim();
    const mDesc = t.match(/^@\s*(?:Description|Описание)\s+(.+)$/i);
    if (mDesc?.[1]) {
      result.description = mDesc[1].trim();
      continue;
    }
    const mTitle = t.match(/^@\s*(?:Title|Название)\s+(.+)$/i);
    if (mTitle?.[1]) {
      result.title = mTitle[1].trim();
    }
  }
  return result;
}