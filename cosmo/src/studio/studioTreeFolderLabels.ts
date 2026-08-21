/**
 * Labels for folder delete dialog (S3776).
 */
import type { StudioTree } from './collectStudioNodes';
import type { EditorFolder, EditorFolderSection } from './studioFolders';

export function folderDeleteMemberLabels(
  section: EditorFolderSection,
  folder: EditorFolder,
  tree: StudioTree,
): string[] {
  return folder.members.map((member) => {
    if (section === 'modules') {
      return tree.modules.find((item) => item.moduleId === member)?.title ?? member;
    }
    return member;
  });
}
