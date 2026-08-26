/**
 * PK-WB-E5 — Policy Lens & Evidence Panel.
 *
 * Показывает:
 * 1. Policy Lens — gate-вердикт + разбор правил политики
 * 2. Evidence Chain — цепочку DSL → run → finding → artifact
 *
 * Интегрируется в правую панель EditorWorkbench как вкладка "Evidence".
 */

import { Badge } from '@/components/ui/badge';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileArchive,
  Bug,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { useState } from 'react';
import type {
  EvidenceChainLink,
  StepEvidenceSummary,
  PolicyLensData,
  PolicyRuleStatus,
  EvidenceChainFinding,
} from './evidenceBridge';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PolicyLensProps {
  /** Policy lens data (рассчитано evidenceBridge). */
  policyLens?: PolicyLensData;
  /** Evidence chain для активного шага. */
  activeStepChain?: EvidenceChainLink;
  /** Сводка по активному шагу. */
  activeStepSummary?: StepEvidenceSummary;
  /** Callback: клик по finding — показать детали. */
  onViewFinding?: (finding: EvidenceChainFinding) => void;
  /** Callback: открыть артефакт. */
  onViewArtifact?: (dedupKey: string, kind?: string) => void;
}

// ---------------------------------------------------------------------------
// Policy Lens Card
// ---------------------------------------------------------------------------

function PolicyVerdictBadge({ verdict }: { verdict: PolicyLensData['verdict'] }) {
  const config = {
    passed: {
      icon: <ShieldCheck className="size-4 text-emerald-400" />,
      label: 'PASSED',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      text: 'text-emerald-400',
    },
    warning: {
      icon: <ShieldAlert className="size-4 text-amber-400" />,
      label: 'WARNING',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      text: 'text-amber-400',
    },
    failed: {
      icon: <ShieldX className="size-4 text-red-400" />,
      label: 'FAILED',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      text: 'text-red-400',
    },
  }[verdict];

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${config.bg} ${config.border}`}
    >
      {config.icon}
      <span className={`text-xs font-bold font-mono ${config.text}`}>{config.label}</span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
    HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    LOW: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    INFO: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };
  const color = colors[severity] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';

  return (
    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${color}`}>
      {severity}
    </span>
  );
}

