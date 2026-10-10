/**
 * STUDIO-FUZZER-FORM-SURFACE: form-surface канонической Студии.
 *
 * Легаси form-surface (FuzzerForm/ResourceFormPanel) был подключён только в
 * `StudioWorkspace` (studio-old) через `studioWorkspaceActiveBody`; канонический
 * `Studio` (StudioV2) маршрутизировал только DSL-сущности, из-за чего выбор
 * фаззера/ресурса не открывал форму. Резолвер возвращает данные формы из того
 * же носителя, что и легаси-студия (`test_suites.fuzzers` / `test_suites.imports`).
 */
import { normalizeFuzzer, type FuzzerFields } from './studioFuzzers';
import { normalizeImport, type ResourceFields } from './studioResources';
import {
  fuzzerIndexFromTabId,
  resourceIndexFromTabId,
  type StudioTabId,
} from './studioTabs';

export type StudioFormSurface =
  | { kind: 'fuzzer'; index: number; value: FuzzerFields }
  | { kind: 'resource'; index: number; value: ResourceFields };

/** Выбранный tab целится в form-surface (фаззер/ресурс), даже если сущность удалена. */
export function isFormSurfaceTabId(tabId: StudioTabId | undefined): boolean {
  return Boolean(
    tabId && (tabId.startsWith('fuzzer:') || tabId.startsWith('resource:')),
  );
}

/** StudioTabId → данные формы; null — не form-surface или сущности больше нет. */
export function resolveStudioFormSurface(
  formData: unknown,
  tabId: StudioTabId | undefined,
): StudioFormSurface | null {
  if (!tabId) {
    return null;
  }
  const suites = (formData as { test_suites?: Record<string, unknown> } | undefined)
    ?.test_suites;
  const fuzzerIndex = fuzzerIndexFromTabId(tabId);
  if (fuzzerIndex !== undefined) {
    const fuzzers = suites?.fuzzers;
    if (!Array.isArray(fuzzers) || !fuzzers[fuzzerIndex]) {
      return null;
    }
    return {
      kind: 'fuzzer',
      index: fuzzerIndex,
      value: normalizeFuzzer(fuzzers[fuzzerIndex], fuzzerIndex),
    };
  }
  const resourceIndex = resourceIndexFromTabId(tabId);
  if (resourceIndex !== undefined) {
    const imports = suites?.imports;
    if (!Array.isArray(imports) || !imports[resourceIndex]) {
      return null;
    }
    return {
      kind: 'resource',
      index: resourceIndex,
      value: normalizeImport(imports[resourceIndex]),
    };
  }
  return null;
}
