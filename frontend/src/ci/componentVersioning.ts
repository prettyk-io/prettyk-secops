/**
 * PRETTYK-CI — Component Versioning (PK-CI-9).
 *
 * Переиспользуемые security-компоненты версионируются.
 * Production-проверка не может ссылаться на 'latest'.
 *
 *   import { validateComponentVersions, ComponentRegistry } from '@/ci/componentVersioning';
 */
import type { PipelineDefinition, VersionRef, ComponentRef } from './types';
import { STEP_CATALOG } from './stepCatalog';

// ═══════════════════════════════════════════════════════════════════════════
// Version model
// ═══════════════════════════════════════════════════════════════════════════

export interface ComponentVersion {
  name: string;
  version: string;
  digest?: string;
  /** Semver-совместимая строка (major.minor.patch). */
  releasedAt?: string;
  /** Production-ready или pre-release. */
  maturity: 'stable' | 'beta' | 'preview';
}

export interface ComponentVersionHistory {
  name: string;
  versions: ComponentVersion[];
}

export interface VersionValidation {
  ok: boolean;
  /** Шаги, ссылающиеся на latest. */
  unpinnedSteps: string[];
  /** Шаги, ссылающиеся на несуществующую версию. */
  unknownVersionSteps: string[];
  /** Шаги, ссылающиеся на beta/preview в production-режиме. */
  immatureSteps: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Registry (источник правды версий — производный от каталога)
// ═══════════════════════════════════════════════════════════════════════════

export function buildRegistry(): ComponentVersionHistory[] {
  return STEP_CATALOG.map(s => ({
    name: s.name,
    versions: [{
      name: s.name,
      version: s.version,
      digest: s.digest,
      maturity: s.version.includes('-') ? 'beta' : 'stable',
    }],
  }));
}

/**
 * Проверить, что все компоненты пайпа зафиксированы и существуют.
 *
 * production: true → beta/preview запрещены, latest запрещён.
 */
export function validateComponentVersions(
  pipeline: PipelineDefinition,
  opts: { production?: boolean } = {},
): VersionValidation {
  const { production = true } = opts;
  const registry = buildRegistry();
  const byName = new Map(registry.map(r => [r.name, r]));

  const unpinnedSteps: string[] = [];
  const unknownVersionSteps: string[] = [];
  const immatureSteps: string[] = [];

  for (const step of pipeline.steps) {
    const ref = step.component;

    // 1. latest запрещён (всегда, не только production)
    if (ref.version === 'latest' || !ref.version.trim()) {
      unpinnedSteps.push(step.id);
      continue;
    }

    // 2. Версия существует в registry?
    const history = byName.get(ref.name);
    if (!history) {
      unknownVersionSteps.push(step.id);
      continue;
    }
    const versionExists = history.versions.some(v => v.version === ref.version);
    if (!versionExists) {
      unknownVersionSteps.push(step.id);
      continue;
    }

    // 3. Production: maturity должен быть stable
    if (production) {
      const ver = history.versions.find(v => v.version === ref.version);
      if (ver && ver.maturity !== 'stable') {
        immatureSteps.push(step.id);
      }
    }
  }

  return {
    ok: unpinnedSteps.length === 0 && unknownVersionSteps.length === 0 && immatureSteps.length === 0,
    unpinnedSteps,
    unknownVersionSteps,
    immatureSteps,
  };
}

/**
 * Гейт для production-запуска: latest / неизвестные / незрелые версии — блок.
 */
export function productionGate(pipeline: PipelineDefinition): VersionValidation {
  return validateComponentVersions(pipeline, { production: true });
}

/**
 * История версий компонента (для UI: показать все доступные версии).
 */
export function versionHistoryOf(componentName: string): ComponentVersion[] {
  const registry = buildRegistry();
  return registry.find(r => r.name === componentName)?.versions ?? [];
}
