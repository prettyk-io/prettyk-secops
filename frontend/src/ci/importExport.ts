/**
 * PRETTYK-CI — Import/Export с уровнями совместимости (PK-CI-8).
 *
 * Не обещаем «магический импорт всего». Показываем:
 *   — что будет выполнено;
 *   — что потребует approval/secrets;
 *   — какие features потеряны;
 *   — какие outputs вернутся.
 *
 * Уровни:
 *   Lossless  — смысл, gates, outputs и evidence без изменения.
 *   Mapped    — внешний формат поддерживает поведение через эквивалент.
 *   Degraded  — часть возможностей заменена; UI показывает точный список потерь.
 *   Unsupported — запуск блокируется; тихого удаления шага нет.
 *
 *   import { assessImport, assessExport } from '@/ci/importExport';
 */
import type {
  PipelineDefinition,
  StepNode,
  ComponentRef,
  VersionRef,
} from './types';
import { STEP_CATALOG, findStep } from './stepCatalog';

// ═══════════════════════════════════════════════════════════════════════════
// Compatibility levels
// ═══════════════════════════════════════════════════════════════════════════

export type CompatibilityLevel = 'lossless' | 'mapped' | 'degraded' | 'unsupported';

export interface StepCompatibility {
  originalId: string;
  mappedId?: string;
  level: CompatibilityLevel;
  /** Человекочитаемое описание, что именно потеряно/изменено. */
  detail: string;
}

