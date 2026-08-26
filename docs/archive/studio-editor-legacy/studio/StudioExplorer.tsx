/**
 * StudioExplorer — the single semantic Explorer shared by Studio and Editor (ER-1).
 *
 * Thin wrapper: consumes `useStudioTreeActions` (pure formData mutations) and
 * renders the canonical `StudioBlocksTree`. Both surfaces mount this same tree,
 * so entity roots, folders, actions, selection and icons never diverge.
 */

import { useMemo } from 'react';
import { StudioBlocksTree } from './StudioBlocksTree';
import { useStudioTreeActions } from './useStudioTreeActions';
import { studioSuiteMode } from './studioMode';
import type { StudioTabId } from './studioTabs';
import type { ResourceContentsMap } from './resourceContents';

export interface StudioExplorerProps {
  formData: unknown;
  onFormDataChange: (next: unknown) => void;
  resourceContents: ResourceContentsMap;
  onResourceContentsChange: (next: ResourceContentsMap) => void;
  /** Selected Studio tab id — drives Explorer highlight. */
  selectedTabId?: StudioTabId;
  /** Surface opens the given Studio tab (leaf click / created entity). */
  onSelectTab: (tabId: StudioTabId) => void;
  /** Optional — surface toast on file-attach reject. */
  notifyError?: (message: string) => void;
  /** Optional — ER-2 dirty-guard: flush pending edits before any tree mutation. */
  beforeMutate?: () => unknown;
}

export function StudioExplorer({
  formData,
  onFormDataChange,
  resourceContents,
  onResourceContentsChange,
  selectedTabId,
  onSelectTab,
  notifyError,
  beforeMutate,
}: StudioExplorerProps): React.JSX.Element {
  const suiteMode = useMemo(() => studioSuiteMode(formData), [formData]);

  const { tree, folders, projectId, revealRequest, handlers } = useStudioTreeActions({
    formData,
    onFormDataChange,
    resourceContents,
    onResourceContentsChange,
    selectedTabId,
    onOpened: (tab) => onSelectTab(tab.id),
    notifyError,
    beforeMutate,
  });

  return (
    <StudioBlocksTree
      mode={suiteMode}
      tree={tree}
      folders={folders}
      projectId={projectId}
      selectedTabId={selectedTabId}
      onSelectTab={onSelectTab}
      revealRequest={revealRequest}
      onCreateFolder={handlers.onCreateFolder}
      onRenameFolder={handlers.onRenameFolder}
      onDeleteFolder={handlers.onDeleteFolder}
      onMoveFolderMember={handlers.onMoveFolderMember}
      onDropTreeMember={handlers.onDropTreeMember}
      onCreatePage={handlers.onCreatePage}
      onRenamePage={handlers.onRenamePage}
      onDeletePage={handlers.onDeletePage}
      onCreateScenario={handlers.onCreateScenario}
      onRenameScenario={handlers.onRenameScenario}
      onDeleteScenario={handlers.onDeleteScenario}
      onCreateModule={handlers.onCreateModule}
      onRenameModule={handlers.onRenameModule}
      onDeleteModule={handlers.onDeleteModule}
      onCreateFuzzer={handlers.onCreateFuzzer}
      onRenameFuzzer={handlers.onRenameFuzzer}
      onDeleteFuzzer={handlers.onDeleteFuzzer}
      onCreateResource={handlers.onCreateResource}
      onAttachResourceFiles={handlers.onAttachResourceFiles}
      onRenameResource={handlers.onRenameResource}
      onDeleteResource={handlers.onDeleteResource}
    />
  );
}
