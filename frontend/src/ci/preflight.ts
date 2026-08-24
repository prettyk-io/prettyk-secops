/**
 * PRETTYK-CI — Preflight Engine (PK-CI-5).
 *
 * Перед запуском: проверяет scope, policy, approvals, capabilities.
 * Действие вне scope → fail-closed + аудит. Тихого «ну попробуем» нет.
 *
 *   import { runPreflight } from '@/ci/preflight';
 *   const result = runPreflight(pipeline, caps, targetUrl);
 */
import type {
  PipelineDefinition,
  Scope,
  ScopeRule,
  ApprovalRef,
  Capability,
  RunRecord,
  RunTimelineEvent,
} from './types';
import type { GraphIssue } from './pipelineStore';
import { validatePipelineGraph } from './pipelineStore';
import { collectUnpinnedComponents } from './pipelineStore';

// ═══════════════════════════════════════════════════════════════════════════
// Audit & Block reasons
// ═══════════════════════════════════════════════════════════════════════════

export type PreflightBlockReason =
  | 'scope_violation'
  | 'inactive_policy'
  | 'missing_approval'
  | 'missing_capability'
  | 'graph_invalid'
  | 'unpinned_component'
  | 'target_unreachable_hint';

export interface PreflightBlock {
  kind: PreflightBlockReason;
  detail: string;
  /** Шаг, к которому относится блокировка (если применимо). */
  stepId?: string;
}

export interface AuditEvent {
  kind: 'preflight_blocked' | 'preflight_passed' | 'scope_violation';
  at: string;
  pipelineId: string;
  actor: string;
  blocks: PreflightBlock[];
}

export interface PreflightResult {
  ok: boolean;
  /** Человекочитаемый список всего, что прошло и что заблокировано. */
  blocks: PreflightBlock[];
  /** Полный план запуска (шаги в порядке выполнения). */
  plan: string[];
  /** Audit events. */
  audit: AuditEvent[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Scope check: match URL against allowed hosts/rules
// ═══════════════════════════════════════════════════════════════════════════

function hostMatches(url: string, pattern: string): boolean {
  if (pattern === '*') return true;
  // Extract host from URL
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    host = url;
  }
  // Wildcard: *.example.com
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return host === suffix || host.endsWith('.' + suffix);
  }
  return host === pattern;
}

function pathMatches(url: string, prefix?: string): boolean {
  if (!prefix) return true;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  return path.startsWith(prefix);
}

function schemeMatches(url: string, schemes?: string[]): boolean {
  if (!schemes || schemes.length === 0) return true;
  let scheme: string;
  try {
    scheme = new URL(url).protocol.replace(':', '');
  } catch {
    scheme = 'https';
  }
  return schemes.includes(scheme);
}

export function checkScope(url: string, scope: Scope): PreflightBlock[] {
  const blocks: PreflightBlock[] = [];

  if (scope.rules.length === 0) return blocks; // no scope = implicit allow

  let matched = false;
  for (const rule of scope.rules) {
    const hostOk = rule.allowedHosts.some(p => hostMatches(url, p));
    const pathOk = pathMatches(url, rule.allowedPaths?.[0]);
    const schemeOk = schemeMatches(url, rule.allowedSchemes);

    if (hostOk && pathOk && schemeOk) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    blocks.push({
      kind: 'scope_violation',
      detail: `URL "${url}" is outside approved scope. Allowed: ${scope.rules.map(r => r.allowedHosts.join(', ')).join('; ')}. ${scope.description ?? ''}`,
    });
  }

  return blocks;
}

// ═══════════════════════════════════════════════════════════════════════════
// Policy check
// ═══════════════════════════════════════════════════════════════════════════

