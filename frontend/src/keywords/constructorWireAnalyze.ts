/**
 * Wire-path diagnostics for analyzeConstructor (S3776 extract).
 */
import type { KeywordCatalog } from './catalog';
import { getAction, getComponent } from './catalog';
import { compareLocaleStrings } from '../utils/sortStrings';
import type {
  ConstructorDiagnostic,
  ParsedConstructor,
} from './constructor';
import { diagnoseWireArgs } from './constructorWireArgs';

/** Catalog/args diagnostics for a parsed wire constructor line. */
export function analyzeWireConstructor(
  value: string,
  catalog: KeywordCatalog,
  parsed: ParsedConstructor,
  knownVariables: readonly string[],
): ConstructorDiagnostic[] {
  const diagnostics: ConstructorDiagnostic[] = [];
  const componentSegment = parsed.segments[0];
  const actionSegment = parsed.segments[1];

  if (componentSegment === undefined) {
    return diagnostics;
  }

  if (actionSegment === undefined) {
    return [
      {
        severity: 'error',
        message:
          'В строке нет разделителя «|»: нужен вид `component|action|…` или MethodId ' +
          '(`Нажать css .ok`). Рантайм вернёт WiredError — шаг не выполнится.',
        start: 0,
        end: value.length,
      },
    ];
  }

  const component = getComponent(catalog, parsed.component);
  if (component === undefined) {
    diagnostics.push({
      severity: 'error',
      message:
        `Неизвестный компонент «${parsed.component}». Доступны: ` +
        `${Object.keys(catalog.components).sort(compareLocaleStrings).join(', ')}.`,
      start: componentSegment.start,
      end: componentSegment.end,
    });
    return diagnostics;
  }

  const keyword = getAction(catalog, parsed.component, parsed.action);
  if (keyword === undefined) {
    diagnostics.push({
      severity: 'error',
      message:
        `Компонент «${parsed.component}» не имеет действия «${parsed.action}». ` +
        'Рантайм поднимет WiredError (Unknown action) — запуск остановится.',
      start: actionSegment.start,
      end: actionSegment.end,
    });
    return diagnostics;
  }

  diagnostics.push(
    ...diagnoseWireArgs(parsed, keyword, knownVariables, actionSegment, value.length),
  );
  return diagnostics;
}
