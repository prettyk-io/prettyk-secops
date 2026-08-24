/** F-1: OverviewView — ADM-PURE-1: IB posture overview with KPI cards, active runs, findings. */
import { useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, Chip, LinearProgress, Tooltip,
} from '@mui/material';
import {
  TrendingUp, BugReport, Shield, Speed, CheckCircle, Cancel, AccessTime, WarningAmber, LocalActivity,
} from '@mui/icons-material';
import {
  useSecopsStore, severityColor, runStatusColor, gateVerdictColor,
  type SeverityKey, type SecOpsFinding,
} from '../useSecopsStore';

function KpiCard({ label, value, icon, color, subtitle }: { label: string; value: number | string; icon: React.ReactNode; color: string; subtitle?: string }) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 0.5, height: '100%', borderTop: `3px solid ${color}` }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography sx={{ color: 'text.secondary', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</Typography>
        <Box sx={{ color, opacity: 0.8 }}>{icon}</Box>
      </Box>
      <Typography sx={{ fontSize: 28, fontWeight: 800, fontFamily: 'JetBrains Mono', color: 'text.primary', lineHeight: 1.1 }}>{value}</Typography>
      {subtitle && <Typography sx={{ color: 'text.secondary', fontSize: 10, mt: 0.5 }}>{subtitle}</Typography>}
    </Paper>
  );
}

function SeverityBar({ findings }: { findings: SecOpsFinding[] }) {
  const counts = useMemo(() => {
    const c: Record<SeverityKey, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    findings.filter((f) => f.status === 'active').forEach((f) => { c[f.severity] = (c[f.severity] ?? 0) + 1; });
    return c;
  }, [findings]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  return (
    <Box sx={{ display: 'flex', gap: 0.5, height: 8, borderRadius: 1, overflow: 'hidden' }}>
      {(['critical', 'high', 'medium', 'low', 'info'] as SeverityKey[]).map((sev) =>
        counts[sev] > 0 ? (
          <Tooltip key={sev} title={`${sev}: ${counts[sev]}`}>
            <Box sx={{ width: `${(counts[sev] / total) * 100}%`, background: severityColor(sev), minWidth: 4 }} />
          </Tooltip>
        ) : null,
      )}
    </Box>
  );
}

function ActiveRunCard({ appName, targetUrl, status, policyName, startedAt }: { appName: string; targetUrl: string; status: string; policyName: string; startedAt: string }) {
  const isRunning = status === 'running';
  return (
    <Paper sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, border: `1px solid ${runStatusColor(status as any)}40` }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: runStatusColor(status as any), boxShadow: isRunning ? `0 0 8px ${runStatusColor(status as any)}` : 'none', animation: isRunning ? 'pk-led-pulse 1s ease-in-out infinite' : 'none', flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{appName}</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 11, fontFamily: 'JetBrains Mono' }}>{targetUrl} · {policyName}</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 10, mt: 0.3 }}>{new Date(startedAt).toLocaleString('ru-RU')}</Typography>
      </Box>
      <Chip label={isRunning ? 'Running' : status} size="small" sx={{ color: runStatusColor(status as any), background: `${runStatusColor(status as any)}15`, fontWeight: 600, fontSize: 10 }} />
    </Paper>
  );
}

export default function OverviewView() {
  const apps = useSecopsStore((s) => s.apps);
  const runs = useSecopsStore((s) => s.runs);
  const findings = useSecopsStore((s) => s.findings);

  const activeRuns = runs.filter((r) => r.status === 'running');
  const activeFindings = findings.filter((f) => f.status === 'active');
  const criticalHigh = activeFindings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  const lastGateCounts = useMemo(() => {
    const c = { pass: 0, watch: 0, fail: 0 };
    runs.forEach((r) => { if (r.gate !== 'unknown' && c[r.gate] !== undefined) c[r.gate]++; });
    return c;
  }, [runs]);

  const totalTargets = apps.reduce((acc, a) => acc + a.targets.length, 0);

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>IB Posture Overview</Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 12, mb: 3 }}>
        Applications, active scans, open findings and gate verdicts across your security perimeter.
      </Typography>

      {/* KPI cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <KpiCard label="Active Runs" value={activeRuns.length} icon={<Speed sx={{ fontSize: 20 }} />} color="#38bdf8" subtitle={activeRuns.length > 0 ? 'in progress' : 'idle'} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <KpiCard label="Open Critical/High" value={criticalHigh.length} icon={<WarningAmber sx={{ fontSize: 20 }} />} color={criticalHigh.length > 0 ? '#ef4444' : '#22c55e'} subtitle={criticalHigh.length === 0 ? 'clean' : `${criticalHigh.length} need triage`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <KpiCard label="Targets" value={totalTargets} icon={<Shield sx={{ fontSize: 20 }} />} color="#6366f1" subtitle={`${apps.length} apps`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <KpiCard label="Gate Pass Rate" value={`${lastGateCounts.pass}/${lastGateCounts.pass + lastGateCounts.fail + lastGateCounts.watch || 0}`} icon={<CheckCircle sx={{ fontSize: 20 }} />} color="#22c55e" subtitle={`${lastGateCounts.watch} watch · ${lastGateCounts.fail} fail`} />
        </Grid>
      </Grid>

      {/* Severity breakdown bar */}
      <Paper sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 1 }}>Active Findings Breakdown</Typography>
        <SeverityBar findings={findings} />
        <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
          {(['critical', 'high', 'medium', 'low', 'info'] as SeverityKey[]).map((sev) => {
            const cnt = activeFindings.filter((f) => f.severity === sev).length;
            return (
              <Typography key={sev} sx={{ fontSize: 10, color: severityColor(sev), fontWeight: 600, fontFamily: 'JetBrains Mono' }}>
                {sev[0]!.toUpperCase() + sev.slice(1)}: {cnt}
              </Typography>
            );
          })}
        </Box>
      </Paper>

      {/* Active runs */}
      <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 1.5 }}>Active Runs</Typography>
      {activeRuns.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <Speed sx={{ fontSize: 40, color: 'text.secondary', opacity: 0.3, mb: 1 }} />
          <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>No active runs. All scans are idle.</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {activeRuns.map((r) => <ActiveRunCard key={r.id} {...r} />)}
        </Box>
      )}
    </Box>
  );
}