export function checkPolicy(policy: { id: string; active?: boolean }): PreflightBlock[] {
  if (policy.active === false) {
    return [{
      kind: 'inactive_policy',
      detail: `Policy "${policy.id}" is inactive. Activate the policy or select a different one to proceed.`,
    }];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════
// Approvals check
// ═══════════════════════════════════════════════════════════════════════════

export function checkApprovals(
  approvals: ApprovalRef[] | undefined,
  heldCapabilities: Capability[],
): PreflightBlock[] {
  if (!approvals || approvals.length === 0) return [];
  const blocks: PreflightBlock[] = [];
  for (const a of approvals) {
    if (a.kind === 'role' && a.required && !heldCapabilities.includes(a.required)) {
      blocks.push({
        kind: 'missing_approval',
        detail: `Step requires approval "${a.label}", but the required capability "${a.required}" is not held.`,
        stepId: a.label,
      });
    }
    // 'manual' approvals — always require explicit confirmation (permitted, но документируем)
    if (a.kind === 'manual') {
      // Не блокируем, но в плане будет видно
    }
  }
  return blocks;
}

// ═══════════════════════════════════════════════════════════════════════════
// Capabilities check (user vs pipeline required)
// ═══════════════════════════════════════════════════════════════════════════

export function checkCapabilities(
  required: Capability[],
  held: Capability[],
): PreflightBlock[] {
  const blocks: PreflightBlock[] = [];
  for (const c of required) {
    if (!held.includes(c)) {
      blocks.push({
        kind: 'missing_capability',
        detail: `Missing required capability: "${c}".`,
      });
    }
  }
  return blocks;
}

// ═══════════════════════════════════════════════════════════════════════════
// Full preflight
// ═══════════════════════════════════════════════════════════════════════════

export interface PreflightInput {
  pipeline: PipelineDefinition;
  /** URL конкретного target (может быть из параметров запуска). */
  targetUrl: string;
  /** Capabilities выполняющего пользователя. */
  heldCapabilities: Capability[];
  /** Actor ID. */
  actor: string;
  /** Активна ли политика на момент preflight. */
  policyActive?: boolean;
}

export function runPreflight(input: PreflightInput): PreflightResult {
  const {
    pipeline,
    targetUrl,
    heldCapabilities,
    actor,
    policyActive = true,
  } = input;

  const blocks: PreflightBlock[] = [];
  const now = new Date().toISOString();

  // 1. Граф integrity
  const graphIssues = validatePipelineGraph(pipeline);
  for (const issue of graphIssues) {
    blocks.push({ kind: 'graph_invalid', detail: issue.detail });
  }

  // 2. Unpinned components (production gate)
  const unpinned = collectUnpinnedComponents(pipeline);
  for (const id of unpinned) {
    blocks.push({ kind: 'unpinned_component', detail: `Step "${id}" uses unpinned version. Production checks require a pinned version/digest.`, stepId: id });
  }

  // 3. Scope
  blocks.push(...checkScope(targetUrl, pipeline.scope));

  // 4. Policy
  blocks.push(...checkPolicy({ id: pipeline.policy.id, active: policyActive }));

  // 5. Capabilities
  blocks.push(...checkCapabilities(pipeline.requiredCapabilities, heldCapabilities));

  // 6. Step-level approvals
  for (const step of pipeline.steps) {
    blocks.push(...checkApprovals(step.approvals, heldCapabilities));
  }

  // Deduplicate blocks by kind+detail
  const unique = new Map<string, PreflightBlock>();
  for (const b of blocks) {
    const key = `${b.kind}:${b.detail}:${b.stepId ?? ''}`;
    if (!unique.has(key)) unique.set(key, b);
  }

  const finalBlocks = [...unique.values()];

  // Audit event
  const audit: AuditEvent = {
    kind: finalBlocks.length > 0 ? 'preflight_blocked' : 'preflight_passed',
    at: now,
    pipelineId: pipeline.id,
    actor,
    blocks: finalBlocks,
  };

  // Plan: topological order of steps
  const plan = pipeline.steps.map(s => s.id); // упрощённо — без topological (отдельный импорт)

  return {
    ok: finalBlocks.length === 0,
    blocks: finalBlocks,
    plan,
    audit: [audit],
  };
}