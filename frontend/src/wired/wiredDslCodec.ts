/**
 * Bidirectional bridge: formData (legacy manifest) ↔ Editor Monaco DSL text.
 *
 * Used by EditorWorkbench to read/write constructor text at JSON pointer paths,
 * eliminating the separate local `code` state. Both Studio and Editor surfaces
 * now operate on the same formData through this codec.
 *
 * ER-1: tab listing is now DERIVED from the single Studio tree model
 * (`collectStudioNodes`), not re-derived by hand from raw formData. This keeps
 * one source of truth for entity identity, labels and JSON-pointer paths.
 *
 * Path patterns (matching collectStudioNodes + StudioWorkspace conventions):
 *   scenario → /test_suites/scenarios/{N}/steps/0/constructor
 *   page     → /test_suites/pages/{pageKey}/constructor
 *   module   → /test_suites/test_data_constructor/{N}/data_storage_fields/editor
 *              (or /auth_fields/constructor for auth modules)
 *   fuzzer   → (form surface, NOT Monaco — no DSL tab)
 *   resource → (form surface, NOT Monaco — no DSL tab)
 */

import {
  collectStudioNodes,
  findNodeByTabId,
  getAtPointer,
  setAtPointer,
  type StudioEditableNode,
} from '../studio/collectStudioNodes';
import { padConstructorCanvas } from '../studio/defaultConstructor';
import { AUTH_MODULE_TYPE } from '../studio/studioModules';
import {
  moduleIndexFromTabId,
  pageIdFromTabId,
  scenarioIndexFromTabId,
  type StudioTabId,
} from '../studio/studioTabs';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type DslTabKind = 'scenario' | 'page' | 'module' | 'fuzzer' | 'resource';

export interface DslTabRef {
  kind: DslTabKind;
  /** stable JSON pointer path to the constructor/body field in formData */
  path: string;
  /** human-readable label for the tab */
  label: string;
  /** unique identifier: scenario_name, page key, module id */
  entityId: string;
  /** Studio tab id — stable mapping back into the shared tree model. */
  studioTabId?: StudioTabId;
}

/** Module types that open as a Monaco DSL editor (others are form surfaces). */
const DATA_MODULE_TYPE = 'Модуль работы с данными';

function isMonacoModuleType(moduleType: string): boolean {
  return moduleType === DATA_MODULE_TYPE || moduleType === AUTH_MODULE_TYPE;
}

/* ------------------------------------------------------------------ */
/*  Read / Write constructors                                          */
/* ------------------------------------------------------------------ */

/**
 * Read constructor text from formData at path.
 * Always returns 32-line-padded text (empty → default padded canvas).
 */
export function readConstructorText(formData: unknown, path: string): string {
  const value = getAtPointer(formData, path);
  if (typeof value === 'string' && value.length > 0) {
    return padConstructorCanvas(value);
  }
  return padConstructorCanvas('');
}

/**
 * Write constructor text back into formData at path.
 * Returns new formData object (immutable — setAtPointer clones internally).
 */
export function writeConstructorText(
  formData: unknown,
  path: string,
  text: string,
): unknown {
  return setAtPointer(formData, path, text);
}

/* ------------------------------------------------------------------ */
/*  Studio node → DSL tab                                              */
/* ------------------------------------------------------------------ */

