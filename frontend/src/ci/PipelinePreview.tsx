/**
 * PK-TRM-9: PipelinePreview — code↔graph preview до запуска.
 *
 * Показывает «Что реально произойдёт после нажатия Run?»:
 *   — steps и dependencies
 *   — target и scope
 *   — required permissions/approvals
 *   — tools и версии (snapshot)
 *   — policy/gate
 *   — resource profile (приблизительно)
 *
 * Потребляет PipelineDefinition из ci/types + toGraph из ci/codec.
 */
import { useMemo } from 'react';
import {
  Box, Typography, Paper, Chip, Button, Alert, LinearProgress,
} from '@mui/material';
import {
  PlayArrow, Shield, Gavel, AccountTree, Speed, CheckCircle,
  Security, BugReport, Storage, Timer,
} from '@mui/icons-material';
import type { PipelineDefinition, StepNode, StepEdge } from '../ci/types';
import { toGraph } from '../ci/codec';

function StepCard({ step, edges }: { step: StepNode; edges: StepEdge[] }) {
  const deps = edges.filter((e) => e.to === step.id);
  const hasApproval = (step.approvals?.length ?? 0) > 0;

  return (
    <Paper sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'flex-start', gap: 2, borderLeft: `3px solid ${step.component.name === 'fuzzer' ? '#f59e0b' : step.component.name === 'gate' ? '#a855f7' : '#38bdf8'}` }}>
      <Box sx={{
        width: 28, height: 28, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: step.component.name === 'fuzzer' ? 'rgba(245,158,11,0.15)' : 'rgba(56,189,248,0.15)',
        flexShrink: 0,
      }}>
        {step.component.name === 'fuzzer' ? <BugReport sx={{ fontSize: 16, color: '#f59e0b' }} />
          : step.component.name === 'gate' ? <Gavel sx={{ fontSize: 16, color: '#a855f7' }} />
          : step.component.name.includes('scan') ? <Security sx={{ fontSize: 16, color: '#38bdf8' }} />
          : <PlayArrow sx={{ fontSize: 16, color: '#38bdf8' }} />}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{step.label || step.component.name}</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 10, fontFamily: 'JetBrains Mono' }}>
          {step.component.name}@{step.component.version}
          {step.component.digest ? ` (${step.component.digest.slice(0, 8)})` : ''}
        </Typography>
        {deps.length > 0 && (
          <Box sx={{ mt: 0.5 }}>
            <Typography sx={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.3 }}>
              Dependencies ({deps.map((d) => d.kind).join(', ')})
            </Typography>
            {deps.map((d, i) => (
              <Chip key={i} label={`${d.from} — ${d.kind}`} size="small" sx={{ color: '#64748b', background: 'rgba(100,116,139,0.08)', fontSize: 8, mr: 0.5, mb: 0.5 }} />
            ))}
          </Box>
        )}
        {hasApproval && (
          <Box sx={{ mt: 0.5 }}>
            <Chip icon={<Shield sx={{ fontSize: '10px !important' }} />} label="Requires Approval" size="small" sx={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', fontSize: 8 }} />
          </Box>
        )}
        {step.timeoutMs && (
          <Chip icon={<Timer sx={{ fontSize: '10px !important' }} />} label={`Timeout: ${step.timeoutMs}ms`} size="small" sx={{ color: '#94a3b8', background: 'rgba(148,163,184,0.08)', fontSize: 8, mt: 0.5 }} />
        )}
      </Box>
    </Paper>
  );
}

export interface PipelinePreviewProps {
  pipeline: PipelineDefinition;
  onRun?: () => void;
}

