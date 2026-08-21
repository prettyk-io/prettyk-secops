/**
 * Tree drop → folder move guards (S3776).
 */
import {
  folderForMember,
  moveEditorFolderMember,
  readEditorFolders,
  type EditorFolderSection,
} from './studioFolders';
import type { StudioTreeSection } from './studioTreeOrder';

export type TreeDropDestination = {
  folderId?: string;
  anchorMember?: string;
  placement?: 'before' | 'after';
};

export function isFolderDropSection(
  section: StudioTreeSection,
): section is Extract<EditorFolderSection, 'pages' | 'scenarios'> {
  return section === 'pages' || section === 'scenarios';
}

/** Apply drop if member already in a folder or destination has a folder. */
export function applyTreeMemberDrop(
  data: unknown,
  section: StudioTreeSection,
  member: string,
  destination: TreeDropDestination,
): unknown | undefined {
  if (!isFolderDropSection(section)) {
    return undefined;
  }
  const currentFolder = folderForMember(readEditorFolders(data), section, member);
  if (!currentFolder && !destination.folderId) {
    return undefined;
  }
  return moveEditorFolderMember(data, section, member, destination.folderId);
}
