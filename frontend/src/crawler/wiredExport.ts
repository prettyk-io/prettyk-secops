/**
 * CRAWL-10: Wired page model export.
 *
 * Оператор выбирает состояния из графа → экспорт как валидный wired.json
 * Page Family с устойчивыми локаторами и data-модулем.
 *
 * Приоритет локаторов: T0 data-testid → T1 role + accessible name →
 * T2 label/placeholder → T3 name attr → T4 nth-child (fragile).
 *
 * Инкрементальный merge: ручные правки сохраняются, новые элементы добавляются.
 */
import type { CrawlableElement } from './policyClassifier';

export interface ExportStateSelection {
  stateId: string;
  route: string;
  title: string;
  /** Элементы страницы с локаторами (после CRAWL-1). */
  elements: CrawlableElementWithLocator[];
}

export interface CrawlableElementWithLocator extends CrawlableElement {
  /** Локаторные кандидаты (T0…T4). */
  locators: LocatorCandidate[];
  /** Класс значения: secret/email/phone/unknown. */
  valueClass?: 'secret' | 'email' | 'phone' | 'unknown';
  /** Привязка к полю data-модуля. */
  fieldBinding?: { module: string; field: string };
}

export interface LocatorCandidate {
  tier: 'T0' | 'T1' | 'T2' | 'T3' | 'T4';
  strategy: 'test_id' | 'role' | 'label' | 'placeholder' | 'name' | 'nth_child';
  value: string;
  confidence: number;
}

export interface ExportedPageFamily {
  route: string;
  title: string;
  steps: ExportedStep[];
}

export interface ExportedStep {
  action: 'Open' | 'Click' | 'Type' | 'Select';
  locator: { strategy: string; value: string; tier: string };
  payload?: string;
  /** Элементы без уверенного локатора. */
  trust?: 'manual-edited' | 'review-needed';
}

export interface WiredExportResult {
  page_families: ExportedPageFamily[];
  data_module: Record<string, Record<string, unknown>>;
  export_timestamp: number;
}

// ── Приоритет локаторов ──

const TIER_PRIORITY: LocatorCandidate['tier'][] = ['T0', 'T1', 'T2', 'T3'];

/** Выбрать лучший локатор из кандидатов. T4 — только если нет ничего выше и с пометкой fragile. */
function bestLocator(locators: LocatorCandidate[]): LocatorCandidate | null {
  if (locators.length === 0) return null;
  for (const tier of TIER_PRIORITY) {
    const hit = locators.find((l) => l.tier === tier && l.confidence >= 0.5);
    if (hit) return hit;
  }
  const t4 = locators.find((l) => l.tier === 'T4');
  return t4 ?? null;
}

// ── Экспорт одного элемента в шаг ──

function elementToStep(el: CrawlableElementWithLocator, manualTrust: boolean): ExportedStep {
  const loc = bestLocator(el.locators);
  const locator = loc
    ? { strategy: loc.strategy, value: loc.value, tier: loc.tier }
    : { strategy: 'nth_child', value: el.tag, tier: 'T4' };

  const trust: ExportedStep['trust'] = manualTrust
    ? 'manual-edited'
    : loc?.tier === 'T4'
      ? 'review-needed'
      : undefined;

  const step: ExportedStep = { action: 'Click', locator, trust };

  // Type шаги для инпутов
  if (el.role === 'textbox' || el.tag === 'input' || el.tag === 'textarea') {
    step.action = 'Type';
    step.payload = el.valueClass === 'secret' ? '$secret_ref' : el.valueClass === 'email' ? '${email}' : '$value';
  }

  // Select для <select>
  if (el.tag === 'select') step.action = 'Select';

  return step;
}

// ── Экспорт состояния → PageFamily ──

function stateToFamily(state: ExportStateSelection): ExportedPageFamily {
  const steps: ExportedStep[] = [];

  // Navigate-шаг для маршрута (если не корень)
  if (state.route && state.route !== '/#/') {
    steps.push({
      action: 'Open',
      locator: { strategy: 'url', value: state.route, tier: 'T0' },
    });
  }

  for (const el of state.elements) {
    // Не экспортировать опасные элементы
    if (el.tag === 'a' && (el.href?.startsWith('javascript:') || el.href?.startsWith('mailto:'))) continue;
    steps.push(elementToStep(el, false));
  }

  return { route: state.route, title: state.title, steps };
}

// ── Data module ──

function buildDataModule(states: ExportStateSelection[]): WiredExportResult['data_module'] {
  const dm: Record<string, Record<string, unknown>> = {};
  for (const state of states) {
    for (const el of state.elements) {
      if (!el.valueClass || !el.fieldBinding) continue;
      const mod = el.fieldBinding.module;
      if (!dm[mod]) dm[mod] = {};
      dm[mod]![el.fieldBinding.field] = el.valueClass === 'secret' ? '$secret_ref' : '$value';
    }
  }
  return dm;
}

// ── Главный экспорт ──

export function exportToWired(states: ExportStateSelection[]): WiredExportResult {
  return {
    page_families: states.map(stateToFamily),
    data_module: buildDataModule(states),
    export_timestamp: Date.now(),
  };
}

// ── Инкрементальный merge ──

export function mergeExport(
  previous: WiredExportResult,
  fresh: WiredExportResult,
): WiredExportResult {
  const mergedFamilies = [...previous.page_families];

  for (const freshFamily of fresh.page_families) {
    const existing = mergedFamilies.find((f) => f.route === freshFamily.route);
    if (!existing) {
      mergedFamilies.push(freshFamily);
      continue;
    }

    // Сохраняем ручные правки (trust=manual-edited)
    const manualSteps = existing.steps.filter((s) => s.trust === 'manual-edited');
    const manualLocs = new Set(manualSteps.map((s) => `${s.locator.strategy}:${s.locator.value}`));

    // Новые шаги (без дублей и ручных)
    const newSteps = freshFamily.steps.filter(
      (s) => !manualLocs.has(`${s.locator.strategy}:${s.locator.value}`),
    );

    existing.steps = [...manualSteps, ...newSteps];
  }

  return {
    page_families: mergedFamilies,
    data_module: { ...previous.data_module, ...fresh.data_module },
    export_timestamp: Date.now(),
  };
}