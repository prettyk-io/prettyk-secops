/**
 * PRETTYK-CI — Каталог security-шагов (PK-CI-4).
 *
 * Готовые проверяемые возможности, а не список npm-пакетов.
 * Каждый шаг: назначение, риск, права, входы/выходы, версия.
 *
 *   import { STEP_CATALOG, findStep, stepCapabilities } from '@/ci/stepCatalog';
 */
import type { Capability, ComponentRef } from './types';

export interface StepInput {
  name: string;
  label: string;
  /** Ссылка на секрет или plain-значение. Никогда raw secret. */
  kind: 'string' | 'secret_ref' | 'artifact_ref';
  required?: boolean;
}

export interface StepOutput {
  name: string;
  label: string;
  /** Тип артефакта / evidence. */
  evidenceType?: string;
}

export interface StepCapability {
  /** Назначение шага. */
  purpose: string;
  /** Уровень риска для target. */
  risk: 'none' | 'low' | 'medium' | 'high' | 'critical';
  /** Требуемые capabilities (права). */
  requiredCapabilities: Capability[];
  /** Входы. */
  inputs: StepInput[];
  /** Выходы / evidence. */
  outputs: StepOutput[];
  /** Ограничения на target (например, только https). */
  targetRestrictions?: string[];
  /** Требуемый network access. */
  networkAccess?: 'none' | 'target_only' | 'egress';
  /** Supported environments. */
  environments?: string[];
}

export interface CatalogStep {
  id: string;
  name: string;
  description: string;
  /** Versioned ref — production НЕ ссылается на latest. */
  version: string;
  digest?: string;
  capability: StepCapability;
}

