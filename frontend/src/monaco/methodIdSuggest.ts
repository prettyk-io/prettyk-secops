/**
 * Общие подсказки MethodId / ворот для constructor + pk-script.
 * Первая стрелка: ui + Проверить* (assert) + ворота. Util — только за воротами.
 */
import type * as monacoNs from 'monaco-editor';
import {
  facadeMethods,
  facadeNames,
  resolveFacadeName,
  resolveMethodIdLabel,
  rootLabelsByTier,
  rootUiLabels,
} from '../keywords/methodIds';

/** Если строка — ворота + (опционально) метод/аргументы. */
export function parseFacadePrefix(
  text: string,
): {
  facade: string;
  rawFacade: string;
  methodPrefix: string;
  afterFacade: string;
} | undefined {
  const trimmed = text.trimStart();
  let i = 0;
  while (i < trimmed.length && trimmed[i] !== ' ' && trimmed[i] !== '\t') {
    i += 1;
  }
  const rawFacade = trimmed.slice(0, i);
  if (!rawFacade) {
    return undefined;
  }
  const facade = resolveFacadeName(rawFacade);
  if (!facade) {
    return undefined;
  }
  let afterFacade = trimmed.slice(i);
  while (afterFacade.startsWith(' ') || afterFacade.startsWith('\t')) {
    afterFacade = afterFacade.slice(1);
  }
  const methodPrefix = afterFacade.split(/\s/, 1)[0] ?? '';
  return { facade, rawFacade, methodPrefix, afterFacade };
}

const TIER_SORT: Record<string, string> = {
  ui: '1',
  assert: '3',
  util: '4',
};

function facadeDoc(facade: string): string {
  if (facade === 'Драйвер') {
    return 'Хвост WebDriver/Selene (дубли корня тоже здесь). Alias: Браузер, WD.';
  }
  if (facade === 'Сессия') {
    return 'Cookies, cache, storage, DevTools/CDP. Alias: CDP.';
  }
  return `Домен ${facade}: методы только после «${facade} ».`;
}

export function rootMethodSuggestions(
  monaco: typeof monacoNs,
  range: monacoNs.IRange,
  triggerSuggest?: monacoNs.languages.Command,
): monacoNs.languages.CompletionItem[] {
  const out: monacoNs.languages.CompletionItem[] = [];

  for (const label of rootUiLabels()) {
    const entry = resolveMethodIdLabel(label);
    out.push({
      label,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: `${label} `,
      detail: entry ? `UI → ${entry.wirek}` : 'MethodId',
      documentation: entry
        ? { value: `Корень (первая стрелка) → \`${entry.wirek}|…\`` }
        : undefined,
      range,
      sortText: `1_${label}`,
    });
  }

  // assert: канон Проверить* (без legacy Утвердить*) — в SAMPLE и сценариях на корне.
  for (const label of rootLabelsByTier('assert')) {
    const entry = resolveMethodIdLabel(label);
    out.push({
      label,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: `${label} `,
      detail: entry ? `Проверить → ${entry.wirek}` : 'MethodId assert',
      documentation: entry
        ? { value: `Проверка (tier=assert) → \`${entry.wirek}|…\`` }
        : undefined,
      range,
      sortText: `3_${label}`,
    });
  }

  for (const facade of facadeNames()) {
    out.push({
      label: facade,
      kind: monaco.languages.CompletionItemKind.Module,
      insertText: `${facade} `,
      detail: `ворота → ${facade} <метод>`,
      documentation: { value: facadeDoc(facade) },
      range,
      sortText: `2_${facade}`,
      ...(triggerSuggest ? { command: triggerSuggest } : {}),
    });
  }

  return out;
}

/**
 * RHS после `Пусть … =`: результат шага кладётся в переменную
 * (`Пусть ${c} = Сессия КоличествоCookies`). До ворот — корень, после — их методы.
 */
export function rhsMethodSuggestions(
  monaco: typeof monacoNs,
  rhs: string,
  range: monacoNs.IRange,
  triggerSuggest?: monacoNs.languages.Command,
): monacoNs.languages.CompletionItem[] {
  const byPrefix = (
    items: monacoNs.languages.CompletionItem[],
    prefix: string,
  ): monacoNs.languages.CompletionItem[] =>
    prefix
      ? items.filter((item) => String(item.label).toLowerCase().startsWith(prefix.toLowerCase()))
      : items;

  const facadeCtx = parseFacadePrefix(rhs);
  if (facadeCtx && rhs.trimStart().includes(' ')) {
    return byPrefix(
      facadeMethodSuggestions(monaco, facadeCtx.facade, range),
      facadeCtx.methodPrefix,
    );
  }
  return byPrefix(rootMethodSuggestions(monaco, range, triggerSuggest), rhs.trim().split(/\s/, 1)[0] ?? '');
}

export function facadeMethodSuggestions(
  monaco: typeof monacoNs,
  facade: string,
  range: monacoNs.IRange,
): monacoNs.languages.CompletionItem[] {
  return facadeMethods(facade).map((entry) => ({
    label: entry.id,
    kind: monaco.languages.CompletionItemKind.Method,
    insertText: `${entry.id} `,
    detail: `${facade} → ${entry.wirek}`,
    documentation: { value: `\`${entry.wirek}|…\`` },
    range,
    sortText: `0_${entry.id}`,
  }));
}

export { TIER_SORT };
