/**
 * Имена переменных для подстановки в конструкторах.
 *
 * Канон: $name, $user.email (legacy ${…}). См. DataStream / refs.ts.
 *
 * Источники: save_as, id test_data_constructor, Пусть/Секрет / Элемент в constructor.
 */
import { isPlainObject } from '../utils/json';
import { sortStringsAsc } from '../utils/sortStrings';
import { collectNamesFromPrettySegments } from './variablesPrettySegments';
import {
  collectFromImports,
  collectFromModules,
  collectFromPages,
  collectFromScenarios,
} from './variablesSuitesCollect';
import { collectNamesFromWire } from './variablesWireCollect';

function stringField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function arrayField(source: Record<string, unknown>, key: string): unknown[] {
  const value = source[key];
  return Array.isArray(value) ? value : [];
}

/** Вытащить объявленные имена из pretty/wire constructor-текста. */
export function collectNamesFromConstructor(text: string): string[] {
  const found = new Set<string>();
  if (!text) {
    return [];
  }
  collectNamesFromPrettySegments(text, found);
  collectNamesFromWire(text, found);
  return [...found];
}

function addConstructorNames(names: Set<string>, constructor: string | undefined): void {
  if (!constructor) {
    return;
  }
  for (const name of collectNamesFromConstructor(constructor)) {
    names.add(name);
  }
}

export function collectVariables(formData: unknown): string[] {
  if (!isPlainObject(formData)) {
    return [];
  }
  const testSuites = formData.test_suites;
  if (!isPlainObject(testSuites)) {
    return [];
  }

  return collectVariablesFromSuites(testSuites);
}

/**
 * Кэш по ссылке test_suites: при правках формы (regulation) объект test_suites не
 * меняется → не перепарсиваем все конструкторы на каждую клавишу.
 */
const variablesCache = new WeakMap<object, string[]>();

function collectVariablesFromSuites(testSuites: Record<string, unknown>): string[] {
  const cached = variablesCache.get(testSuites);
  if (cached) {
    return cached;
  }
  const names = new Set<string>();
  collectFromScenarios(testSuites, names, arrayField, stringField, addConstructorNames);
  collectFromPages(testSuites, names, stringField, addConstructorNames);
  collectFromModules(testSuites, names, arrayField, stringField, addConstructorNames);
  collectFromImports(testSuites, names, arrayField, stringField);
  const result = sortStringsAsc(names);
  variablesCache.set(testSuites, result);
  return result;
}
