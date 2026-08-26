/**
 * Open-tab constructor text helpers for StudioWorkspace (S3776).
 */
import {
  getAtPointer,
  setAtPointer,
  type StudioEditableNode,
  type StudioTree,
} from './collectStudioNodes';
import { defaultConstructorText, padConstructorCanvas } from './defaultConstructor';
import { isPlainStudioConstructorTab } from './studioDiagnostics';
import type { StudioTab } from './studioTabs';

export function firstStudioNode(tree: StudioTree): StudioEditableNode | undefined {
  if (tree.pages[0]) {
    return tree.pages[0];
  }
  if (tree.scenarios[0]) {
    return tree.scenarios[0];
  }
  if (tree.modules[0]) {
    return tree.modules[0];
  }
  if (tree.fuzzers[0]) {
    return tree.fuzzers[0];
  }
  if (tree.resources[0]) {
    return tree.resources[0];
  }
  return undefined;
}

export function readConstructorSlice(formData: unknown, path: string): string {
  const value = getAtPointer(formData, path);
  return typeof value === 'string' ? value : '';
}

/** Старый seed `@id` в data-модуле — выкинуть, это не URL. */
export function stripLegacyAtSeed(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const filtered = lines.filter((line) => {
    const t = line.trim();
    if (t === '@') {
      return false;
    }
    return !/^@[A-Za-z_][A-Za-z0-9_]*$/.test(t);
  });
  return filtered.join('\n');
}

export function constructorTextOrDefault(
  formData: unknown,
  path: string,
  plainList = false,
): string {
  const value = getAtPointer(formData, path);
  if (plainList) {
    if (typeof value === 'string' && value.length > 0) {
      return stripLegacyAtSeed(value);
    }
    return '';
  }
  if (typeof value === 'string' && value.length > 0) {
    return padConstructorCanvas(value);
  }
  return defaultConstructorText();
}

export type EnsureOpenConstructorResult = {
  data: unknown;
  text: string;
  mutated: boolean;
};

/** Pad/default constructor into formData when opening a document tab. */
export function ensureConstructorOnOpen(
  data: unknown,
  tab: StudioTab,
): EnsureOpenConstructorResult {
  if (!tab.path || tab.kind === 'resource' || tab.kind === 'fuzzer') {
    return { data, text: '', mutated: false };
  }
  const plain = isPlainStudioConstructorTab(data, tab);
  const text = constructorTextOrDefault(data, tab.path, plain);
  const stored = readConstructorSlice(data, tab.path);
  if (stored.length === 0 || (plain && stored !== text)) {
    return { data: setAtPointer(data, tab.path, text), text, mutated: true };
  }
  return { data, text, mutated: false };
}
