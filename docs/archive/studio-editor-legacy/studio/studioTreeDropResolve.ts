/**
 * Tree DnD resolve for StudioBlocksTree (S3776) — алфавитный Explorer, без gap-insert.
 */
import type { StudioTree } from './collectStudioNodes';
import {
  folderForMember,
  type EditorFolders,
} from './studioFolders';
import type { StudioTreeSection } from './studioTreeOrder';
import {
  isFolderSection,
  parseFolderDropZoneKey,
  parseFolderKey,
  sectionForGroupKey,
} from './studioTreeKeys';
import type { TreeDropDestination } from './studioWorkspaceFolderDrop';

export type TreeMember = {
  section: StudioTreeSection;
  member: string;
};

export function treeMemberForTreeKey(tree: StudioTree, key: string): TreeMember | undefined {
  const page = tree.pages.find((item) => item.key === key);
  if (page) {
    return { section: 'pages', member: page.pageId };
  }
  const scenario = tree.scenarios.find((item) => item.key === key);
  if (scenario) {
    return { section: 'scenarios', member: scenario.title };
  }
  const module = tree.modules.find((item) => item.key === key);
  if (module) {
    return { section: 'modules', member: module.moduleId };
  }
  const fuzzer = tree.fuzzers.find((item) => item.key === key);
  if (fuzzer) {
    return { section: 'fuzzers', member: fuzzer.fuzzerId || fuzzer.title };
  }
  const resource = tree.resources.find((item) => item.key === key);
  if (resource) {
    return { section: 'resources', member: resource.as || resource.title };
  }
  return undefined;
}

/** Native HTML5 drop target → folder move destination. */
export function resolveNativeDropDestination(
  member: TreeMember,
  targetKey: string,
  folders: EditorFolders,
  tree: StudioTree,
): TreeDropDestination | undefined {
  const folder = parseFolderKey(targetKey);
  if (folder && member.section === folder.section) {
    return { folderId: folder.folderId };
  }
  const folderDropZone = parseFolderDropZoneKey(targetKey);
  if (folderDropZone && member.section === folderDropZone.section) {
    return { folderId: folderDropZone.folderId };
  }
  const rootSection = sectionForGroupKey(targetKey);
  if (rootSection && member.section === rootSection && isFolderSection(member.section)) {
    return {};
  }
  const targetMember = treeMemberForTreeKey(tree, targetKey);
  if (
    !targetMember ||
    targetMember.section !== member.section ||
    targetMember.member === member.member
  ) {
    return undefined;
  }
  const targetFolder = isFolderSection(targetMember.section)
    ? folderForMember(folders, targetMember.section, targetMember.member)
    : undefined;
  if (!targetFolder) {
    return undefined;
  }
  return { folderId: targetFolder.id };
}

export type AllowTreeDropArgs = {
  member: TreeMember | undefined;
  targetKey: string;
  dropPosition: number;
  folders: EditorFolders;
  tree: StudioTree;
};

/** rc-tree allowDrop — gap между листьями запрещён. */
export function allowStudioTreeDrop(args: AllowTreeDropArgs): boolean {
  const { member, targetKey, dropPosition, folders, tree } = args;
  if (!member) {
    return false;
  }
  const folder = parseFolderKey(targetKey);
  if (folder && member.section === folder.section) {
    return true;
  }
  const folderDropZone = parseFolderDropZoneKey(targetKey);
  if (folderDropZone && member.section === folderDropZone.section) {
    return true;
  }
  const rootSection = sectionForGroupKey(targetKey);
  if (rootSection && member.section === rootSection && isFolderSection(member.section)) {
    return true;
  }
  const targetMember = treeMemberForTreeKey(tree, targetKey);
  if (!targetMember || member.section !== targetMember.section) {
    return false;
  }
  return (
    dropPosition === 0 &&
    isFolderSection(targetMember.section) &&
    folderForMember(folders, targetMember.section, targetMember.member) !== undefined
  );
}

export type ResolveAntDropArgs = {
  member: TreeMember | undefined;
  targetKey: string;
  dropToGap: boolean;
  folders: EditorFolders;
  tree: StudioTree;
};

/** rc-tree onDrop → destination or undefined. */
export function resolveAntTreeDropDestination(
  args: ResolveAntDropArgs,
): TreeDropDestination | undefined {
  const { member, targetKey, dropToGap, folders, tree } = args;
  if (!member) {
    return undefined;
  }
  const folder = parseFolderKey(targetKey);
  if (folder && member.section === folder.section) {
    return { folderId: folder.folderId };
  }
  const folderDropZone = parseFolderDropZoneKey(targetKey);
  if (folderDropZone && member.section === folderDropZone.section) {
    return { folderId: folderDropZone.folderId };
  }
  const rootSection = sectionForGroupKey(targetKey);
  if (rootSection && member.section === rootSection && isFolderSection(member.section)) {
    return {};
  }
  const targetMember = treeMemberForTreeKey(tree, targetKey);
  if (!targetMember || member.section !== targetMember.section) {
    return undefined;
  }
  const targetFolder = isFolderSection(targetMember.section)
    ? folderForMember(folders, targetMember.section, targetMember.member)
    : undefined;
  if (!dropToGap && targetFolder) {
    return { folderId: targetFolder.id };
  }
  return undefined;
}

/** nodeDraggable: leaf + folder/section targets for rc-tree. */
export function isStudioTreeNodeDraggable(key: string, tree: StudioTree): boolean {
  const member = treeMemberForTreeKey(tree, key);
  const section = sectionForGroupKey(key);
  return (
    (member !== undefined && isFolderSection(member.section)) ||
    parseFolderKey(key) !== undefined ||
    parseFolderDropZoneKey(key) !== undefined ||
    (section !== undefined && isFolderSection(section))
  );
}
