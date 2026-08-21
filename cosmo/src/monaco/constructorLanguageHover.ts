/**
 * WireK hover provider (S3776).
 */
import type * as monacoNs from 'monaco-editor';
import type { KeywordCatalog } from '../keywords/catalog';
import { formatSignature, getAction, getComponent } from '../keywords/catalog';
import {
  describeAction,
  parseConstructor,
  segmentAtOffset,
} from '../keywords/constructor';
import { modelOffsetToLogical, toLogicalConstructor } from '../keywords/offsets';

type GetContext = () =>
  | { catalog: KeywordCatalog; variables: readonly string[]; pageIds: readonly string[] }
  | undefined;

type LogicalRange = (
  model: monacoNs.editor.ITextModel,
  raw: string,
  start: number,
  end: number,
) => monacoNs.IRange;

export function createConstructorHoverProvider(
  getContext: GetContext,
  logicalRange: LogicalRange,
): monacoNs.languages.HoverProvider {
  return {
    provideHover(model, position) {
      const active = getContext();
      if (!active) {
        return null;
      }
      const raw = model.getValue();
      const logical = toLogicalConstructor(raw);
      const offset = modelOffsetToLogical(raw, model.getOffsetAt(position));
      const segment = segmentAtOffset(logical, offset);
      const parsed = parseConstructor(logical);
      const range = logicalRange(model, raw, segment.start, segment.end);

      if (segment.index === 0) {
        const component = getComponent(active.catalog, parsed.component);
        if (!component) {
          return null;
        }
        return {
          range,
          contents: [
            { value: `**${parsed.component}** — \`${component.class}\`` },
            { value: `Адаптер: \`${component.module}\`` },
            { value: `Доступно действий: ${String(Object.keys(component.actions).length)}` },
          ],
        };
      }

      if (segment.index === 1) {
        const keyword = getAction(active.catalog, parsed.component, parsed.action);
        if (!keyword) {
          return null;
        }
        const signature = formatSignature(parsed.component, parsed.action, keyword);
        return {
          range,
          contents: [
            { value: `\`${signature.label}\`` },
            { value: describeAction(parsed.component, parsed.action, keyword) },
            { value: `Определён в \`${keyword.defined_in}\`` },
          ],
        };
      }

      return null;
    },
  };
}
