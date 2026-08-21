/**
 * Дерево Explorer для бланка регламента — зеркало Studio без constructor-текста.
 */

import { collectStudioNodes } from '../studio/collectStudioNodes';
import type { ExplorerNode } from './types';

export function buildExplorerTree(formData: unknown): ExplorerNode[] {
  const tree = collectStudioNodes(formData);
  const roots: ExplorerNode[] = [];

  if (tree.pages.length > 0) {
    roots.push({
      id: 'pages',
      kind: 'pages',
      title: 'Страницы',
      children: tree.pages.map((page) => ({
        id: `page:${page.key}`,
        kind: 'page' as const,
        title: page.title || page.key || '(без id)',
      })),
    });
  }

  if (tree.scenarios.length > 0) {
    roots.push({
      id: 'scenarios',
      kind: 'scenarios',
      title: 'Сценарии',
      children: tree.scenarios.map((scenario) => ({
        id: `scenario:${String(scenario.scenarioIndex)}`,
        kind: 'scenario' as const,
        title: scenario.title || `scenario ${String(scenario.scenarioIndex)}`,
      })),
    });
  }

  if (tree.modules.length > 0) {
    roots.push({
      id: 'modules',
      kind: 'modules',
      title: 'Модули',
      children: tree.modules.map((mod) => ({
        id: `module:${mod.key}`,
        kind: 'module' as const,
        title: mod.title || mod.key || '(без id)',
      })),
    });
  }

  if (tree.fuzzers.length > 0) {
    roots.push({
      id: 'fuzzers',
      kind: 'fuzzers',
      title: 'Фаззеры',
      children: tree.fuzzers.map((fuzzer) => ({
        id: `fuzzer:${String(fuzzer.fuzzerIndex)}`,
        kind: 'fuzzer' as const,
        title: fuzzer.title || fuzzer.fuzzerId || `fuzzer ${String(fuzzer.fuzzerIndex)}`,
      })),
    });
  }

  if (tree.resources.length > 0) {
    roots.push({
      id: 'resources',
      kind: 'resources',
      title: 'Ресурсы',
      children: tree.resources.map((res) => ({
        id: `resource:${res.as}`,
        kind: 'resource' as const,
        title: res.as || '(resource)',
      })),
    });
  }

  return roots;
}