/** Convert a Studio tree node into a Monaco DSL tab (null for form surfaces). */
export function dslTabForStudioNode(node: StudioEditableNode): DslTabRef | null {
  switch (node.kind) {
    case 'page':
      return {
        kind: 'page',
        path: node.path,
        label: node.title,
        entityId: node.pageId,
        studioTabId: node.tabId,
      };
    case 'scenario':
      return {
        kind: 'scenario',
        path: node.path,
        label: node.title,
        entityId: node.title,
        studioTabId: node.tabId,
      };
    case 'module':
      if (!isMonacoModuleType(node.moduleType)) {
        return null;
      }
      return {
        kind: 'module',
        path: node.path,
        label: node.title,
        entityId: node.moduleId,
        studioTabId: node.tabId,
      };
    default:
      // fuzzer / resource are form surfaces — no DSL tab.
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Tab listing (derived from the single Studio tree model)            */
/* ------------------------------------------------------------------ */

/** Collect all Monaco-editable DSL tabs from the shared Studio tree. */
export function listEditableDslTabs(formData: unknown): DslTabRef[] {
  const tree = collectStudioNodes(formData);
  const tabs: DslTabRef[] = [];

  for (const scenario of tree.scenarios) {
    const tab = dslTabForStudioNode(scenario);
    if (tab) tabs.push(tab);
  }
  for (const page of tree.pages) {
    const tab = dslTabForStudioNode(page);
    if (tab) tabs.push(tab);
  }
  for (const module of tree.modules) {
    const tab = dslTabForStudioNode(module);
    if (tab) tabs.push(tab);
  }

  return tabs;
}

/**
 * @deprecated Use listEditableDslTabs — same source, kept for call-site compatibility.
 * Now derived from the Studio tree model (pages + scenarios + data/auth modules),
 * which is the single source of truth across both surfaces.
 */
export function listDslTabs(formData: unknown): DslTabRef[] {
  return listEditableDslTabs(formData);
}

/** Return the first available tab (prefers scenario > page > module). */
export function firstDslTab(formData: unknown): DslTabRef | null {
  const tabs = listEditableDslTabs(formData);
  if (tabs.length === 0) return null;
  // prefer scenario
  const scenario = tabs.find((t) => t.kind === 'scenario');
  if (scenario) return scenario;
  return tabs[0] ?? null;
}

/**
 * Find a tab by entityId + kind.
 * Useful when restoring the active tab after reload.
 */
export function findDslTab(
  formData: unknown,
  kind: DslTabKind,
  entityId: string,
): DslTabRef | null {
  return (
    listEditableDslTabs(formData).find(
      (t) => t.kind === kind && t.entityId === entityId,
    ) ?? null
  );
}

/** Resolve a Studio tab id (tree click) into a Monaco DSL tab, if editable. */
export function dslTabForStudioTabId(
  formData: unknown,
  tabId: StudioTabId,
): DslTabRef | null {
  const node = findNodeByTabId(collectStudioNodes(formData), tabId);
  if (!node) return null;
  return dslTabForStudioNode(node);
}

/* ------------------------------------------------------------------ */
/*  Neighbour resolution (ER-2 — no phantom tabs / no lost selection)  */
/* ------------------------------------------------------------------ */

/** Neighbour within the same kind at the given index (clamped), else any tab. */
function sameKindNeighbor(
  tabs: DslTabRef[],
  kind: DslTabKind,
  removedIndex: number,
): DslTabRef | null {
  const same = tabs.filter((t) => t.kind === kind);
  if (same.length > 0) {
    // After deleting index N, the entity previously at N+1 shifted into N:
    // prefer that spot, falling back to the previous one for the last position.
    return same[Math.min(removedIndex, same.length - 1)] ?? same[same.length - 1] ?? null;
  }
  return tabs[0] ?? null;
}

/**
 * Resolve the best replacement Monaco DSL tab after `removedTabId` was deleted
 * from `formData` (post-delete tree). Picks the neighbour at the same position
 * (same kind, same index) → previous → any available, so the editor never
 * silently jumps to an unrelated first tab or keeps a phantom tab alive.
 *
 * Returns `null` when there is nothing to show (empty tree, or a form-surface
 * entity — fuzzer/resource — was removed and has no DSL neighbour).
 */
export function resolveNeighborDslTab(
  formData: unknown,
  removedTabId: StudioTabId,
): DslTabRef | null {
  const tabs = listEditableDslTabs(formData);
  if (tabs.length === 0) return null;

  const scenarioIdx = scenarioIndexFromTabId(removedTabId);
  if (scenarioIdx !== undefined) {
    return sameKindNeighbor(tabs, 'scenario', scenarioIdx);
  }

  const moduleIdx = moduleIndexFromTabId(removedTabId);
  if (moduleIdx !== undefined) {
    return sameKindNeighbor(tabs, 'module', moduleIdx);
  }

  const pageId = pageIdFromTabId(removedTabId);
  if (pageId !== undefined) {
    // Pages carry no numeric index in their tab id — fall back to the first
    // remaining page (nearest stable neighbour), else any available tab.
    return tabs.find((t) => t.kind === 'page') ?? tabs[0] ?? null;
  }

  // fuzzer / resource are form surfaces — no DSL neighbour to jump to.
  return null;
}