function FindingCard({
  finding,
  onView,
}: {
  finding: EvidenceChainFinding;
  onView?: (f: EvidenceChainFinding) => void;
}) {
  return (
    <div className="group px-3 py-2 border-b border-white/5 hover:bg-white/[0.03] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Bug className="size-3 text-red-400 shrink-0" />
            <span className="text-[11px] text-slate-200 truncate font-medium">
              {finding.title || finding.dedupKey}
            </span>
            {finding.severity && <SeverityBadge severity={finding.severity} />}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="font-mono">{finding.dedupKey.slice(0, 32)}…</span>
            <span>{new Date(finding.observedAt).toLocaleString()}</span>
          </div>
        </div>
        {onView && (
          <button
            type="button"
            onClick={() => onView(finding)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-all shrink-0"
            title="View finding details"
          >
            <Eye className="size-3 text-cyan-400" />
          </button>
        )}
      </div>
    </div>
  );
}

function PolicyRuleRow({ rule }: { rule: PolicyRuleStatus }) {
  const StatusIcon = rule.exceeded ? XCircle : CheckCircle2;
  const statusColor = rule.exceeded ? 'text-red-400' : 'text-emerald-400';

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2">
        <SeverityBadge severity={rule.severity} />
        <span className="text-[11px] text-slate-300">
          max <span className="font-mono text-slate-200">{rule.maxAllowed}</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={`text-[11px] font-mono font-bold ${
            rule.exceeded ? 'text-red-400' : 'text-emerald-400'
          }`}
        >
          {rule.actualCount}
        </span>
        <StatusIcon className={`size-3.5 ${statusColor}`} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step Evidence Chain Card
// ---------------------------------------------------------------------------

function StepEvidenceChainCard({
  chain,
  summary,
}: {
  chain: EvidenceChainLink;
  summary: StepEvidenceSummary;
}) {
  const [expanded, setExpanded] = useState(false);

  const verdictConfig = {
    clean: { icon: <ShieldCheck className="size-3.5 text-emerald-400" />, label: 'Clean', color: 'text-emerald-400' },
    warning: { icon: <AlertTriangle className="size-3.5 text-amber-400" />, label: 'Warning', color: 'text-amber-400' },
    failed: { icon: <ShieldX className="size-3.5 text-red-400" />, label: 'Failed', color: 'text-red-400' },
    untested: { icon: <Shield className="size-3.5 text-slate-500" />, label: 'Untested', color: 'text-slate-500' },
  }[summary.worstVerdict];

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {verdictConfig.icon}
          <span className="text-xs font-semibold text-slate-200 truncate">
            {summary.stepLabel}
          </span>
          <span className={`text-[10px] font-bold ${verdictConfig.color}`}>
            {verdictConfig.label}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {summary.totalFindings > 0 && (
            <Badge variant="destructive" className="text-[9px] font-mono px-1.5 py-0 h-4">
              {summary.totalFindings}
            </Badge>
          )}
          {expanded ? (
            <ChevronDown className="size-3.5 text-slate-500" />
          ) : (
            <ChevronRight className="size-3.5 text-slate-500" />
          )}
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div>
          {/* Verdict reason */}
          <div className="px-3 py-2 bg-white/[0.02] border-b border-white/5">
            <p className="text-[10px] text-slate-400 leading-relaxed">{summary.verdictReason}</p>
            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500">
              <span>{summary.totalRuns} run{summary.totalRuns !== 1 ? 's' : ''}</span>
              <span>•</span>
              <span>{summary.totalFindings} finding{summary.totalFindings !== 1 ? 's' : ''}</span>
              {summary.hasArtifacts && (
                <>
                  <span>•</span>
                  <FileArchive className="size-3 text-cyan-400" />
                  <span className="text-cyan-400">Artifacts</span>
                </>
              )}
            </div>
            {/* Severity breakdown */}
            {Object.keys(summary.severityBreakdown).length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5">
                {Object.entries(summary.severityBreakdown).map(([sev, count]) => (
                  <span key={sev} className="flex items-center gap-0.5">
                    <SeverityBadge severity={sev} />
                    <span className="text-[10px] font-mono text-slate-400">{count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Findings list */}
          {chain.runs.map((run) => (
            <div key={run.runId}>
              {run.findings.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 bg-white/[0.02] border-b border-white/5 flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-500 truncate">
                      Run {run.runId.slice(0, 8)}…
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[9px] font-mono px-1 py-0 h-4 border-slate-700 text-slate-400"
                    >
                      {run.state}
                    </Badge>
                  </div>
                  {run.findings.map((f) => (
                    <FindingCard key={f.dedupKey} finding={f} />
                  ))}
                </div>
              )}

              {/* Artifacts */}
              {run.artifacts.length > 0 && (
                <div className="px-3 py-2 border-b border-white/5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FileArchive className="size-3 text-cyan-400" />
                    <span className="text-[10px] font-semibold text-slate-400">
                      Artifacts ({run.artifacts.length})
                    </span>
                  </div>
                  {run.artifacts.map((art) => (
                    <div
                      key={art.dedupKey}
                      className="flex items-center gap-2 text-[10px] text-slate-500 ml-4"
                    >
                      <span className="font-mono text-slate-400">{art.kind || 'artifact'}</span>
                      {art.checksum && (
                        <span className="font-mono text-slate-600">
                          sha:{art.checksum.slice(0, 12)}…
                        </span>
                      )}
                      <ExternalLink className="size-3 text-slate-600" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main PolicyLens Component
// ---------------------------------------------------------------------------

export function PolicyLens({
  policyLens,
  activeStepChain,
  activeStepSummary,
  onViewFinding,
  onViewArtifact,
}: PolicyLensProps) {
  return (
    <div className="flex flex-col h-full overflow-y-auto" data-testid="evidence-policy-lens">
      {/* ================================================================ */}
      {/* Section 1: Policy Lens */}
      {/* ================================================================ */}
      {policyLens && (
        <div className="p-3 border-b border-white/10">
          <div className="flex items-center gap-1.5 mb-2">
            <Shield className="size-3.5 text-violet-400" />
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Policy Lens
            </h3>
          </div>

          {/* Verdict + reason */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-slate-300">
                {policyLens.policyName}
              </span>
              <PolicyVerdictBadge verdict={policyLens.verdict} />
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">{policyLens.reason}</p>
            {!policyLens.policyActive && (
              <Badge
                variant="outline"
                className="mt-1.5 text-[9px] border-amber-700 text-amber-400"
              >
                Policy Inactive — Bypassed
              </Badge>
            )}
          </div>

          {/* Rule rows + counts */}
          <div className="border border-white/10 rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-white/[0.03] border-b border-white/10">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Severity Thresholds
              </span>
            </div>
            {policyLens.rules.map((rule) => (
              <PolicyRuleRow key={rule.severity} rule={rule} />
            ))}
          </div>

          {/* Total active */}
          <div className="mt-2 text-[10px] text-slate-500 text-right">
            {policyLens.totalActiveFindings} active finding
            {policyLens.totalActiveFindings !== 1 ? 's' : ''} total
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Section 2: Step Evidence Chain */}
      {/* ================================================================ */}
      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Bug className="size-3.5 text-cyan-400" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Evidence Chain
          </h3>
          <span className="text-[10px] font-mono text-slate-600 ml-auto">
            DSL → Run → Finding → Artifact
          </span>
        </div>

        {activeStepChain && activeStepSummary ? (
          <StepEvidenceChainCard chain={activeStepChain} summary={activeStepSummary} />
        ) : (
          <div className="py-8 text-center">
            <FileArchive className="size-8 text-slate-700 mx-auto mb-2" />
            <p className="text-[11px] text-slate-500">
              Select a step to view its evidence chain
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              Run your check first to generate findings and artifacts
            </p>
          </div>
        )}
      </div>
    </div>
  );
}