/**
 * Pure folder nesting helpers for StudioBlocksTree (S3776).
 */
import type { DataNode } from 'antd/es/tree';
import {
  compareEditorFolderMembers,
  type EditorFolder,
  type EditorFolderSection,
} from './studioFolders';

export type ExplorerLeafKind =
  | 'page'
  | 'scenario'
  | 'module'
  | 'auth'
  | 'connector'
  | 'connectorDb'
  | 'connectorSiem'
  | 'connectorProm'
  | 'connectorSsh'
  | 'connectorMq'
  | 'openapi'
  | 'graphql'
  | 'grpc'
  | 'fuzzer'
  | 'resource';

export type FolderEntry = { member: string; node: DataNode };

export function explorerLeafKindForSection(section: EditorFolderSection): ExplorerLeafKind {
  if (section === 'pages') {
    return 'page';
  }
  if (section === 'scenarios') {
    return 'scenario';
  }
  return 'module';
}

export function membersInFoldersSet(folders: readonly EditorFolder[]): Set<string> {
  return new Set(folders.flatMap((folder) => folder.members));
}

export function childNodesForFolder(
  folder: EditorFolder,
  entries: readonly FolderEntry[],
): DataNode[] {
  return [...folder.members]
    .sort(compareEditorFolderMembers)
    .map((member) => entries.find((entry) => entry.member === member)?.node)
    .filter((node): node is DataNode => node !== undefined);
}

export function rootFolderEntries(
  folders: readonly EditorFolder[],
  entries: readonly FolderEntry[],
): FolderEntry[] {
  const inFolders = membersInFoldersSet(folders);
  return entries
    .filter((entry) => !inFolders.has(entry.member))
    .sort((left, right) => compareEditorFolderMembers(left.member, right.member));
}

export function withRootChildClass(node: DataNode): DataNode {
  return {
    ...node,
    className: `${node.className ?? ''} pk-studio-tree-root-child-node`.trim(),
  };
}