export function PipelinePreview({ pipeline, onRun }: PipelinePreviewProps) {
  const graph = useMemo(() => toGraph(pipeline), [pipeline]);

  const totalSteps = pipeline.steps.length;
  const approvalsRequired = pipeline.steps.reduce((acc, s) => acc + (s.approvals?.length ?? 0), 0);
  const hasFuzzer = pipeline.steps.some((s) => s.component.name === 'fuzzer');
  const hasScan = pipeline.steps.some((s) => s.component.name.includes('scan') || s.component.name.includes('crawl'));

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>{pipeline.name}</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 11, fontFamily: 'JetBrains Mono' }}>
            {pipeline.id} · IR v{pipeline.irVersion}
          </Typography>
        </Box>
        {onRun && (
          <Button variant="contained" startIcon={<PlayArrow />} onClick={onRun} sx={{ bgcolor: '#38bdf8', color: '#080c16', fontWeight: 700, fontSize: 12 }}>
            Run Pipeline
          </Button>
        )}
      </Box>

      {/* KPI row */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Chip icon={<AccountTree sx={{ fontSize: '14px !important' }} />} label={`${totalSteps} steps`} sx={{ color: '#38bdf8', background: 'rgba(56,189,248,0.08)', fontWeight: 600, fontSize: 11 }} />
        <Chip icon={<Shield sx={{ fontSize: '14px !important' }} />} label={`${pipeline.requiredCapabilities.length} capabilities`} sx={{ color: '#a855f7', background: 'rgba(168,85,247,0.08)', fontWeight: 600, fontSize: 11 }} />
        <Chip icon={<Gavel sx={{ fontSize: '14px !important' }} />} label={`Policy: ${pipeline.policy.name} v${pipeline.policy.version}`} sx={{ color: '#f59e0b', background: 'rgba(245,158,11,0.08)', fontWeight: 600, fontSize: 11 }} />
        {approvalsRequired > 0 && (
          <Chip icon={<CheckCircle sx={{ fontSize: '14px !important' }} />} label={`${approvalsRequired} approvals`} sx={{ color: '#22c55e', background: 'rgba(34,197,94,0.08)', fontWeight: 600, fontSize: 11 }} />
        )}
        {pipeline.timeoutMs && (
          <Chip icon={<Timer sx={{ fontSize: '14px !important' }} />} label={`${pipeline.timeoutMs}ms timeout`} sx={{ color: '#94a3b8', background: 'rgba(148,163,184,0.08)', fontWeight: 600, fontSize: 11 }} />
        )}
      </Box>

      {/* Target + scope */}
      <Paper sx={{ p: 2, mb: 2, borderRadius: 2, background: 'rgba(56,189,248,0.04)' }}>
        <Typography sx={{ fontWeight: 600, fontSize: 12, mb: 1 }}>Target & Scope</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip label={`Target: ${pipeline.target.name} (${pipeline.target.id})`} size="small" sx={{ fontSize: 10, color: '#38bdf8', background: 'rgba(56,189,248,0.1)' }} />
          {pipeline.target.environment && <Chip label={`Env: ${pipeline.target.environment}`} size="small" sx={{ fontSize: 10, color: '#a855f7', background: 'rgba(168,85,247,0.1)' }} />}
          {pipeline.scope.rules.map((r, i) => (
            <Chip key={i} label={`${r.allowedHosts.join(', ')} (${r.allowedSchemes?.join(',') ?? 'any'})`} size="small" sx={{ fontSize: 10, color: '#94a3b8', background: 'rgba(148,163,184,0.08)', fontFamily: 'JetBrains Mono' }} />
          ))}
        </Box>
      </Paper>

      {/* Capabilities */}
      {pipeline.requiredCapabilities.length > 0 && (
        <Paper sx={{ p: 2, mb: 2, borderRadius: 2, background: 'rgba(168,85,247,0.04)' }}>
          <Typography sx={{ fontWeight: 600, fontSize: 12, mb: 1 }}>Required Capabilities</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {pipeline.requiredCapabilities.map((c) => (
              <Chip key={c} icon={<Shield sx={{ fontSize: '10px !important' }} />} label={c} size="small" sx={{ fontSize: 9, color: '#a855f7', background: 'rgba(168,85,247,0.1)' }} />
            ))}
          </Box>
        </Paper>
      )}

      {/* Steps */}
      <Typography sx={{ fontWeight: 600, fontSize: 12, mb: 1.5 }}>Pipeline Steps</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {pipeline.steps.map((step) => (
          <StepCard key={step.id} step={step} edges={pipeline.edges} />
        ))}
      </Box>

      {/* Resource profile (приблизительно) */}
      <Paper sx={{ p: 2, mt: 2, borderRadius: 2, background: 'rgba(34,197,94,0.04)' }}>
        <Typography sx={{ fontWeight: 600, fontSize: 12, mb: 1 }}>
          <Speed sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
          Approximate Resource Profile
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip label={`Steps: ${totalSteps}`} size="small" sx={{ fontSize: 10, color: '#38bdf8' }} />
          <Chip label={`Scan: ${hasScan ? 'Yes' : 'No'}`} size="small" sx={{ fontSize: 10, color: hasScan ? '#38bdf8' : '#64748b' }} />
          <Chip label={`Fuzzing: ${hasFuzzer ? 'Yes' : 'No'}`} size="small" sx={{ fontSize: 10, color: hasFuzzer ? '#f59e0b' : '#64748b' }} />
          <Chip label={`Gate: Yes`} size="small" sx={{ fontSize: 10, color: '#a855f7' }} />
          {pipeline.qualityGate && <Chip label={`Quality Gate: ${pipeline.qualityGate}`} size="small" sx={{ fontSize: 10, color: '#22c55e' }} />}
        </Box>
      </Paper>
    </Box>
  );
}