export interface CompatibilityReport {
  pipelineId: string;
  /** Общий уровень совместимости (худший из всех шагов). */
  overallLevel: CompatibilityLevel;
  /** Пошаговый отчёт. */
  steps: StepCompatibility[];
  /** Сводка: что выполнено, что потеряно, что заблокировано. */
  summary: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Mapper: внешний компонент → PrettyK step id
// ═══════════════════════════════════════════════════════════════════════════

type ExternalComponentName = string;
type PrettyKStepId = string;

const COMPONENT_MAP: Partial<Record<ExternalComponentName, PrettyKStepId>> = {
  'browser-discovery': 'browser-discovery',
  'zap-active-scan': 'zap-active-scan',
  'zap-baseline-scan': 'zap-active-scan',
  'zap-full-scan': 'zap-active-scan',
  'corpus-fuzzing': 'corpus-fuzzing',
  'fuzzer': 'corpus-fuzzing',
  'quality-gate': 'quality-gate',
  'security-gate': 'quality-gate',
  'evidence-pack': 'evidence-pack',
  'evidence-collect': 'evidence-pack',
  'defectdojo-sync': 'defectdojo-sync',
  'dojo-import': 'defectdojo-sync',
};

function mapComponent(name: string): { mappedId?: string; level: CompatibilityLevel; detail: string } {
  const exactMatch = COMPONENT_MAP[name];
  if (exactMatch) {
    return { mappedId: exactMatch, level: 'lossless', detail: `Direct mapping: ${name} → ${exactMatch}` };
  }

  // Fuzzy: lowercase, strip vendor prefix
  const normalized = name.toLowerCase().replace(/^(github-action|gitlab-component|jenkins-plugin)[/-]/, '');
  const fuzzyMatch = COMPONENT_MAP[normalized];
  if (fuzzyMatch) {
    return { mappedId: fuzzyMatch, level: 'mapped', detail: `Fuzzy mapping: ${name} → ${fuzzyMatch} (vendor prefix stripped)` };
  }

  // Partial match by substring (уверенный — токен пересекается с catalog ID)
  // Ищем по совпадению значимой части имени (не по одиночным буквам)
  const tokens = normalized.split(/[-_/]/).filter(t => t.length >= 3);
  for (const [ext, pk] of Object.entries(COMPONENT_MAP)) {
    const extTokens = ext.split(/[-_]/);
    const sharedCount = tokens.filter(tt => extTokens.some(et => et.includes(tt) || tt.includes(et))).length;
    if (sharedCount >= 2 || (sharedCount >= 1 && tokens.some(t => ext.includes(t) && t.length >= 4))) {
      return { mappedId: pk, level: 'degraded', detail: `Partial match: ${name} may be similar to ${ext} → ${pk}. Verify inputs/outputs manually.` };
    }
  }

  // Unknown — unsupported
  return { level: 'unsupported', detail: `No compatible PrettyK step found for "${name}". This step will be blocked.` };
}

// ═══════════════════════════════════════════════════════════════════════════
// Import assessment
// ═══════════════════════════════════════════════════════════════════════════

export interface ImportInput {
  pipelineId: string;
  /** Внешние компоненты (имена). */
  externalSteps: { id: string; name: string }[];
}

export function assessImport(input: ImportInput): CompatibilityReport {
  const steps: StepCompatibility[] = [];
  let worst: CompatibilityLevel = 'lossless';

  const levelRank: Record<CompatibilityLevel, number> = {
    lossless: 0,
    mapped: 1,
    degraded: 2,
    unsupported: 3,
  };

  for (const ext of input.externalSteps) {
    const mapping = mapComponent(ext.name);
    const sc: StepCompatibility = {
      originalId: ext.id,
      mappedId: mapping.mappedId,
      level: mapping.level,
      detail: mapping.detail,
    };
    steps.push(sc);
    if (levelRank[mapping.level] > levelRank[worst]) worst = mapping.level;
  }

  const countByLevel = (l: CompatibilityLevel) => steps.filter(s => s.level === l).length;

  const summary = [
    `Pipeline "${input.pipelineId}": ${steps.length} steps imported.`,
    `  Lossless: ${countByLevel('lossless')}`,
    `  Mapped: ${countByLevel('mapped')}`,
    `  Degraded: ${countByLevel('degraded')}`,
    `  Unsupported: ${countByLevel('unsupported')} — these steps will be blocked.`,
    worst === 'lossless' ? 'Full compatibility — no losses.' :
    worst === 'mapped' ? 'Minor adaptations required — semantics preserved.' :
    worst === 'degraded' ? 'Some features replaced — review degraded steps before running.' :
    'Pipeline blocked — unsupported steps require attention.',
  ].join('\n');

  return {
    pipelineId: input.pipelineId,
    overallLevel: worst,
    steps,
    summary,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Export: PrettyK → external format compatibility
// ═══════════════════════════════════════════════════════════════════════════

export type ExportTarget = 'github-actions' | 'gitlab-ci' | 'jenkins' | 'tekton' | 'prettyk-native';

export interface ExportResult {
  target: ExportTarget;
  /** Steps that can be exported losslessly. */
  lossless: StepExport[];
  /** Degraded: mapped to equivalent but not identical. */
  degraded: StepExport[];
  /** Steps with no external equivalent. */
  unsupported: string[];
}

export interface StepExport {
  prettyKId: string;
  externalName: string;
  /** Ссылка на документацию/рецепт для этого CI. */
  recipeUrl?: string;
}

const EXPORT_MAP: Record<ExportTarget, Partial<Record<string, string>>> = {
  'github-actions': {
    'browser-discovery': 'prettyk/browser-discovery@v1',
    'zap-active-scan': 'prettyk/zap-scan@v2',
    'corpus-fuzzing': 'prettyk/fuzzer@v2',
    'quality-gate': 'prettyk/quality-gate@v3',
    'evidence-pack': 'prettyk/evidence-pack@v1',
    'defectdojo-sync': 'prettyk/dojo-sync@v1',
  },
  'gitlab-ci': {
    'browser-discovery': 'prettyk/browser-discovery@v1',
    'zap-active-scan': 'prettyk/zap-scan@v2',
    'corpus-fuzzing': 'prettyk/fuzzer@v2',
    'quality-gate': 'prettyk/quality-gate@v3',
    'evidence-pack': 'prettyk/evidence-pack@v1',
    'defectdojo-sync': 'prettyk/dojo-sync@v1',
  },
  'jenkins': {
    'browser-discovery': 'prettyk/browser-discovery@v1',
    'zap-active-scan': 'prettyk/zap-scan@v2',
    'quality-gate': 'prettyk/quality-gate@v3',
  },
  'tekton': {
    'browser-discovery': 'prettyk-browser-discovery-task',
    'zap-active-scan': 'prettyk-zap-scan-task',
    'quality-gate': 'prettyk-quality-gate-task',
  },
  'prettyk-native': {
    'browser-discovery': 'browser-discovery',
    'zap-active-scan': 'zap-active-scan',
    'corpus-fuzzing': 'corpus-fuzzing',
    'quality-gate': 'quality-gate',
    'evidence-pack': 'evidence-pack',
    'defectdojo-sync': 'defectdojo-sync',
  },
};

export function assessExport(pipeline: PipelineDefinition, target: ExportTarget): ExportResult {
  const targetMap = EXPORT_MAP[target] ?? {};
  const lossless: StepExport[] = [];
  const degraded: StepExport[] = [];
  const unsupported: string[] = [];

  for (const step of pipeline.steps) {
    // Match by component name → catalog entry → export map
    const catalogStep = findStep(step.component.name)
      ?? STEP_CATALOG.find(s => s.name === step.component.name);
    const catalogId = catalogStep?.id ?? step.component.name;

    const externalName = targetMap[catalogId];
    if (externalName) {
      lossless.push({ prettyKId: step.id, externalName });
      continue;
    }

    // Try fuzzy: search export keys that include or are included in catalogId
    const fuzzyKey = Object.keys(targetMap).find(k =>
      catalogId.toLowerCase().includes(k.toLowerCase())
      || k.toLowerCase().includes(catalogId.toLowerCase())
    );
    if (fuzzyKey) {
      degraded.push({ prettyKId: step.id, externalName: targetMap[fuzzyKey]! });
    } else {
      unsupported.push(step.id);
    }
  }

  return { target, lossless, degraded, unsupported };
}