/**
 * moveEditorFolderMember (S3776).
 */

export type FolderSection = 'pages' | 'scenarios' | 'modules' | 'fuzzers' | 'resources';

export type FolderRec = {
  id: string;
  title: string;
  members: string[];
};

export type MemberPlacement = {
  anchorMember?: string;
  placement?: 'before' | 'after';
};

export function moveFolderMemberInData(
  formData: unknown,
  section: FolderSection,
  member: string,
  folderId: string | undefined,
  placement: MemberPlacement,
  deps: {
    readEditorFolders: (formData: unknown) => Record<FolderSection, FolderRec[]>;
    updateFolders: (
      formData: unknown,
      updater: (current: Record<FolderSection, FolderRec[]>) => Record<FolderSection, FolderRec[]>,
    ) => unknown;
    patchScenarioDescriptions: (
      formData: unknown,
      members: readonly string[],
      description: string | undefined,
    ) => unknown;
    compareMembers: (left: string, right: string) => number;
  },
): unknown | undefined {
  const folders = deps.readEditorFolders(formData);
  const destination = folderId
    ? folders[section].find((folder) => folder.id === folderId)
    : undefined;
  const shouldSortDestination = destination !== undefined;
  if (folderId && !destination) {
    return undefined;
  }
  const insertMember = (members: readonly string[]): string[] => {
    const withoutMember = members.filter((item) => item !== member);
    const anchorIndex = placement.anchorMember
      ? withoutMember.indexOf(placement.anchorMember)
      : -1;
    if (anchorIndex < 0) {
      return [...withoutMember, member];
    }
    const at = anchorIndex + (placement.placement === 'after' ? 1 : 0);
    return [...withoutMember.slice(0, at), member, ...withoutMember.slice(at)];
  };
  const next = deps.updateFolders(formData, (current) => ({
    ...current,
    [section]: current[section].map((folder) => {
      const members = folder.members.filter((item) => item !== member);
      const nextMembers = insertMember(members);
      return folder.id === folderId
        ? {
            ...folder,
            members: shouldSortDestination
              ? [...nextMembers].sort(deps.compareMembers)
              : nextMembers,
          }
        : { ...folder, members };
    }),
  }));
  return section === 'scenarios'
    ? deps.patchScenarioDescriptions(next, [member], destination?.title)
    : next;
}
