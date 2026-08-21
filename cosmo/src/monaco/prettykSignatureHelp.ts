/**
 * PrettyK SignatureHelp для MethodId (паритет с WireK constructor signature).
 */
import type * as monacoNs from 'monaco-editor';
import {
  formatDefault,
  formatParam,
  formatSignature,
  getAction,
  keywordCatalog,
  type KeywordAction,
  type KeywordCatalog,
  type SignatureLabel,
} from '../keywords/catalog';
import { describeAction, parseConstructor, segmentAtOffset } from '../keywords/constructor';
import { resolveMethodIdLabel } from '../keywords/methodIds';
import { splitFirstToken } from '../keywords/textScan';
import { getConstructorContext } from './constructorLanguage';
import {
  activePrettyArgIndex,
  formatPrettyMethodSignature,
} from './prettykSignatureHelpCore';

export {
  activePrettyArgIndex,
  formatPrettyMethodSignature,
} from './prettykSignatureHelpCore';

function helpResult(
  signature: SignatureLabel,
  keyword: KeywordAction,
  documentation: string,
  activeParameter: number,
): monacoNs.languages.SignatureHelpResult {
  return {
    value: {
      signatures: [
        {
          label: signature.label,
          documentation: { value: documentation },
          parameters: keyword.params.map((param, index) => ({
            label: signature.parameterRanges[index] ?? formatParam(param),
            documentation: param.required
              ? 'обязательный параметр'
              : `по умолчанию ${formatDefault(param) ?? 'None'}`,
          })),
        },
      ],
      activeSignature: 0,
      activeParameter: Math.max(
        0,
        Math.min(activeParameter, Math.max(0, keyword.params.length - 1)),
      ),
    },
    dispose: () => undefined,
  };
}

function wireSignatureHelp(
  line: string,
  column: number,
  catalog: KeywordCatalog,
): monacoNs.languages.SignatureHelpResult | null {
  if (!line.includes('|')) {
    return null;
  }
  const parsed = parseConstructor(line.trim());
  const keyword = getAction(catalog, parsed.component, parsed.action);
  if (!keyword) {
    return null;
  }
  const trimmed = line.trimStart();
  const indent = line.length - trimmed.length;
  const offsetInTrimmed = Math.max(0, column - 1 - indent);
  const segment = segmentAtOffset(trimmed, offsetInTrimmed);
  const signature = formatSignature(parsed.component, parsed.action, keyword);
  return helpResult(
    signature,
    keyword,
    describeAction(parsed.component, parsed.action, keyword),
    Math.max(0, segment.index - 2),
  );
}

export function createPrettykSignatureHelpProvider(): monacoNs.languages.SignatureHelpProvider {
  return {
    signatureHelpTriggerCharacters: [' ', '|', '"', "'", '$'],
    signatureHelpRetriggerCharacters: [' ', '|'],
    provideSignatureHelp(model, position) {
      const catalog = getConstructorContext()?.catalog ?? keywordCatalog;
      const line = model.getLineContent(position.lineNumber);
      const column = position.column;

      const trimmed = line.trimStart();
      if (!trimmed) {
        return null;
      }
      const indent = line.length - trimmed.length;
      const cursorInTrimmed = Math.max(0, column - 1 - indent);
      const { head } = splitFirstToken(trimmed);
      if (!head) {
        return null;
      }

      const entry = resolveMethodIdLabel(head);
      if (entry) {
        const keyword = getAction(catalog, entry.component, entry.action);
        if (keyword) {
          const signature = formatPrettyMethodSignature(entry.id, keyword);
          const active = activePrettyArgIndex(trimmed, head.length, cursorInTrimmed);
          return helpResult(
            signature,
            keyword,
            `${describeAction(entry.component, entry.action, keyword)}\n\`${entry.wirek}\``,
            active,
          );
        }
      }

      return wireSignatureHelp(line, column, catalog);
    },
  };
}
