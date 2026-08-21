/**
 * Context-menu specs: move leaf into / out of folder (S3776).
 */
import {
  folderForMember,
  type EditorFolderSection,
  type EditorFolders,
} from './studioFolders';

export type FolderMoveMenuSpec = {
  key: string;
  label: string;
  /** Omit → remove from current folder. */
  folderId?: string;
};

export function folderMoveMenuSpecs(
  section: EditorFolderSection,
  member: string,
  folders: EditorFolders,
): FolderMoveMenuSpec[] {
  const current = folderForMember(folders, section, member);
  const destinations: FolderMoveMenuSpec[] = folders[section]
    .filter((folder) => folder.id !== current?.id)
    .map((folder) => ({
      key: `move:${section}:${folder.id}`,
      label: `Переместить в группу «${folder.title}»`,
      folderId: folder.id,
    }));
  if (current) {
    destinations.push({
      key: `remove:${section}:${current.id}`,
      label: 'Убрать из группы',
    });
  }
  return destinations;
}
