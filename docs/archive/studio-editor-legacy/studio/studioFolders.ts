/**
 * Authoring-only папки Studio. Сущности suites остаются плоскими: папки хранят
 * только ссылки на их устойчивые пользовательские имена.
 */
import { moveFolderMemberInData } from './studioFolderMoveMember';

export type EditorFolderSection = 'pages' | 'scenarios' | 'modules' | 'fuzzers' | 'resources';

export type EditorFolder = {
  id: string;
  title: string;
  members: string[];
};

export type EditorFolders = Record<EditorFolderSection, EditorFolder[]>;

export type FolderMemberPlacement = {
  anchorMember?: string;
  placement?: 'before' | 'after';
};

const SECTIONS: readonly EditorFolderSection[] = ['pages', 'scenarios', 'modules', 'fuzzers', 'resources'];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readFolder(value: unknown): EditorFolder | undefined {
  const raw = asRecord(value);
  if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string') {
    return undefined;
  }
  const id = raw.id.trim();
  const title = raw.title.trim();
  if (!id || !title) {
    return undefined;
  }
  const members = Array.isArray(raw.members)
    ? [
        ...new Set(
          raw.members.filter((item): item is string => typeof item === 'string' && item.length > 0),
        ),
      ]
    : [];
  return { id, title, members };
}

export function emptyEditorFolders(): EditorFolders {
  return { pages: [], scenarios: [], modules: [], fuzzers: [], resources: [] };
}

export function readEditorFolders(formData: unknown): EditorFolders {
  const suites = asRecord(asRecord(formData)?.test_suites);
  const raw = asRecord(suites?.editor_folders);
  const out = emptyEditorFolders();
  for (const section of SECTIONS) {
    const seenMembers = new Set<string>();
    out[section] = (Array.isArray(raw?.[section])
      ? raw[section].map(readFolder).filter((folder): folder is EditorFolder => folder !== undefined)
      : []
    ).map((folder) => ({
      ...folder,
      members: folder.members.filter((member) => {
        if (seenMembers.has(member)) {
          return false;
        }
        seenMembers.add(member);
        return true;
      }),
    }));
  }
  return out;
}

export function folderForMember(
  folders: EditorFolders,
  section: EditorFolderSection,
  member: string,
): EditorFolder | undefined {
  return folders[section].find((folder) => folder.members.includes(member));
}

function updateFolders(
  formData: unknown,
  update: (folders: EditorFolders) => EditorFolders,
): unknown {
  const root = { ...(asRecord(formData) ?? {}) };
  const suites = { ...(asRecord(root.test_suites) ?? {}) };
  return {
    ...root,
    test_suites: {
      ...suites,
      editor_folders: update(readEditorFolders({ ...root, test_suites: suites })),
    },
  };
}

function titleIsTaken(folders: EditorFolder[], title: string, exceptId?: string): boolean {
  const normalized = title.toLocaleLowerCase();
  return folders.some(
    (folder) =>
      folder.id !== exceptId &&
      folder.title.toLocaleLowerCase() === normalized,
  );
}

function memberSortGroup(value: string): number {
  const first = value.trim().at(0) ?? '';
  if (/^[0-9]$/u.test(first)) {
    return 1;
  }
  if (/^[A-Za-z]$/u.test(first)) {
    return 2;
  }
  if (/^[А-Яа-яЁё]$/u.test(first)) {
    return 3;
  }
  return 0;
}

/** Стандартный порядок Explorer: символы → цифры → Latin → кириллица. */
export function compareEditorFolderMembers(left: string, right: string): number {
  const groupDiff = memberSortGroup(left) - memberSortGroup(right);
  if (groupDiff !== 0) {
    return groupDiff;
  }
  const locale = memberSortGroup(left) === 3 ? 'ru' : 'en';
  return left.localeCompare(right, locale, { numeric: true, sensitivity: 'base' });
}

