/**
 * Runtime-порядок листьев Explorer. В отличие от папок, порядок массивов suites
 * участвует в исполнении и поэтому хранится прямо в wired.
 */
import type { EditorFolderSection } from './studioFolders';
import { normalizeImport } from './studioResources';

export type StudioTreeSection = EditorFolderSection | 'fuzzers' | 'resources';
export type TreeDropPlacement = 'before' | 'after';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function reposition<T>(
  entries: readonly T[],
  sourceIndex: number,
  anchorIndex: number | undefined,
  placement: TreeDropPlacement,
): T[] {
  if (sourceIndex < 0 || sourceIndex >= entries.length || sourceIndex === anchorIndex) {
    return [...entries];
  }
  const next = [...entries];
  const [source] = next.splice(sourceIndex, 1);
  if (source === undefined) {
    return next;
  }
  if (anchorIndex === undefined) {
    next.push(source);
    return next;
  }
  const adjustedAnchor = sourceIndex < anchorIndex ? anchorIndex - 1 : anchorIndex;
  next.splice(adjustedAnchor + (placement === 'after' ? 1 : 0), 0, source);
  return next;
}

function commit(
  formData: unknown,
  field: 'pages' | 'scenarios' | 'test_data_constructor' | 'fuzzers' | 'imports',
  value: unknown,
): unknown {
  const root = { ...(asRecord(formData) ?? {}) };
  const suites = { ...(asRecord(root.test_suites) ?? {}) };
  return { ...root, test_suites: { ...suites, [field]: value } };
}

function reorderArray(
  formData: unknown,
  field: 'scenarios' | 'test_data_constructor' | 'fuzzers' | 'imports',
  sourceMember: string,
  anchorMember: string | undefined,
  placement: TreeDropPlacement,
  memberOf: (value: unknown) => string,
): unknown | undefined {
  const suites = asRecord(asRecord(formData)?.test_suites);
  const values = Array.isArray(suites?.[field]) ? [...(suites![field] as unknown[])] : [];
  const sourceIndex = values.findIndex((value) => memberOf(value) === sourceMember);
  const anchorIndex = anchorMember
    ? values.findIndex((value) => memberOf(value) === anchorMember)
    : undefined;
  if (sourceIndex < 0 || (anchorMember !== undefined && anchorIndex === -1)) {
    return undefined;
  }
  return commit(formData, field, reposition(values, sourceIndex, anchorIndex, placement));
}

/**
 * Переставляет единственную сущность относительно соседней. Без anchor — в конец
 * соответствующего runtime-раздела, например при drop на заголовок раздела.
 */
export function reorderStudioTreeMember(
  formData: unknown,
  section: StudioTreeSection,
  member: string,
  anchorMember?: string,
  placement: TreeDropPlacement = 'after',
): unknown | undefined {
  if (section === 'pages') {
    const suites = asRecord(asRecord(formData)?.test_suites);
    const pages = asRecord(suites?.pages);
    if (!pages || !(member in pages) || (anchorMember !== undefined && !(anchorMember in pages))) {
      return undefined;
    }
    const entries = Object.entries(pages);
    const sourceIndex = entries.findIndex(([key]) => key === member);
    const anchorIndex = anchorMember
      ? entries.findIndex(([key]) => key === anchorMember)
      : undefined;
    return commit(
      formData,
      'pages',
      Object.fromEntries(reposition(entries, sourceIndex, anchorIndex, placement)),
    );
  }
  if (section === 'scenarios') {
    return reorderArray(
      formData,
      'scenarios',
      member,
      anchorMember,
      placement,
      (value) => {
        const name = asRecord(value)?.scenario_name;
        return typeof name === 'string' ? name : '';
      },
    );
  }
  if (section === 'modules') {
    return reorderArray(
      formData,
      'test_data_constructor',
      member,
      anchorMember,
      placement,
      (value) => {
        const id = asRecord(value)?.id;
        return typeof id === 'string' ? id : '';
      },
    );
  }
  if (section === 'fuzzers') {
    return reorderArray(
      formData,
      'fuzzers',
      member,
      anchorMember,
      placement,
      (value) => {
        const id = asRecord(value)?.id;
        return typeof id === 'string' ? id : '';
      },
    );
  }
  return reorderArray(
    formData,
    'imports',
    member,
    anchorMember,
    placement,
    (value) => normalizeImport(value).as,
  );
}
