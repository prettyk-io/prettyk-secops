/**
 * PRETTYK-CI — Proof-Carrying Run (PK-CI-10).
 *
 * По завершении run предъявляет доказательство: кто, зачем, scope, policy,
 * версии инструментов, выполненные шаги, findings, checksum артефактов.
 *
 *   import { buildProofPackage } from '@/ci/proofCarrying';
 */
import type {
  RunRecord,
  PipelineDefinition,
  FindingRecord,
  EvidenceRecord,
} from './types';
import { isTerminal } from './stateMachine';
import type { RunEngine } from './runEngine';

// ═══════════════════════════════════════════════════════════════════════════
// Proof package model
// ═══════════════════════════════════════════════════════════════════════════

export interface ArtifactChecksum {
  artifactId: string;
  /** SHA-256 checksum. */
  checksum: string;
  /** Размер в байтах (если известен). */
  sizeBytes?: number;
}

export interface ProofPackage {
  runId: string;
  /** Полный снимок: кто, зачем, что. */
  actor: string;
  intent: string;
  target: string;
  scope: string[];
  policy: { id: string; name: string; version: string };
  approvalHistory: string[];
  toolVersions: Record<string, string>;
  executedSteps: string[];
  inputsRedacted: Record<string, string>;
  findings: { id: string; severity?: string; dedupKey: string }[];
  artifacts: ArtifactChecksum[];
  provenance: {
    pipelineId: string;
    irVersion: string;
    createdAt: string;
    updatedAt: string;
    timeline: { from: string; to: string; at: string }[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Checksum (deterministic — stable для тестов и replay)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Простой детерминированный checksum (не криптографический — для spike).
 * В production → SHA-256 реальных артефактов.
 */
export function checksumOf(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `sha256:${hex}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Proof builder
// ═══════════════════════════════════════════════════════════════════════════

export interface ProofInput {
  run: RunRecord;
  findings: FindingRecord[];
  evidence: EvidenceRecord[];
  /** Intent: человекочитаемое описание цели проверки. */
  intent?: string;
}

export function buildProofPackage(input: ProofInput): ProofPackage {
  const { run, findings, evidence, intent } = input;
  const snap = run.pipelineSnapshot;

  // Scope → читабельный список
  const scopeList = snap?.scope.rules.flatMap(r =>
    r.allowedHosts.map(h => `${h}${r.allowedPaths?.[0] ?? ''}`),
  ) ?? [];

  // Executed steps — из timeline (переходы в running/complete)
  const executedSteps = run.timeline
    .filter(t => t.event === 'acquire' || t.event === 'complete')
    .map(t => t.event);

  // Findings → компактный список
  const findingsList = findings.map(f => ({
    id: (f as any).id ?? f.dedupKey,
    severity: (f as any).severity,
    dedupKey: f.dedupKey,
  }));

  // Evidence → checksums
  const artifacts: ArtifactChecksum[] = evidence.map(e => ({
    artifactId: e.dedupKey,
    checksum: (e as any).checksum ?? checksumOf(JSON.stringify(e.payload)),
  }));

  return {
    runId: run.id,
    actor: run.actor,
    intent: intent ?? snap?.name ?? run.pipelineId,
    target: `${snap?.target.name ?? 'unknown'} (${snap?.target.id ?? '?'})`,
    scope: scopeList,
    policy: {
      id: run.policySnapshot.id,
      name: run.policySnapshot.name,
      version: run.policySnapshot.version,
    },
    approvalHistory: run.timeline
      .filter(t => t.event === 'approve')
      .map(t => `${t.at}: ${t.reason ?? 'approved'}`),
    toolVersions: run.toolVersions,
    executedSteps: [...new Set(executedSteps)],
    inputsRedacted: redactInputs(snap?.steps ?? []),
    findings: findingsList,
    artifacts,
    provenance: {
      pipelineId: run.pipelineId,
      irVersion: snap?.irVersion ?? 'unknown',
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      timeline: run.timeline.map(t => ({ from: t.from, to: t.to, at: t.at })),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Input redaction (только ссылки, никогда raw secret)
// ═══════════════════════════════════════════════════════════════════════════

const SECRET_KEY_PATTERN = /(password|secret|token|api[_-]?key|key|auth|credential|bearer|cookie)/i;

function redactInputs(steps: PipelineDefinition['steps']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const step of steps) {
    for (const [key, value] of Object.entries(step.inputs ?? {})) {
      if (SECRET_KEY_PATTERN.test(key)) {
        out[`${step.id}.${key}`] = '***';
      } else {
        out[`${step.id}.${key}`] = value;
      }
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Convenience: собрать proof из engine
// ═══════════════════════════════════════════════════════════════════════════

export function proofFromEngine(engine: RunEngine, runId: string, intent?: string): ProofPackage | null {
  const run = engine.getRun(runId);
  if (!run) return null;
  if (!isTerminal(run.state)) return null; // proof только для завершённых

  const findings = engine.listFindings(runId);
  const evidence = engine.listEvidence(runId);
  return buildProofPackage({ run, findings, evidence, intent });
}
