/**
 * Chain-play helpers for StudioWorkspace (S3776 extract).
 */
import type { StudioTab } from './studioTabs';
import { moduleIndexFromTabId, scenarioIndexFromTabId } from './studioTabs';
import { collectStudioNodes, tabFromNode } from './collectStudioNodes';
import { addResource, listResourceAsNames, updateResource } from './studioResources';
import { moduleRecordAt } from './studioModules';
import { appendHarImportSeed } from './seedHarImport';
import { attachChainFuzzTargets } from './chainFuzzAttach';
import { readConstructorSlice } from './studioWorkspaceOpenConstructor';

export type MsgApi = {
  error: (s: string) => void;
  warning: (s: string) => void;
  info: (s: string) => void;
  success: (s: string) => void;
};

export function ensureHarResourceForPlay(
  dataIn: unknown,
  harAs: string,
  message: MsgApi,
): unknown | null {
  const names = listResourceAsNames(dataIn);
  if (!names.includes(harAs)) {
    const added = addResource(dataIn, harAs, 'har_file');
    if (!added) {
      void message.error('Не удалось создать ресурс har_file');
      return null;
    }
    return added.data;
  }
  const bumped = updateResource(dataIn, names.indexOf(harAs), {
    kind: 'har_file',
    path: `resources/${harAs}.har`,
  });
  return bumped ?? dataIn;
}

export function seedChainPlayIntoScenario(args: {
  seed: string;
  message: MsgApi;
  formDataRef: { current: unknown };
  openTabsRef: { current: StudioTab[] };
  activeTabIdRef: { current: string | undefined };
  flushTab: (tab: StudioTab | undefined) => void;
  commitConstructorText: (tab: StudioTab, text: string) => void;
  openTab: (tab: StudioTab) => void;
}): void {
  if (!args.seed.trim()) {
    return;
  }
  const scenarios = collectStudioNodes(args.formDataRef.current).scenarios;
  const openScenario = args.openTabsRef.current.find(
    (tab) => scenarioIndexFromTabId(tab.id) !== undefined,
  );
  const openIdx = openScenario ? scenarioIndexFromTabId(openScenario.id) : undefined;
  const target =
    (openIdx !== undefined
      ? scenarios.find((s) => s.scenarioIndex === openIdx)
      : undefined) || scenarios[0];
  if (!target?.path) {
    void args.message.warning(
      'HAR в «Ресурсах»; создайте сценарий, чтобы вставить ВыполнитьЦепь',
    );
    return;
  }
  const currentTab = args.openTabsRef.current.find(
    (item) => item.id === args.activeTabIdRef.current,
  );
  args.flushTab(currentTab);
  const prev = readConstructorSlice(args.formDataRef.current, target.path);
  const nextText = appendHarImportSeed(prev, args.seed);
  const scenarioTab = tabFromNode(target);
  args.commitConstructorText(scenarioTab, nextText);
  args.openTab(scenarioTab);
}

export function attachChainPlayFuzz(args: {
  harAs: string;
  fuzzTargets: Array<{ method?: string; url?: string; body?: string }>;
  message: MsgApi;
  formDataRef: { current: unknown };
  onFormDataChange: (data: unknown) => void;
}): void {
  if (args.fuzzTargets.length === 0) {
    return;
  }
  const attached = attachChainFuzzTargets(
    args.formDataRef.current,
    args.harAs,
    args.fuzzTargets,
  );
  if (attached) {
    args.formDataRef.current = attached.data;
    args.onFormDataChange(attached.data);
    void args.message.info(
      `Фаззер «${attached.fuzzerId}»: +${String(attached.added)} цел.`,
    );
    return;
  }
  void args.message.warning(
    `Цели фаззинга: ${String(args.fuzzTargets.length)} — не удалось положить в Fuzzer`,
  );
}

export function attackBaseFromForm(formData: unknown): string {
  const root = formData as {
    infrastructure?: { base_url_override?: string };
    security_configuration?: { base_url_override?: string };
  };
  return String(
    root?.infrastructure?.base_url_override ||
      root?.security_configuration?.base_url_override ||
      '',
  );
}

export function moduleIdForTab(
  tab: StudioTab | undefined,
  formData: unknown,
  fallback: string,
): string {
  if (!tab) {
    return fallback;
  }
  const idx = moduleIndexFromTabId(tab.id);
  if (idx === undefined) {
    return fallback;
  }
  const id = String(moduleRecordAt(formData, idx)?.id || '').trim();
  return id || fallback;
}