export const STEP_CATALOG: CatalogStep[] = [
  {
    id: 'browser-discovery',
    name: 'Browser Discovery',
    description: 'Обходит целевое приложение браузером, собирает поверхность атаки: страницы, формы, эндпоинты.',
    version: '1.4.0',
    digest: 'sha256:bd1...',
    capability: {
      purpose: 'Построить карту атакующей поверхности до активных проверок.',
      risk: 'low',
      requiredCapabilities: ['checks:create'],
      inputs: [
        { name: 'target_url', label: 'Target URL', kind: 'string', required: true },
        { name: 'auth_ref', label: 'Auth context reference', kind: 'secret_ref' },
      ],
      outputs: [
        { name: 'surface_map', label: 'Discovered surface map', evidenceType: 'discovery' },
      ],
      networkAccess: 'target_only',
      environments: ['Lab Stand', 'Staging VPC'],
    },
  },
  {
    id: 'scanner-active-scan',
    name: 'scanner Active Scan',
    description: 'Активное сканирование OWASP scanner: SQLi, XSS, SSRF, misconfig и другие активные проверки.',
    version: '2.15.0',
    digest: 'sha256:scanner...',
    capability: {
      purpose: 'Активное обнаружение уязвимостей по OWASP Top-10.',
      risk: 'high',
      requiredCapabilities: ['fuzzer:execute', 'checks:create'],
      inputs: [
        { name: 'target_url', label: 'Target URL', kind: 'string', required: true },
        { name: 'policy', label: 'Scan policy', kind: 'string', required: true },
      ],
      outputs: [
        { name: 'scanner_report', label: 'scanner report', evidenceType: 'scan_report' },
        { name: 'findings', label: 'Normalized findings', evidenceType: 'finding' },
      ],
      targetRestrictions: ['https only', 'inside scope'],
      networkAccess: 'target_only',
      environments: ['Lab Stand', 'Staging VPC'],
    },
  },
  {
    id: 'corpus-fuzzing',
    name: 'Corpus Fuzzing',
    description: 'Мутационное фаззинг по корпусу запросов для обнаружения скрытых ошибок и edge cases.',
    version: '0.9.2',
    digest: 'sha256:fzz...',
    capability: {
      purpose: 'Обнаружение непокрытых тестами ошибок через мутационное фаззинг.',
      risk: 'critical',
      requiredCapabilities: ['fuzzer:execute'],
      inputs: [
        { name: 'corpus_ref', label: 'Corpus reference', kind: 'artifact_ref', required: true },
        { name: 'target_url', label: 'Target URL', kind: 'string', required: true },
      ],
      outputs: [
        { name: 'crash_corpus', label: 'Crash corpus', evidenceType: 'fuzz_result' },
        { name: 'coverage', label: 'Coverage report', evidenceType: 'coverage' },
      ],
      targetRestrictions: ['inside scope', 'rate-limited'],
      networkAccess: 'target_only',
      environments: ['Lab Stand'],
    },
  },
  {
    id: 'quality-gate',
    name: 'Quality Gate',
    description: 'Оценивает findings по policy и выдаёт вердикт passed / warning / failed.',
    version: '3.1.0',
    digest: 'sha256:gate...',
    capability: {
      purpose: 'Формализовать вердикт запуска по severity-порогам policy.',
      risk: 'none',
      requiredCapabilities: ['policies:manage'],
      inputs: [
        { name: 'findings_ref', label: 'Findings reference', kind: 'artifact_ref', required: true },
        { name: 'policy', label: 'Policy', kind: 'string', required: true },
      ],
      outputs: [
        { name: 'verdict', label: 'Gate verdict', evidenceType: 'verdict' },
      ],
      networkAccess: 'none',
      environments: ['Lab Stand', 'Staging VPC', 'Production'],
    },
  },
  {
    id: 'evidence-pack',
    name: 'Evidence Pack',
    description: 'Собирает все артефакты, checksum и provenance в единый доказательный пакет.',
    version: '1.2.0',
    digest: 'sha256:evd...',
    capability: {
      purpose: 'Сформировать Proof-Carrying Run из артефактов запуска.',
      risk: 'none',
      requiredCapabilities: ['checks:create'],
      inputs: [
        { name: 'run_ref', label: 'Run reference', kind: 'artifact_ref', required: true },
      ],
      outputs: [
        { name: 'evidence_package', label: 'Evidence package', evidenceType: 'provenance' },
      ],
      networkAccess: 'none',
      environments: ['Lab Stand', 'Staging VPC', 'Production'],
    },
  },
  {
    id: 'defectdojo-sync',
    name: 'DefectDojo Sync',
    description: 'Публикует findings в DefectDojo, дедупликация по fingerprint, обратный импорт статусов.',
    version: '1.8.1',
    digest: 'sha256:ddj...',
    capability: {
      purpose: 'Синхронизация findings с внешней системой дедупликации и triage.',
      risk: 'low',
      requiredCapabilities: ['checks:import'],
      inputs: [
        { name: 'findings_ref', label: 'Findings reference', kind: 'artifact_ref', required: true },
        { name: 'project_id', label: 'Dojo project id', kind: 'string', required: true },
      ],
      outputs: [
        { name: 'dojo_import', label: 'Dojo import result', evidenceType: 'sync_result' },
      ],
      networkAccess: 'egress',
      environments: ['Lab Stand', 'Staging VPC'],
    },
  },
];

export function findStep(id: string): CatalogStep | undefined {
  return STEP_CATALOG.find(s => s.id === id);
}

export function stepComponentRef(id: string): ComponentRef | null {
  const step = findStep(id);
  if (!step) return null;
  return { name: step.name, version: step.version, digest: step.digest };
}

export function stepCapabilities(id: string): Capability[] {
  return findStep(id)?.capability.requiredCapabilities ?? [];
}

/**
 * Собрать объединённые требуемые capabilities пайпа из каталога.
 */
export function pipelineRequiredCapabilities(stepIds: string[]): Capability[] {
  const set = new Set<Capability>();
  for (const id of stepIds) {
    for (const c of stepCapabilities(id)) set.add(c);
  }
  return [...set];
}