function nextFolderId(folders: EditorFolder[]): string {
  let number = 1;
  while (folders.some((folder) => folder.id === `folder_${String(number)}`)) {
    number += 1;
  }
  return `folder_${String(number)}`;
}

function patchScenarioDescriptions(
  formData: unknown,
  members: readonly string[],
  description: string | undefined,
): unknown {
  const root = { ...(asRecord(formData) ?? {}) };
  const suites = { ...(asRecord(root.test_suites) ?? {}) };
  const wanted = new Set(members);
  const scenarios = Array.isArray(suites.scenarios) ? suites.scenarios : [];
  const nextScenarios = scenarios.map((value) => {
    const scenario = asRecord(value);
    const name = typeof scenario?.scenario_name === 'string' ? scenario.scenario_name : '';
    if (!scenario || !wanted.has(name)) {
      return value;
    }
    const next = { ...scenario };
    if (description) {
      next.description = description;
    } else {
      delete next.description;
    }
    return next;
  });
  return {
    ...root,
    test_suites: { ...suites, scenarios: nextScenarios },
  };
}

export function createEditorFolder(
  formData: unknown,
  section: EditorFolderSection,
  title: string,
): { data: unknown; folder: EditorFolder } | undefined {
  const normalized = title.trim();
  if (!normalized) {
    return undefined;
  }
  const folders = readEditorFolders(formData);
  if (titleIsTaken(folders[section], normalized)) {
    return undefined;
  }
  const folder: EditorFolder = {
    id: nextFolderId(folders[section]),
    title: normalized,
    members: [],
  };
  return {
    folder,
    data: updateFolders(formData, (current) => ({
      ...current,
      [section]: [...current[section], folder],
    })),
  };
}

export function renameEditorFolder(
  formData: unknown,
  section: EditorFolderSection,
  folderId: string,
  title: string,
): unknown | undefined {
  const normalized = title.trim();
  const folders = readEditorFolders(formData);
  const folder = folders[section].find((item) => item.id === folderId);
  if (!folder || !normalized || titleIsTaken(folders[section], normalized, folderId)) {
    return undefined;
  }
  const next = updateFolders(formData, (current) => ({
    ...current,
    [section]: current[section].map((item) =>
      item.id === folderId ? { ...item, title: normalized } : item,
    ),
  }));
  return section === 'scenarios'
    ? patchScenarioDescriptions(next, folder.members, normalized)
    : next;
}

export function removeEditorFolder(
  formData: unknown,
  section: EditorFolderSection,
  folderId: string,
): unknown | undefined {
  const folders = readEditorFolders(formData);
  const folder = folders[section].find((item) => item.id === folderId);
  if (!folder) {
    return undefined;
  }
  const next = updateFolders(formData, (current) => ({
    ...current,
    [section]: current[section].filter((item) => item.id !== folderId),
  }));
  return section === 'scenarios' ? patchScenarioDescriptions(next, folder.members, undefined) : next;
}

export function moveEditorFolderMember(
  formData: unknown,
  section: EditorFolderSection,
  member: string,
  folderId?: string,
  placement: FolderMemberPlacement = {},
): unknown | undefined {
  // Explorer всегда следует своему алфавитному порядку: DnD меняет папку, но не
  // позицию листа среди соседей.
  return moveFolderMemberInData(formData, section, member, folderId, placement, {
    readEditorFolders,
    updateFolders,
    patchScenarioDescriptions,
    compareMembers: compareEditorFolderMembers,
  });
}

/** Rename/delete сущности должны не оставлять в папках старые ссылки. */
export function replaceEditorFolderMember(
  formData: unknown,
  section: EditorFolderSection,
  from: string,
  to?: string,
): unknown {
  return updateFolders(formData, (current) => ({
    ...current,
    [section]: current[section].map((folder) => ({
      ...folder,
      members: [
        ...new Set(
          folder.members.flatMap((member) => {
            if (member !== from) {
              return [member];
            }
            return to ? [to] : [];
          }),
        ),
      ],
    })),
  }));
}
