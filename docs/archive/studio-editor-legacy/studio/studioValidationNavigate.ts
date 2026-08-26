/**
 * Navigate Studio tree from ConstructorBatchFail path (S3776 extract).
 */
import type { ConstructorBatchFail } from '../api/editorValidate';
import type { StudioEditableNode, StudioTree } from './collectStudioNodes';

function nodeFromPagesPath(
  tree: StudioTree,
  targetPath: string,
  objectId: string | undefined,
): StudioEditableNode | undefined {
  const parts = targetPath.split('/pages/')[1]?.split('/');
  const pageId = parts?.[0];
  return tree.pages.find(
    (p) => p.pageId === pageId || p.path === targetPath || p.title === objectId,
  );
}

function nodeFromScenariosPath(
  tree: StudioTree,
  targetPath: string,
  objectId: string | undefined,
): StudioEditableNode | undefined {
  const parts = targetPath.split('/scenarios/')[1]?.split('/');
  const idx = Number(parts?.[0]);
  if (Number.isInteger(idx)) {
    const byIndex = tree.scenarios.find((s) => s.scenarioIndex === idx);
    if (byIndex) {
      return byIndex;
    }
  }
  return tree.scenarios.find((s) => s.title === objectId || s.path === targetPath);
}

function nodeFromModulesPath(
  tree: StudioTree,
  targetPath: string,
  objectId: string | undefined,
): StudioEditableNode | undefined {
  const parts = targetPath.split('/test_data_constructor/')[1]?.split('/');
  const idx = Number(parts?.[0]);
  if (Number.isInteger(idx)) {
    const byIndex = tree.modules.find((m) => m.moduleIndex === idx);
    if (byIndex) {
      return byIndex;
    }
  }
  return tree.modules.find((m) => m.moduleId === objectId || m.title === objectId);
}

function nodeByObjectTitle(
  tree: StudioTree,
  objectId: string | undefined,
): StudioEditableNode | undefined {
  if (!objectId) {
    return undefined;
  }
  return (
    tree.pages.find((p) => p.title === objectId) ||
    tree.scenarios.find((s) => s.title === objectId) ||
    tree.modules.find((m) => m.title === objectId)
  );
}

/** Resolve editable Studio node for a backend validation fail. */
export function resolveNodeForValidationFail(
  tree: StudioTree,
  fail: ConstructorBatchFail,
): StudioEditableNode | undefined {
  const targetPath = fail.path || fail.id || '';
  if (targetPath.includes('/pages/')) {
    const node = nodeFromPagesPath(tree, targetPath, fail.objectId);
    if (node) {
      return node;
    }
  } else if (targetPath.includes('/scenarios/')) {
    const node = nodeFromScenariosPath(tree, targetPath, fail.objectId);
    if (node) {
      return node;
    }
  } else if (targetPath.includes('/test_data_constructor/')) {
    const node = nodeFromModulesPath(tree, targetPath, fail.objectId);
    if (node) {
      return node;
    }
  }
  return nodeByObjectTitle(tree, fail.objectId);
}

export function editorPositionFromFail(fail: ConstructorBatchFail): {
  lineNumber: number;
  column: number;
} {
  return {
    lineNumber: fail.line && fail.line >= 1 ? fail.line : 1,
    column: fail.column && fail.column >= 1 ? fail.column : 1,
  };
}
