/**
 * collectVariables suite walks (S3776).
 */
import { isPlainObject } from '../utils/json';
import { isIdentName, stemFromImportPath } from './importStem';

type StringField = (source: Record<string, unknown>, key: string) => string | undefined;
type ArrayField = (source: Record<string, unknown>, key: string) => unknown[];
type AddCtor = (names: Set<string>, constructor: string | undefined) => void;

export function collectFromScenarios(
  testSuites: Record<string, unknown>,
  names: Set<string>,
  arrayField: ArrayField,
  stringField: StringField,
  addConstructorNames: AddCtor,
): void {
  for (const scenario of arrayField(testSuites, 'scenarios')) {
    if (!isPlainObject(scenario)) {
      continue;
    }
    for (const step of arrayField(scenario, 'steps')) {
      if (!isPlainObject(step)) {
        continue;
      }
      const saveAs = stringField(step, 'save_as');
      if (saveAs !== undefined) {
        names.add(saveAs);
      }
      addConstructorNames(names, stringField(step, 'constructor'));
    }
  }
}

export function collectFromPages(
  testSuites: Record<string, unknown>,
  names: Set<string>,
  stringField: StringField,
  addConstructorNames: AddCtor,
): void {
  const pages = testSuites.pages;
  if (!isPlainObject(pages)) {
    return;
  }
  for (const page of Object.values(pages)) {
    if (!isPlainObject(page)) {
      continue;
    }
    addConstructorNames(names, stringField(page, 'constructor'));
  }
}

export function collectFromModules(
  testSuites: Record<string, unknown>,
  names: Set<string>,
  arrayField: ArrayField,
  stringField: StringField,
  addConstructorNames: AddCtor,
): void {
  for (const module of arrayField(testSuites, 'test_data_constructor')) {
    if (!isPlainObject(module)) {
      continue;
    }
    const id = stringField(module, 'id');
    if (id !== undefined) {
      names.add(id);
    }
    addConstructorNames(names, stringField(module, 'constructor'));
  }
}

export function collectFromImports(
  testSuites: Record<string, unknown>,
  names: Set<string>,
  arrayField: ArrayField,
  stringField: StringField,
): void {
  for (const item of arrayField(testSuites, 'imports')) {
    if (typeof item === 'string') {
      const stem = stemFromImportPath(item);
      if (stem) {
        names.add(stem);
      }
      continue;
    }
    if (!isPlainObject(item)) {
      continue;
    }
    const as = stringField(item, 'as');
    if (as !== undefined && isIdentName(as)) {
      names.add(as);
    }
  }
}
