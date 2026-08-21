/**
 * Hover MethodId на PrettyK (ED5 паритет): дешёвый перенос смысла WireK hover.
 */
import type * as monacoNs from 'monaco-editor';
import { resolveMethodIdLabel } from '../keywords/methodIds';

const TOKEN_RE = /[A-Za-zА-Яа-яЁё_][\wА-Яа-яЁё]*/g;

export function methodIdAt(lineText: string, column: number): string | undefined {
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(lineText)) !== null) {
    const start = match.index + 1;
    const end = start + match[0].length;
    if (column >= start && column <= end) {
      return match[0];
    }
  }
  return undefined;
}

export function createPrettykHoverProvider(): monacoNs.languages.HoverProvider {
  return {
    provideHover(model, position) {
      const lineText = model.getLineContent(position.lineNumber);
      // Scenario failsafe `<!>` — первая строка canvas.
      if (
        position.lineNumber === 1 &&
        lineText.startsWith('<!>') &&
        position.column <= 3
      ) {
        return {
          range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 4,
          },
          contents: [
            { value: '**`<!>`** — failsafe сценария' },
            {
              value:
                'Падение сценария не валит этап-1 (разведочная проверка / допустимый отказ).',
            },
          ],
        };
      }
      const token = methodIdAt(lineText, position.column);
      if (!token) {
        return null;
      }
      const entry = resolveMethodIdLabel(token);
      if (!entry) {
        return null;
      }
      const start = lineText.indexOf(token) + 1;
      const voiceHint =
        entry.id === 'СборИнформации'
          ? 'Обход URL в браузере, затем паутина ZAP по живому графу. Не плоский Сканер.'
          : entry.id === 'ФаззингВолна'
            ? 'Волна фаззинга по id фаззера из Studio. Параметры из журнала трафика — галка в форме фаззера.'
            : undefined;
      return {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: start,
          endLineNumber: position.lineNumber,
          endColumn: start + token.length,
        },
        contents: [
          { value: `**${entry.id}** → \`${entry.wirek}\`` },
          {
            value: (() => {
              if (token !== entry.id) {
                return `Alias → канон \`${entry.id}\``;
              }
              return `tier: ${entry.tier ?? 'util'}`;
            })(),
          },
          ...(voiceHint ? [{ value: voiceHint }] : []),
        ],
      };
    },
  };
}
