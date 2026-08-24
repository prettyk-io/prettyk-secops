/**
 * WireK signature help provider (S3776).
 */
import type * as monacoNs from 'monaco-editor';
import type { KeywordCatalog } from '../keywords/catalog';
import {
  formatDefault,
  formatParam,
  formatSignature,
  getAction,
} from '../keywords/catalog';
import {
  describeAction,
  parseConstructor,
  segmentAtOffset,
} from '../keywords/constructor';
import { modelOffsetToLogical, toLogicalConstructor } from '../keywords/offsets';

type GetContext = () =>
  | { catalog: KeywordCatalog; variables: readonly string[]; pageIds: readonly string[] }
  | undefined;

export function createConstructorSignatureHelpProvider(
  getContext: GetContext,
): monacoNs.languages.SignatureHelpProvider {
  return {
    signatureHelpTriggerCharacters: ['|'],
    signatureHelpRetriggerCharacters: ['|'],
    provideSignatureHelp(model, position) {
      const active = getContext();
      if (!active) {
        return null;
      }
      const raw = model.getValue();
      const logical = toLogicalConstructor(raw);
      const parsed = parseConstructor(logical);
      const keyword = getAction(active.catalog, parsed.component, parsed.action);
      if (keyword === undefined) {
        return null;
      }
      const offset = modelOffsetToLogical(raw, model.getOffsetAt(position));
      const segment = segmentAtOffset(logical, offset);
      const signature = formatSignature(parsed.component, parsed.action, keyword);

      return {
        value: {
          signatures: [
            {
              label: signature.label,
              documentation: {
                value: describeAction(parsed.component, parsed.action, keyword),
              },
              parameters: keyword.params.map((param, index) => ({
                label: signature.parameterRanges[index] ?? formatParam(param),
                documentation: param.required
                  ? 'обязательный параметр'
                  : `по умолчанию ${formatDefault(param) ?? 'None'}`,
              })),
            },
          ],
          activeSignature: 0,
          activeParameter: Math.max(0, Math.min(segment.index - 2, keyword.params.length - 1)),
        },
        dispose: () => {
          /* нечего освобождать */
        },
      };
    },
  };
}
