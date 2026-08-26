/**
 * Leaf className builders for StudioBlocksTree (S3776).
 */
import type { NamingState } from './studioTreeNaming';

function joinClasses(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function pageLeafClassName(
  page: { needsName: boolean; invalidId: boolean; pageId: string },
  naming: NamingState | null,
): string {
  return joinClasses(
    'pk-studio-tree-node',
    'pk-studio-tree-page',
    page.needsName && 'pk-studio-tree-page-pending',
    page.invalidId && 'pk-studio-tree-page-invalid',
    naming?.mode === 'rename-page' &&
      naming.pageId === page.pageId &&
      'pk-studio-tree-naming-active',
  );
}

export function scenarioLeafClassName(
  scenario: { invalidId: boolean; scenarioIndex: number },
  naming: NamingState | null,
): string {
  return joinClasses(
    'pk-studio-tree-node',
    'pk-studio-tree-scenario',
    scenario.invalidId && 'pk-studio-tree-page-invalid',
    naming?.mode === 'rename-scenario' &&
      naming.scenarioIndex === scenario.scenarioIndex &&
      'pk-studio-tree-naming-active',
  );
}

export function moduleLeafClassName(
  module: { invalidId: boolean; moduleIndex: number },
  naming: NamingState | null,
): string {
  return joinClasses(
    'pk-studio-tree-node',
    'pk-studio-tree-page',
    module.invalidId && 'pk-studio-tree-page-invalid',
    naming?.mode === 'rename-module' &&
      naming.moduleIndex === module.moduleIndex &&
      'pk-studio-tree-naming-active',
  );
}

export function entityLeafClassName(
  entity: { invalidId: boolean },
  namingActive: boolean,
): string {
  return joinClasses(
    'pk-studio-tree-node',
    'pk-studio-tree-entity',
    entity.invalidId && 'pk-studio-tree-page-invalid',
    namingActive && 'pk-studio-tree-naming-active',
  );
}
