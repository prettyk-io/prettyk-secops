/**
 * DSL-F2: Smart Locator Hover в Monaco.
 *
 * Наведение на селектор → подсветка элемента в BrowserStage.
 * Интеграция с BrowserStage.tsx через window.postMessage.
 */
import type * as monacoNs from 'monaco-editor';

const HOVER_DEBOUNCE_MS = 200;
let _hoverTimer: ReturnType<typeof setTimeout> | null = null;

export interface LocatorHoverPayload {
  type: 'pk-locator-hover';
  locator: { strategy: string; value: string };
}

/**
 * Создать Hover Provider для PrettyK/WireK языка.
 * При наведении на строку вида `Нажать css .btn` → пытается
 * извлечь стратегию+значение и послать BrowserStage.
 */
export function createSmartLocatorHoverProvider(
  monaco: typeof monacoNs,
): monacoNs.languages.HoverProvider {
  return {
    provideHover(model, position) {
      const lineContent = model.getLineContent(position.lineNumber);
      const clean = lineContent.trim();

      // Ищем селектор: Нажать|Вставить|Клик <strategy> "<value>"
      const locatorMatch = /(?:Нажать|Клик|Вставить|Дописать|Очистить|Выбрать|Ждать|ЖдатьЭлемент)\s+(role|css|text|label|test_id|xpath)\s+"([^"]+)"/i.exec(clean);
      if (!locatorMatch || !locatorMatch[1] || !locatorMatch[2]) return null;
      const strategy: string = locatorMatch[1];
      const value: string = locatorMatch[2];

      // Отправляем в BrowserStage через postMessage
      const payload: LocatorHoverPayload = {
        type: 'pk-locator-hover',
        locator: { strategy, value },
      };
      window.postMessage(payload, '*');

      return {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: clean.length + 1,
        },
        contents: [
          { value: `**${strategy}** ⟶ \`${value}\`` },
          { value: `Нажмите, чтобы подсветить в браузере` },
        ],
      };
    },
  };
}

export function registerSmartLocatorHover(monaco: typeof monacoNs, languageId: string) {
  const provider = createSmartLocatorHoverProvider(monaco);
  return monaco.languages.registerHoverProvider(languageId, provider);
}